import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { TAG_RULES } from "./guest-intelligence";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import type { EmailProviderAdapter, NormalizedEventType } from "@/server/marketing/email-provider";
import type { Prisma } from "@prisma/client";
import { BlockSchema, type Block } from "@/lib/campaign-blocks";
import {
  compileBlocksToHtml,
  resolveGlobalVariables,
  resolveTestVariables,
  toBrevoMergeTags,
} from "@/lib/campaign-blocks-compiler";
import { PREVIEW_UNSUBSCRIBE_ID, signUnsubscribeToken } from "@/lib/unsubscribe-token";
import { enqueueJob, type JobOutcome, type JobRef } from "@/server/jobs/queue";
import { createNotification } from "@/server/notifications";

const adapter: EmailProviderAdapter = brevoAdapter;

/**
 * I criteri di un segmento.
 *
 * `minTotalSpend` è stato rimosso: filtrava `Guest.totalSpend`, un campo che
 * nessuna parte del codice aggiorna. Una campagna «alto spendenti» avrebbe
 * colpito valori messi dal seed, che è peggio di non poterla fare. Tornerà
 * quando ci saranno ordini o incassi collegati.
 *
 * `minTotalVisits`, `inactiveDays` e `minNoShowCount` invece ora sono
 * affidabili: i contatori vengono riallineati alle prenotazioni vere
 * (vedi server/guest-intelligence.ts, refreshGuestStats).
 */
/**
 * Le etichette calcolate su cui si può costruire un segmento.
 *
 * Sono un sottoinsieme di quelle che compaiono sulla scheda ospite: qui stanno
 * solo le esprimibili come condizione sul database, perché un segmento deve
 * risolversi in una query e non nel caricare tutti i clienti per calcolarli uno
 * per uno. «Viene in gruppo» per esempio richiede la media dei coperti, che non
 * è una colonna: resta sulla scheda e non fra i segmenti, finché non ci sarà un
 * valore precalcolato.
 *
 * Funzionano perché i contatori sono veri: fino a settembre 2026
 * `totalVisits`, `lastVisitAt` e `noShowCount` non li aggiornava nessuno.
 * Vedi server/guest-intelligence.ts.
 */
export const AUDIENCE_TAGS = {
  abituali: "Clienti abituali",
  a_rischio: "A rischio di perderli",
  inattivi: "Inattivi",
  prima_volta: "Venuti una volta sola",
  assenze: "Con assenze ripetute",
  mai_venuti: "Mai venuti",
} as const;

export type AudienceTag = keyof typeof AUDIENCE_TAGS;

export const SegmentFilter = z.object({
  tags: z.array(z.string()).optional(),
  /** Un'etichetta calcolata: vedi AUDIENCE_TAGS. */
  audienceTag: z.enum(["abituali", "a_rischio", "inattivi", "prima_volta", "assenze", "mai_venuti"]).optional(),
  loyaltyTier: z.enum(["NEW", "REGULAR", "VIP", "AMBASSADOR"]).optional(),
  minTotalVisits: z.number().int().min(0).optional(),
  inactiveDays: z.number().int().min(0).optional(),
  minNoShowCount: z.number().int().min(0).optional(),
  birthdayThisMonth: z.boolean().optional(),
  hasFutureBooking: z.boolean().optional(),
  noFutureBooking: z.boolean().optional(),
  hadCancelledBooking: z.boolean().optional(),
});
export type SegmentFilterType = z.infer<typeof SegmentFilter>;

// Solo `name` è obbligatorio: il wizard crea una bozza minimale dopo lo Step 1
// e completa gli altri campi con PATCH incrementali nei passi successivi.
export const CampaignInput = z.object({
  name: z.string().min(1),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  previewText: z.string().optional(),
  contentBlocks: z.array(BlockSchema).optional(),
  segment: SegmentFilter.optional(),
});
export type CampaignInputType = z.infer<typeof CampaignInput>;

