import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { TAG_RULES } from "./guest-intelligence";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import type { EmailProviderAdapter, NormalizedEventType } from "@/server/marketing/email-provider";
import { Prisma, type CampaignStatus } from "@prisma/client";
import {
  EmailContentSchema,
  hasSubstantiveContent,
  parseEmailDocument,
  type EmailDocument,
} from "@/lib/campaign-blocks";
import {
  compileCampaignContent,
  resolveGlobalVariables,
  resolveTestVariables,
  toBrevoMergeTags,
} from "@/lib/campaign-blocks-compiler";
import { PREVIEW_UNSUBSCRIBE_ID, signUnsubscribeToken } from "@/lib/unsubscribe-token";
import { enqueueJob, type JobOutcome, type JobRef } from "@/server/jobs/queue";
import { eleggibili, scattaSnapshot } from "@/server/dem/destinatari";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import {
  consumaQuota,
  consumaSubito,
  controllaSoglie,
  quotaSufficiente,
  rilasciaQuota,
  riservaQuota,
} from "@/server/dem/consumo";
import { InviiSospesi, QuotaInsufficiente } from "@/server/dem/errori";
import { mittenteDi } from "@/server/dem/dominio";
import { sesAttivo } from "@/server/dem/ses";
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
  /**
   * Il contenuto dell'email: il documento dell'editor (impostazioni + blocchi)
   * oppure l'array piatto di blocchi salvato dalle campagne precedenti. Le due
   * forme convivono — vedi EmailContentSchema.
   */
  contentBlocks: EmailContentSchema.optional(),
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

/**
 * Una newsletter già costruita, pronta a diventare il punto di partenza di
 * un'altra. È di sola lettura: la campagna d'origine non viene mai toccata —
 * chi la sceglie ne ottiene una **copia** dentro una campagna nuova.
 */
export interface NewsletterSource {
  id: string;
  name: string;
  /** Già formattata qui: il fuso del locale lo conosce il server, non il browser di chi guarda. */
  dataLabel: string;
  /** «Inviata», «In bozza», «Programmata» — una parola, non un badge di stato completo. */
  statoLabel: string;
  inviata: boolean;
  /** Riusato come oggetto della nuova campagna solo se chi scrive non ne ha già uno. */
  subject: string | null;
  document: EmailDocument;
}

const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

/**
 * Le newsletter riutilizzabili del locale, dalla più recente.
 *
 * Passano solo quelle con **contenuto vero**: una bozza aperta e mai
 * compilata riempirebbe la libreria di miniature bianche indistinguibili, che
 * è esattamente il contrario di una libreria visuale. E si esclude la campagna
 * che si sta scrivendo — offrire a qualcuno di partire da sé stesso è un giro
 * a vuoto con dentro il rischio di azzerarsi il lavoro.
 */