export function getRequestOrigin(): string {
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function listCampaigns(venueId: string) {
  return db.campaign.findMany({ where: { venueId }, orderBy: { createdAt: "desc" } });
}

export async function getCampaign(venueId: string, id: string) {
  return db.campaign.findFirst({ where: { id, venueId } });
}

export async function createCampaign(venueId: string, raw: unknown) {
  const data = CampaignInput.parse(raw);
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { brandAccent: true } });
  return db.campaign.create({
    data: {
      venueId,
      name: data.name,
      subject: data.subject,
      body: data.contentBlocks
        ? compileBlocksToHtml(data.contentBlocks as Block[], venue.brandAccent ?? undefined)
        : data.body,
      previewText: data.previewText,
      contentBlocks: data.contentBlocks as unknown as Prisma.InputJsonValue,
      segment: (data.segment ?? {}) as Prisma.InputJsonValue,
      channel: "EMAIL",
      status: "DRAFT",
    },
  });
}

export async function updateCampaign(venueId: string, id: string, raw: unknown) {
  const data = CampaignInput.partial().parse(raw);
  const existing = await db.campaign.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  if (existing.status !== "DRAFT") throw new Error("campaign_not_editable");
  // Quando arrivano contentBlocks, il body compilato viene sempre ricalcolato qui:
  // contentBlocks resta l'unica fonte di verità, body è solo una cache derivata,
  // così i due non possono mai disallinearsi anche se il client invia un body stantio.
  const venue =
    data.contentBlocks !== undefined
      ? await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { brandAccent: true } })
      : null;
  return db.campaign.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.previewText !== undefined && { previewText: data.previewText }),
      ...(data.contentBlocks !== undefined && {
        contentBlocks: data.contentBlocks as unknown as Prisma.InputJsonValue,
        body: compileBlocksToHtml(data.contentBlocks as Block[], venue?.brandAccent ?? undefined),
      }),
      ...(data.contentBlocks === undefined && data.body !== undefined && { body: data.body }),
      ...(data.segment !== undefined && { segment: data.segment as Prisma.InputJsonValue }),
    },
  });
}

/**
 * Costruisce il where-clause dai soli filtri di segmento, SENZA i vincoli
 * marketingOptIn/email (usato sia da resolveSegment che da previewSegment per
 * poter calcolare il breakdown "quanti esclusi per consenso/email mancante").
 * Le condizioni sulla relazione bookings vengono accumulate in un array e
 * composte via AND invece di sovrascrivere `where.bookings` più volte — è
 * l'unico modo corretto quando più filtri booking-based sono attivi insieme.
 */
function buildSegmentWhere(venueId: string, segment: SegmentFilterType): Prisma.GuestWhereInput {
  const where: Prisma.GuestWhereInput = { venueId };
  const and: Prisma.GuestWhereInput[] = [];

  if (segment.tags && segment.tags.length > 0) {
    where.tags = { hasSome: segment.tags };
  }

  // Le etichette calcolate, tradotte nelle stesse soglie che usa la scheda
  // ospite (TAG_RULES): un cliente etichettato «a rischio» nella sua scheda
  // deve finire nel segmento «a rischio», altrimenti sono due verità diverse.
  if (segment.audienceTag) {
    const giorni = (n: number) => new Date(Date.now() - n * 86_400_000);
    const aRischio = giorni(TAG_RULES.atRiskDays);
    const inattivo = giorni(TAG_RULES.inactiveDays);

    switch (segment.audienceTag) {
      case "abituali":
        and.push({ totalVisits: { gte: TAG_RULES.regularVisits }, lastVisitAt: { gt: aRischio } });
        break;
      case "a_rischio":
        // Era abituale e ha smesso, ma non da tanto da essere perso.
        and.push({
          totalVisits: { gte: TAG_RULES.regularVisits },
          lastVisitAt: { lte: aRischio, gt: inattivo },
        });
        break;
      case "inattivi":
        and.push({ totalVisits: { gt: 0 }, lastVisitAt: { lte: inattivo } });
        break;
      case "prima_volta":
        and.push({ totalVisits: 1 });
        break;
      case "assenze":
        and.push({ noShowCount: { gte: 2 } });
        break;
      case "mai_venuti":
        and.push({ totalVisits: 0 });
        break;
    }
  }
  if (segment.loyaltyTier) {
    where.loyaltyTier = segment.loyaltyTier;
  }
  if (segment.minTotalVisits !== undefined) {
    where.totalVisits = { gte: segment.minTotalVisits };
  }
  if (segment.inactiveDays !== undefined) {
    const threshold = new Date(Date.now() - segment.inactiveDays * 24 * 60 * 60 * 1000);
    and.push({ OR: [{ lastVisitAt: { lte: threshold } }, { lastVisitAt: null }] });
  }
  if (segment.minNoShowCount !== undefined) {
    where.noShowCount = { gte: segment.minNoShowCount };
  }
  if (segment.hasFutureBooking) {
    and.push({ bookings: { some: { startsAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } } });
  }
  if (segment.noFutureBooking) {
    and.push({ bookings: { none: { startsAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } } });
  }
  if (segment.hadCancelledBooking) {
    and.push({ bookings: { some: { status: "CANCELLED" } } });
  }
  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

/** birthdayThisMonth non è esprimibile come predicato Prisma portabile: si applica
 * come filtro finale in JS sui risultati già ridotti dagli altri filtri — corretto e
 * semplice ai volumi di guest per-venue di questo SaaS (a scale molto più grandi si
 * passerebbe a $queryRaw con EXTRACT(MONTH FROM birthday)). */
function applyBirthdayThisMonthFilter<T extends { birthday: Date | null }>(
  guests: T[],
  segment: SegmentFilterType
): T[] {
  if (!segment.birthdayThisMonth) return guests;
  const currentMonth = new Date().getMonth();
  return guests.filter((g) => g.birthday && g.birthday.getMonth() === currentMonth);
}

/**
 * marketingOptIn ed email non-null sono vincoli imposti sempre, in AND con i
 * filtri scelti dal ristoratore — non delegabili alla UI/segment builder.
 */
export async function resolveSegment(venueId: string, segment: SegmentFilterType) {
  const where = buildSegmentWhere(venueId, segment);
  where.marketingOptIn = true;
  where.email = { not: null };
  const guests = await db.guest.findMany({ where });
  return applyBirthdayThisMonthFilter(guests, segment);
}

export interface SegmentPreviewResult {
  totalMatchingFilters: number;
  excludedNoEmail: number;
  excludedNoConsent: number;
  finalRecipients: number;
}

/**
 * Esegue i filtri due volte: una volta senza i vincoli obbligatori di consenso/email
 * (per sapere quanti clienti corrispondono ai soli filtri scelti) e una volta con
 * essi (= identico a resolveSegment), per calcolare un breakdown reale delle
 * esclusioni. Un guest senza email ha priorità come motivo di esclusione rispetto
 * al consenso mancante, così le due categorie non si sovrappongono mai.
 * Non esiste un contatore "duplicati rimossi": i guest sono già righe uniche in DB,
 * quindi il concetto non si applica — va omesso o etichettato onestamente in UI,
 * mai mostrato come 0 finto che lasci intendere un dedup avvenuto.
 */
export async function previewSegment(venueId: string, segment: SegmentFilterType): Promise<SegmentPreviewResult> {
  const where = buildSegmentWhere(venueId, segment);
  const allMatching = applyBirthdayThisMonthFilter(
    await db.guest.findMany({ where, select: { id: true, email: true, marketingOptIn: true, birthday: true } }),
    segment
  );

  const totalMatchingFilters = allMatching.length;
  const excludedNoEmail = allMatching.filter((g) => !g.email).length;
  const excludedNoConsent = allMatching.filter((g) => g.email && !g.marketingOptIn).length;
  const finalRecipients = allMatching.filter((g) => g.email && g.marketingOptIn).length;

  return { totalMatchingFilters, excludedNoEmail, excludedNoConsent, finalRecipients };
}

/**
 * L'invio di una campagna non sta dentro una richiesta HTTP.
 *
 * Prima ci stava: `prepareRecipients` chiamava Brevo una volta per ogni
 * destinatario dentro il clic del ristoratore. Con trenta clienti funzionava,
 * con trecento la richiesta scadeva a metà — parte dei contatti sincronizzati,
 * nessun invio partito, nessun errore mostrato, e la campagna ferma in uno
 * stato che nessuno sapeva leggere.
 *
 * Ora il clic mette in coda un lavoro e risponde subito. Il lavoro sincronizza
 * i contatti **a lotti**, cedendo il turno fra un lotto e l'altro, e solo
 * quando ha finito consegna la campagna al fornitore.
 */

/** Quanti contatti si sincronizzano per giro. */
const LOTTO_CONTATTI = 25;

export const CampaignSendPayload = z.object({
  venueId: z.string(),
  campaignId: z.string(),
  /**
   * L'indirizzo pubblico dell'applicazione, catturato quando il ristoratore
   * clicca. Il lavoro girerà dentro la richiesta del cron, dove l'host non è
   * quello da cui è arrivata la richiesta: i link dentro l'email si
   * costruiscono con questo, non con quello che si trova al momento.
   */
  origin: z.string(),
  /** Quando programmare l'invio presso il fornitore, se programmato. */
  at: z.string().optional(),
  /** Da quando i contatti sincronizzati valgono come sincronizzati. */
  enqueuedAt: z.string(),
  /**
   * Dove è arrivato il lavoro. Serve a una cosa sola, ma decisiva: se il
   * processo muore **dopo** aver detto al fornitore di inviare, al giro dopo
   * non si reinvia alla cieca.
   */
  step: z.enum(["sync", "handoff"]).optional(),
});
export type CampaignSendPayloadType = z.infer<typeof CampaignSendPayload>;

async function requireDraftCampaign(venueId: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) throw new Error("not_found");
  if (campaign.status !== "DRAFT") throw new Error("campaign_already_sent");
  return campaign;
}