export async function listNewsletterSources(
  venueId: string,
  { excludeId, limit = 12 }: { excludeId?: string; limit?: number } = {},
): Promise<NewsletterSource[]> {
  const campagne = await db.campaign.findMany({
    where: {
      venueId,
      channel: "EMAIL",
      contentBlocks: { not: Prisma.DbNull },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    // Si legge più del necessario perché il filtro sul contenuto vero non è
    // esprimibile in SQL: sta dentro un campo JSON di forma libera.
    take: limit * 3,
    select: {
      id: true,
      name: true,
      subject: true,
      status: true,
      scheduledAt: true,
      sentCount: true,
      createdAt: true,
      contentBlocks: true,
    },
  });

  const fonti: NewsletterSource[] = [];
  for (const c of campagne) {
    if (fonti.length >= limit) break;
    const document = parseEmailDocument(c.contentBlocks);
    if (!hasSubstantiveContent(document.blocks)) continue;
    const inviata = c.sentCount > 0;
    fonti.push({
      id: c.id,
      name: c.name,
      dataLabel: FORMATO_DATA.format(c.createdAt),
      statoLabel: inviata
        ? "Inviata"
        : c.status === "SCHEDULED" || c.scheduledAt
          ? "Programmata"
          : "In bozza",
      inviata,
      subject: c.subject,
      document,
    });
  }
  return fonti;
}

export type CampaignWithResults = Awaited<ReturnType<typeof listCampaigns>>[number] & {
  attribuite: number;
};

/**
 * L'elenco delle campagne con le prenotazioni che hanno portato.
 *
 * Due letture per tutta la pagina invece di due per campagna: gli istanti
 * d'invio in un colpo, le prenotazioni attribuite in un altro, e la finestra
 * si applica in memoria. Con dieci campagne la differenza è fra due
 * interrogazioni e venti.
 */
export async function listCampaignsWithResults(venueId: string): Promise<CampaignWithResults[]> {
  const campagne = await listCampaigns(venueId);
  if (campagne.length === 0) return [];

  const ids = campagne.map((c) => c.id);
  const [invii, prenotazioni] = await Promise.all([
    db.messageLog.groupBy({
      by: ["campaignId"],
      where: { venueId, campaignId: { in: ids } },
      _min: { createdAt: true },
    }),
    db.booking.findMany({
      where: {
        venueId,
        campaignId: { in: ids },
        deletedAt: null,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { campaignId: true, createdAt: true },
    }),
  ]);

  const inviata = new Map<string, Date>();
  for (const r of invii) {
    if (r.campaignId && r._min.createdAt) inviata.set(r.campaignId, r._min.createdAt);
  }

  const conteggi = new Map<string, number>();
  for (const b of prenotazioni) {
    if (!b.campaignId) continue;
    const partenza = inviata.get(b.campaignId);
    if (!partenza) continue;
    const fine = new Date(partenza.getTime() + FINESTRA_ATTRIBUZIONE_GIORNI * 86_400_000);
    if (b.createdAt < partenza || b.createdAt > fine) continue;
    conteggi.set(b.campaignId, (conteggi.get(b.campaignId) ?? 0) + 1);
  }

  return campagne.map((c) => ({ ...c, attribuite: conteggi.get(c.id) ?? 0 }));
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
        ? compileCampaignContent(data.contentBlocks, venue.brandAccent ?? undefined)
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
        body: compileCampaignContent(data.contentBlocks, venue?.brandAccent ?? undefined),
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
 * I destinatari veri di un segmento.
 *
 * Il consenso e l'email non-nulla restano vincoli del database — sono in AND
 * con i filtri scelti dal ristoratore e non sono delegabili all'interfaccia —
 * ma non bastano più: chi ha segnalato spam, chi ha un indirizzo che non
 * esiste e chi compare due volte con la stessa casella esce di qui, e non
 * costa un invio. Il conto lo fa `eleggibili`, lo stesso che disegna
 * l'anteprima: due aritmetiche della stessa cosa finirebbero per non
 * coincidere proprio nel momento in cui si preme «invia».
 */
export async function resolveSegment(venueId: string, segment: SegmentFilterType) {
  const where = buildSegmentWhere(venueId, segment);
  where.marketingOptIn = true;
  where.email = { not: null };
  const guests = applyBirthdayThisMonthFilter(await db.guest.findMany({ where }), segment);
  const { destinatari } = await eleggibili(venueId, guests);
  return destinatari;
}

export interface SegmentPreviewResult {
  totalMatchingFilters: number;
  excludedNoEmail: number;
  excludedNoConsent: number;
  /** Segnalazioni di spam e indirizzi che non esistono: vedi DemSuppression. */
  excludedSuppressed: number;
  /** Lo stesso indirizzo su due schede cliente: una email sola. */
  duplicatesRemoved: number;
  finalRecipients: number;
}

/**
 * La fotografia di chi riceverà, con il perché di ogni esclusione.
 *
 * Si parte dai soli filtri scelti dal ristoratore — **senza** i vincoli
 * obbligatori — così il numero di partenza è quello che lui ha in testa
 * («mille clienti come questi ce li ho»), e le esclusioni si possono
 * raccontare una per una invece di far comparire un numero più piccolo senza
 * spiegazione.
 *
 * Ogni contatto conta in una categoria sola, nell'ordine dichiarato in
 * `eleggibili`: la somma delle esclusioni più i destinatari fa sempre il
 * totale, e un ristoratore che prova a farsi i conti li ritrova.
 *
 * È anche il preventivo: i destinatari finali sono gli invii che questa
 * campagna costerà.
 */
export async function previewSegment(venueId: string, segment: SegmentFilterType): Promise<SegmentPreviewResult> {
  const where = buildSegmentWhere(venueId, segment);
  const allMatching = applyBirthdayThisMonthFilter(
    await db.guest.findMany({
      where,
      select: { id: true, email: true, marketingOptIn: true, unsubscribedAt: true, birthday: true },
    }),
    segment
  );

  const { destinatari, esclusi } = await eleggibili(venueId, allMatching);

  return {
    totalMatchingFilters: allMatching.length,
    excludedNoEmail: esclusi.senzaEmail,
    excludedNoConsent: esclusi.senzaConsenso,
    excludedSuppressed: esclusi.soppressi,
    duplicatesRemoved: esclusi.doppioni,
    finalRecipients: destinatari.length,
  };
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
 * Mette in coda l'invio, dopo aver **pagato** la campagna.
 *
 * L'ordine dei tre passaggi non è arbitrario:
 *
 * 1. **si scatta la fotografia** dei destinatari — da qui in poi la campagna
 *    ha la sua lista, e nessuno la cambia più sotto i piedi;
 * 2. **si riserva la quota** per quella lista, tutta o niente: è l'unico
 *    momento in cui si può ancora dire di no senza aver scritto a nessuno;
 * 3. **si mette in coda**, e solo allora lo stato cambia.
 *
 * Se il terzo passo non riesce, la quota torna indietro: un invio che non è
 * mai partito non deve restare scritto sul conto di nessuno.
 *
 * Restituisce la campagna nello stato nuovo, così l'interfaccia può dire «in
 * invio» invece di «inviata» — che sarebbe una bugia finché il lavoro non è
 * finito.
 */
async function queueCampaign(venueId: string, campaignId: string, at?: Date) {
  const campaign = await requireDraftCampaign(venueId, campaignId);
  const segment = (campaign.segment as SegmentFilterType | null) ?? {};

  // Gli invii fermi si dicono **prima** di far preparare una campagna intera:
  // scoprirlo dopo la conferma sarebbe il momento peggiore per saperlo.
  const sub = await abbonamentoDi(venueId);
  if (sub.sendingPausedAt) throw new InviiSospesi(sub.sendingPausedReason);

  const destinatari = await resolveSegment(venueId, segment);
  if (destinatari.length === 0) throw new Error("no_recipients");

  const riserva = await riservaQuota(venueId, destinatari.length);
  if (!riserva.riservata) throw new QuotaInsufficiente(riserva);

  try {
    await scattaSnapshot(campaignId, venueId, destinatari);

    /*
      Due strade, e la scelta si fa qui una volta sola.

      Quando l'invio con dominio proprio è acceso **e il dominio del locale è
      pronto**, la campagna la mandiamo noi: un messaggio per destinatario,
      contato uno per uno, con gli eventi che tornano indietro. È la strada
      che regge il modello commerciale, ed è quella normale.

      Altrimenti si resta sulla vecchia: si consegna l'intera campagna a un
      fornitore esterno. Non è una scorciatoia lasciata lì — è quello che
      permette a un locale che non ha ancora configurato il suo dominio di
      mandare comunque le sue email, invece di trovarsi il marketing spento
      finché non parla con il suo fornitore di domini.
    */
    const conDominioProprio = sesAttivo() && (await mittenteDi(venueId)) !== null;

    if (conDominioProprio) {
      await enqueueJob({
        kind: "dem.campaign.send",
        venueId,
        payload: { venueId, campaignId, origin: getRequestOrigin() },
        // Due clic sul pulsante non fanno partire due invii.
        dedupeKey: chiaveLavoro(campaignId),
        maxAttempts: 5,
        ...(at && { runAt: at }),
      });
    } else {
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
        dedupeKey: chiaveLavoro(campaignId),
        maxAttempts: 3,
      });
    }

    return await db.campaign.update({
      where: { id: campaign.id },
      data: {
        recipientsCount: destinatari.length,
        reservedCount: destinatari.length,
        usagePeriod: riserva.ciclo,
        queuedAt: new Date(),
        ...(at ? { status: "SCHEDULED", scheduledAt: at } : { status: "QUEUED" }),
      },
    });
  } catch (err) {
    await rilasciaQuota(venueId, riserva.ciclo, destinatari.length);
    throw err;
  }
}

/**
 * Chiude i conti di una campagna che non parte più.
 *
 * Gli invii riservati tornano disponibili e la campagna smette di dichiarare
 * di averne impegnati: sono la stessa cosa detta in due posti, e devono
 * cambiare insieme.
 */
async function liberaRiserva(campaignId: string) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { venueId: true, usagePeriod: true, reservedCount: true },
  });
  if (!campaign || campaign.reservedCount <= 0 || !campaign.usagePeriod) return;

  await rilasciaQuota(campaign.venueId, campaign.usagePeriod, campaign.reservedCount);
  await db.campaign.update({ where: { id: campaignId }, data: { reservedCount: 0 } });
}

/**
 * Registra che gli invii di questa campagna sono partiti davvero.
 *
 * Finché il fornitore manda la campagna a una lista sua, «partiti» è un fatto
 * solo: gliel'abbiamo consegnata, e da quel momento quelle email escono. Il
 * giorno in cui l'invio sarà nostro, destinatario per destinatario, questo
 * conto diventerà incrementale — la firma resta la stessa.
 */
async function registraInviiFatti(campaignId: string) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { venueId: true, usagePeriod: true, reservedCount: true },
  });
  if (!campaign || campaign.reservedCount <= 0 || !campaign.usagePeriod) return;

  await consumaQuota(campaign.venueId, campaign.usagePeriod, campaign.reservedCount);
  await db.campaign.update({ where: { id: campaignId }, data: { reservedCount: 0 } });
  await controllaSoglie(campaign.venueId);
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
async function compileHtmlForBrevoSend(
  venueId: string,
  campaignId: string,
  body: string,
  origin: string
): Promise<string> {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });
  const withGlobals = resolveGlobalVariables(body, {
    restaurantName: venue.name,
    restaurantAddress: [venue.address, venue.city].filter(Boolean).join(", "),
    // Il link si porta dietro la campagna: è così che una prenotazione nata da
    // questa email si può riconoscere come nata da questa email. Il widget lo
    // rimanda al server, che verifica che la campagna sia di questo locale.
    bookingLink: `${origin}/book?venue=${venueId}&c=${campaignId}`,
  });
  return toBrevoMergeTags(withGlobals, origin);
}