/**
 * Mette in coda l'invio. Restituisce la campagna nello stato nuovo, così
 * l'interfaccia può dire «in invio» invece di «inviata» — che sarebbe una
 * bugia finché il lavoro non è finito.
 */
async function queueCampaign(venueId: string, campaignId: string, at?: Date) {
  const campaign = await requireDraftCampaign(venueId, campaignId);
  const segment = (campaign.segment as SegmentFilterType | null) ?? {};
  const { finalRecipients } = await previewSegment(venueId, segment);
  if (finalRecipients === 0) throw new Error("no_recipients");

  const payload: CampaignSendPayloadType = {
    venueId,
    campaignId,
    origin: getRequestOrigin(),
    enqueuedAt: new Date().toISOString(),
    step: "sync",
    ...(at && { at: at.toISOString() }),
  };

  await enqueueJob({
    kind: "campaign.send",
    venueId,
    payload,
    // Due clic sul pulsante non fanno partire due invii.
    dedupeKey: chiaveLavoro(campaignId),
    maxAttempts: 3,
  });

  return db.campaign.update({
    where: { id: campaign.id },
    data: at ? { status: "SCHEDULED", scheduledAt: at } : { status: "SENDING" },
  });
}

export function sendCampaignNow(venueId: string, campaignId: string) {
  return queueCampaign(venueId, campaignId);
}

export function scheduleCampaign(venueId: string, campaignId: string, at: Date) {
  return queueCampaign(venueId, campaignId, at);
}

async function createMessageLogs(campaignId: string, venueId: string, guests: { id: string; email: string | null }[]) {
  await db.messageLog.createMany({
    data: guests
      .filter((g) => g.email)
      .map((g) => ({
        id: crypto.randomUUID(),
        venueId,
        campaignId,
        guestId: g.id,
        channel: "EMAIL" as const,
        toAddress: g.email!,
        status: "QUEUED" as const,
      })),
  });
}

/**
 * Risolve i token globali di campagna ({{RESTAURANT_NAME}}, {{BOOKING_LINK}} — stesso
 * valore per ogni destinatario) e mappa i token per-destinatario rimanenti alla
 * sintassi di merge-tag di Brevo, che li risolverà lui stesso al momento dell'invio
 * reale usando gli attributi contatto sincronizzati in syncContact/createContact.
 */
async function compileHtmlForBrevoSend(venueId: string, body: string, origin: string): Promise<string> {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });
  const withGlobals = resolveGlobalVariables(body, {
    restaurantName: venue.name,
    bookingLink: `${origin}/book?venue=${venueId}`,
  });
  return toBrevoMergeTags(withGlobals, origin);
}

async function segnaNonRiuscita(campaignId: string, venueId: string, nome: string, motivo: string) {
  await db.campaign.update({ where: { id: campaignId }, data: { status: "FAILED" } });
  await createNotification(venueId, {
    kind: "AUTOMATION_FAILED",
    title: `Campagna non inviata: ${nome}`,
    body: motivo,
    link: `/campaigns/${campaignId}`,
  });
}

/** La chiave del lavoro di invio di una campagna: una sola, per campagna. */
function chiaveLavoro(campaignId: string) {
  return `campaign.send:${campaignId}`;
}

export type CampaignSendProgress = {
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  /** Quanti destinatari sono già stati preparati presso il fornitore. */
  preparati: number;
  totale: number;
  tentativi: number;
  ultimoErrore: string | null;
  jobId: string;
};

/**
 * A che punto è l'invio.
 *
 * Serve perché «in invio» da solo non basta: dopo due minuti chi guarda vuole
 * sapere se sta succedendo qualcosa. Il numero viene dai contatti davvero
 * sincronizzati, non da una percentuale finta.
 */
export async function getCampaignSendProgress(
  venueId: string,
  campaignId: string
): Promise<CampaignSendProgress | null> {
  const job = await db.backgroundJob.findUnique({ where: { dedupeKey: chiaveLavoro(campaignId) } });
  if (!job || job.venueId !== venueId) return null;

  const payload = CampaignSendPayload.safeParse(job.payload);
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  const segment = (campaign?.segment as SegmentFilterType | null) ?? {};
  const guests = await resolveSegment(venueId, segment);

  const preparati = payload.success
    ? await db.guestProviderLink.count({
        where: {
          venueId,
          provider: "brevo",
          guestId: { in: guests.map((g) => g.id) },
          syncedAt: { gte: new Date(payload.data.enqueuedAt) },
        },
      })
    : 0;

  return {
    status: job.status,
    preparati: job.status === "DONE" ? guests.length : preparati,
    totale: guests.length,
    tentativi: job.attempts,
    ultimoErrore: job.lastError,
    jobId: job.id,
  };
}

/**
 * Riprova un invio non riuscito.
 *
 * Con un limite non negoziabile: se la campagna era già stata consegnata al
 * fornitore (`providerId` valorizzato) non si riprova da qui. Riprovare
 * significherebbe rischiare di scrivere due volte agli stessi clienti, e
 * quello è un danno che non si annulla.
 */
export async function retryCampaignSend(venueId: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) throw new Error("not_found");
  if (campaign.status !== "FAILED") throw new Error("conflict");
  if (campaign.providerId) throw new Error("campaign_already_handed_over");

  const payload: CampaignSendPayloadType = {
    venueId,
    campaignId,
    origin: getRequestOrigin(),
    enqueuedAt: new Date().toISOString(),
    step: "sync",
    ...(campaign.scheduledAt && campaign.scheduledAt > new Date() && { at: campaign.scheduledAt.toISOString() }),
  };

  await enqueueJob({
    kind: "campaign.send",
    venueId,
    payload,
    dedupeKey: chiaveLavoro(campaignId),
    maxAttempts: 3,
  });

  return db.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });
}