/**
 * Per quanti giorni dopo l'invio una prenotazione conta come portata dalla
 * campagna.
 *
 * Un mese: chi riapre quella email a marzo e prenota non l'ha prenotata per
 * quella email. Senza una finestra, il merito di una campagna crescerebbe per
 * sempre — ed è il modo più comune di far sembrare efficace il marketing.
 */
export const FINESTRA_ATTRIBUZIONE_GIORNI = 30;

export type CampaignAttribution = {
  /** Quando è partita: il primo messaggio registrato per questa campagna. */
  sentAt: Date | null;
  bookings: number;
  covers: number;
  /** Stima, non incasso: nulla se il locale non ha dichiarato lo scontrino medio. */
  revenueCents: number | null;
  /** Prenotazioni con questo link ma fuori dalla finestra: non contate. */
  fuoriFinestra: number;
};

/**
 * Quante prenotazioni ha portato una campagna, per davvero.
 *
 * Si contano solo le prenotazioni nate dal link di **questa** campagna, entro
 * la finestra, e senza le disdette e le assenze: una prenotazione disdetta è
 * arrivata dalla campagna ma non ha portato nessuno a tavola, e il numero che
 * interessa è il secondo.
 */
export async function getCampaignAttribution(venueId: string, campaignId: string): Promise<CampaignAttribution> {
  const [primoMessaggio, venue] = await Promise.all([
    db.messageLog.findFirst({
      where: { campaignId, venueId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { avgSpendCents: true } }),
  ]);

  const sentAt = primoMessaggio?.createdAt ?? null;
  if (!sentAt) {
    return { sentAt: null, bookings: 0, covers: 0, revenueCents: null, fuoriFinestra: 0 };
  }

  const fineFinestra = new Date(sentAt.getTime() + FINESTRA_ATTRIBUZIONE_GIORNI * 86_400_000);
  const comuni: Prisma.BookingWhereInput = {
    venueId,
    campaignId,
    deletedAt: null,
    status: { notIn: ["CANCELLED", "NO_SHOW"] },
  };

  const [dentro, fuori] = await Promise.all([
    db.booking.findMany({
      where: { ...comuni, createdAt: { gte: sentAt, lte: fineFinestra } },
      select: { partySize: true },
    }),
    db.booking.count({
      where: { ...comuni, createdAt: { gt: fineFinestra } },
    }),
  ]);

  const covers = dentro.reduce((s, b) => s + b.partySize, 0);
  return {
    sentAt,
    bookings: dentro.length,
    covers,
    revenueCents: venue.avgSpendCents ? covers * venue.avgSpendCents : null,
    fuoriFinestra: fuori,
  };
}

async function segnaNonRiuscita(campaignId: string, venueId: string, nome: string, motivo: string) {
  // Prima la quota, poi lo stato: una campagna che non è partita non deve
  // lasciare invii impegnati che nessuno userà più, e se il processo muore fra
  // le due righe è meglio che sia rimasta impegnata (si vede e si sistema) che
  // rilasciata su una campagna che invece era partita.
  await liberaRiserva(campaignId);
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

  // La quota era stata restituita quando la campagna è fallita: riprovare
  // significa ricomprarla. Se nel frattempo il mese si è consumato, il
  // tentativo si ferma qui — con il numero che manca — invece di partire e
  // sfondare il piano.
  const sub = await abbonamentoDi(venueId);
  if (sub.sendingPausedAt) throw new InviiSospesi(sub.sendingPausedReason);

  const daInviare = campaign.recipientsCount > 0 ? campaign.recipientsCount : 0;
  const riserva = await riservaQuota(venueId, daInviare);
  if (!riserva.riservata) throw new QuotaInsufficiente(riserva);

  const payload: CampaignSendPayloadType = {
    venueId,
    campaignId,
    origin: getRequestOrigin(),
    enqueuedAt: new Date().toISOString(),
    step: "sync",
    ...(campaign.scheduledAt && campaign.scheduledAt > new Date() && { at: campaign.scheduledAt.toISOString() }),
  };

  try {
    await enqueueJob({
      kind: "campaign.send",
      venueId,
      payload,
      dedupeKey: chiaveLavoro(campaignId),
      maxAttempts: 3,
    });
  } catch (err) {
    await rilasciaQuota(venueId, riserva.ciclo, daInviare);
    throw err;
  }

  return db.campaign.update({
    where: { id: campaignId },
    data: { status: "QUEUED", reservedCount: daInviare, usagePeriod: riserva.ciclo, queuedAt: new Date() },
  });
}

/**
 * Annulla una campagna che non è ancora partita.
 *
 * Non la cancella: la campagna resta in elenco con lo stato «Annullata». Una
 * campagna sparita è una domanda senza risposta fra un mese — «quella di
 * settembre l'avevamo mandata?» — e il lavoro fatto per scriverla resta
 * riutilizzabile.
 *
 * Gli invii riservati tornano tutti disponibili: non è partito niente.
 */
export async function cancelCampaign(venueId: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campaign) throw new Error("not_found");

  // Dopo la consegna al fornitore non si annulla più: le email sono uscite, e
  // dire «annullata» a chi le ha già ricevute sarebbe la bugia peggiore.
  const annullabili: CampaignStatus[] = ["DRAFT", "READY", "SCHEDULED", "QUEUED"];
  if (!annullabili.includes(campaign.status) || campaign.providerId) throw new Error("conflict");

  await liberaRiserva(campaignId);

  // Il lavoro in coda, se c'è: non deve svegliarsi domani e partire.
  await db.backgroundJob.deleteMany({
    where: { dedupeKey: chiaveLavoro(campaignId), status: { in: ["PENDING", "FAILED"] } },
  });
  await db.campaignRecipient.deleteMany({ where: { campaignId, status: "PENDING" } });

  return db.campaign.update({
    where: { id: campaignId },
    data: { status: "CANCELLED", cancelledAt: new Date(), scheduledAt: null },
  });
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
  // Chi ha già concluso, è stato annullato o archiviato, non si tocca.
  //
  // `QUEUED` è lo stato in cui la campagna esce dal clic: gli invii sono
  // riservati e il lavoro non ha ancora cominciato. `SENDING` è questo lavoro
  // che ha già fatto un giro e ha ceduto il turno.
  const lavorabili: CampaignStatus[] = ["QUEUED", "SCHEDULED", "SENDING"];
  if (!lavorabili.includes(campaign.status)) return { done: true };

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
    // Da qui in poi qualcosa sta succedendo davvero: lo stato lo dice, e lo
    // dice una volta sola — una campagna programmata resta «programmata»
    // finché il suo momento non arriva.
    if (campaign.status === "QUEUED") {
      await db.campaign.update({
        where: { id: campaignId },
        data: { status: "SENDING", sendingStartedAt: new Date() },
      });
    }

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

    const htmlContent = await compileHtmlForBrevoSend(venueId, campaignId, campaign.body || "", payload.origin);
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
        ...(at ? {} : { sendingStartedAt: new Date(), sentAt: new Date() }),
      },
    });
    // Gli invii diventano «fatti» qui e non prima: fino a un istante fa
    // potevano ancora tornare indietro.
    if (!at) await registraInviiFatti(campaignId);

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

  /*
    Un invio di prova è un invio.

    Esce davvero, costa davvero, e se non scalasse il credito «Invia test»
    diventerebbe la porta di servizio del piano: si incolla un indirizzo alla
    volta e si manda la campagna senza pagarla. Quindi conta come gli altri.

    E ha un tetto per campagna, che è l'altra metà della stessa difesa: senza,
    il credito si scalerebbe comunque ma un pulsante premuto in un ciclo
    automatico brucerebbe un mese di invii in un minuto.
  */
  const tetto = Number(process.env.DEM_TEST_SEND_LIMIT ?? "10");
  if (campaign.testSendCount >= tetto) throw new Error("dem_test_limit");

  const esito = await quotaSufficiente(venueId, 1);
  if (!esito.sufficiente) throw new QuotaInsufficiente(esito);

  // Fra la domanda e la scrittura può essere passata un'altra campagna: se la
  // sottrazione non passa, l'ultimo invio se l'è preso qualcun altro.
  const pagato = await consumaSubito(venueId, 1);
  if (!pagato) throw new QuotaInsufficiente({ disponibili: 0, richiesti: 1, mancanti: 1 });

  await db.campaign.update({ where: { id: campaignId }, data: { testSendCount: { increment: 1 } } });

  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });

  const rawHtml = campaign.contentBlocks
    ? compileCampaignContent(campaign.contentBlocks, venue.brandAccent ?? undefined)
    : campaign.body || "";

  const origin = getRequestOrigin();
  const html = resolveTestVariables(rawHtml, {
    firstName: "Mario",
    lastName: "Rossi",
    restaurantName: venue.name,
    restaurantAddress: [venue.address, venue.city].filter(Boolean).join(", "),
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