/**
 * Il lavoro vero. Lo esegue la coda, e può essere interrotto in qualunque
 * momento: ogni passaggio riparte da dove serve.
 *
 * - i contatti già sincronizzati **durante questo lavoro** non si
 *   risincronizzano (è la ragione per cui il momento di messa in coda sta nel
 *   payload);
 * - la campagna presso il fornitore si crea una volta sola: se
 *   `providerId` c'è già, si riusa;
 * - se il processo muore dopo aver dato l'ordine di invio, al giro dopo la
 *   campagna finisce in «non riuscita» con scritto perché — mai un secondo
 *   invio alla cieca a clienti veri.
 */
export async function runCampaignSendJob(raw: unknown, job: JobRef): Promise<JobOutcome> {
  const payload = CampaignSendPayload.parse(raw);
  const { venueId, campaignId } = payload;

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) return { done: true };
  // Chi ha già concluso, o è stato archiviato, non si tocca.
  if (campaign.status !== "SENDING" && campaign.status !== "SCHEDULED") return { done: true };

  if (payload.step === "handoff") {
    await segnaNonRiuscita(
      campaignId,
      venueId,
      campaign.name,
      "L'invio era già stato avviato presso il fornitore quando il lavoro si è interrotto. " +
        "Non lo ripetiamo per non scrivere due volte agli stessi clienti: controlla lo stato su Brevo."
    );
    return { done: true };
  }

  try {
    const segment = (campaign.segment as SegmentFilterType | null) ?? {};
    const guests = await resolveSegment(venueId, segment);
    if (guests.length === 0) {
      await segnaNonRiuscita(campaignId, venueId, campaign.name, "Nessun destinatario valido al momento dell'invio.");
      return { done: true };
    }

    const daQuando = new Date(payload.enqueuedAt);
    const giaSincronizzati = new Set(
      (
        await db.guestProviderLink.findMany({
          where: {
            venueId,
            provider: "brevo",
            guestId: { in: guests.map((g) => g.id) },
            syncedAt: { gte: daQuando },
          },
          select: { guestId: true },
        })
      ).map((l) => l.guestId)
    );

    const restanti = guests.filter((g) => !giaSincronizzati.has(g.id));
    for (const guest of restanti.slice(0, LOTTO_CONTATTI)) {
      const ref = await adapter.syncContact(guest);
      await db.guestProviderLink.upsert({
        where: { guestId_provider: { guestId: guest.id, provider: "brevo" } },
        create: { venueId, guestId: guest.id, provider: "brevo", providerContactId: ref.providerContactId },
        update: { providerContactId: ref.providerContactId, syncedAt: new Date() },
      });
    }

    if (restanti.length > LOTTO_CONTATTI) {
      // Ancora contatti da sincronizzare: si cede il turno.
      return { again: true };
    }

    const htmlContent = await compileHtmlForBrevoSend(venueId, campaign.body || "", payload.origin);
    const recipientEmails = guests.map((g) => g.email!).filter(Boolean);

    // La campagna presso il fornitore si crea una volta sola.
    let providerId = campaign.providerId;
    let providerListId = campaign.providerListId;
    if (!providerId) {
      const ref = await adapter.createCampaign(campaign, { htmlContent, recipientEmails });
      providerId = ref.providerId;
      providerListId = ref.providerListId;
      await db.campaign.update({ where: { id: campaignId }, data: { providerId, providerListId } });
    }

    // Da qui in poi un'interruzione non deve produrre un secondo invio.
    await db.backgroundJob.update({
      where: { id: job.id },
      data: { payload: { ...payload, step: "handoff" } as Prisma.InputJsonValue },
    });

    const at = payload.at ? new Date(payload.at) : null;
    if (at) await adapter.scheduleCampaign(providerId, at);
    else await adapter.sendCampaign(providerId);

    await createMessageLogs(campaignId, venueId, guests);
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: at ? "SCHEDULED" : "SENT",
        sentCount: recipientEmails.length,
      },
    });

    return { done: true };
  } catch (err) {
    if (job.attempts >= job.maxAttempts) {
      const motivo = err instanceof Error ? err.message : "errore sconosciuto";
      await segnaNonRiuscita(campaignId, venueId, campaign.name, `Tentativi esauriti. Ultimo errore: ${motivo}`);
    }
    throw err;
  }
}

/**
 * Invio di test: non tocca MessageLog (non è un invio reale a un destinatario),
 * risolve TUTTI i token localmente con dati di esempio realistici e passa
 * dall'adapter transazionale già verificato in produzione (sendTransactionalEmail),
 * bypassando del tutto la macchina "campagna" di Brevo.
 */
export async function sendTestEmail(venueId: string, campaignId: string, to: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) throw new Error("not_found");
  if (campaign.status !== "DRAFT") throw new Error("campaign_not_editable");
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });

  const rawHtml = campaign.contentBlocks
    ? compileBlocksToHtml(campaign.contentBlocks as unknown as Block[], venue.brandAccent ?? undefined)
    : campaign.body || "";

  const origin = getRequestOrigin();
  const html = resolveTestVariables(rawHtml, {
    firstName: "Mario",
    lastName: "Rossi",
    restaurantName: venue.name,
    bookingLink: `${origin}/book?venue=${venueId}#test`,
    unsubscribeLink: `${origin}/api/unsubscribe?token=${signUnsubscribeToken(PREVIEW_UNSUBSCRIBE_ID)}`,
    lastVisitDate: new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }),
    loyaltyLevel: "VIP",
  });

  await adapter.sendTransactionalEmail({
    to,
    subject: campaign.subject ?? "(anteprima campagna)",
    html,
  });
}

const EVENT_TO_MESSAGE_STATUS: Partial<Record<NormalizedEventType, "DELIVERED" | "FAILED">> = {
  delivered: "DELIVERED",
  hard_bounce: "FAILED",
};

export async function recordWebhookEvent(rawPayload: unknown) {
  const events = await adapter.handleWebhookEvent(rawPayload);

  for (const evt of events) {
    const existing = await db.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: "brevo", providerEventId: evt.providerEventId } },
    });
    if (existing) continue;

    await db.webhookEvent.create({
      data: {
        provider: "brevo",
        providerEventId: evt.providerEventId,
        eventType: evt.eventType,
        payload: rawPayload as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });

    const messageLog = evt.providerCampaignId
      ? await db.messageLog.findFirst({
          where: { campaignId: evt.providerCampaignId, toAddress: evt.toAddress },
        })
      : null;

    const newStatus = EVENT_TO_MESSAGE_STATUS[evt.eventType];
    if (messageLog && newStatus) {
      await db.messageLog.update({
        where: { id: messageLog.id },
        data: {
          status: newStatus,
          ...(newStatus === "DELIVERED" && { deliveredAt: evt.occurredAt }),
          ...(newStatus === "FAILED" && { failedAt: evt.occurredAt, error: evt.eventType }),
        },
      });
    }

    if (evt.eventType === "opened" && messageLog?.campaignId) {
      await db.campaign.update({
        where: { id: messageLog.campaignId },
        data: { openedCount: { increment: 1 } },
      });
    }

    if (
      messageLog &&
      (evt.eventType === "hard_bounce" || evt.eventType === "unsubscribed" || evt.eventType === "complaint")
    ) {
      const guest = await db.guest.findFirst({
        where: { venueId: messageLog.venueId, email: evt.toAddress },
      });
      if (guest) {
        await db.guest.update({ where: { id: guest.id }, data: { marketingOptIn: false } });
        await db.consentLog.create({
          data: {
            id: crypto.randomUUID(),
            venueId: guest.venueId,
            guestId: guest.id,
            channel: "EMAIL",
            granted: false,
            source: `brevo_${evt.eventType}`,
          },
        });
      }
    }
  }
}
