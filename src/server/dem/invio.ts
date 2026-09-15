import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { z } from "zod";
import { db } from "@/lib/db";
import { compileCampaignContent, resolveRecipientVariables } from "@/lib/campaign-blocks-compiler";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";
import { logEvento } from "@/lib/observability";
import type { JobOutcome, JobRef } from "@/server/jobs/queue";
import { consumaQuota, rilasciaQuota } from "./consumo";
import { avvisa, avvisoCampagnaInviata } from "./avvisi";
import { mittenteDi } from "./dominio";
import { controllaReputazione } from "./statistiche";
import { normalizzaEmail } from "./destinatari";
import { nomeSpazio, registraErroreSes, sesRichiesto } from "./ses";

/**
 * L'invio vero, destinatario per destinatario.
 *
 * ## Perché non «una campagna a una lista»
 *
 * Perché una lista non si può contare, non si può fermare a metà, e non
 * risponde a «questa email è arrivata a Mario?». Il modello commerciale conta
 * gli invii **per destinatario**, e la pagina dei risultati dice quanti hanno
 * aperto: entrambe le cose richiedono che ogni messaggio sia una riga nostra,
 * con un identificativo che lega gli eventi che torneranno indietro.
 *
 * ## Le quattro cose che non devono rompersi
 *
 * - **nessuno riceve due volte.** Una riga passa da «in attesa» a «in corso»
 *   *prima* della chiamata, e a «inviata» dopo. Se il processo muore in mezzo,
 *   quella riga resta «in corso» e non viene ripresa: non sappiamo se il
 *   messaggio è uscito, e nel dubbio non si riscrive a un cliente vero;
 * - **si riprende da dove si era.** Il lotto successivo cerca solo righe «in
 *   attesa»: riprendere dopo un'interruzione, un timeout o una pubblicazione a
 *   metà invio è la stessa operazione di continuare;
 * - **si controlla di nuovo, appena prima.** Fra la programmazione di martedì
 *   e l'invio di venerdì qualcuno può essersi disiscritto. Chi non è più
 *   raggiungibile viene saltato e **la sua quota torna indietro**: non gli
 *   abbiamo scritto, non lo paga;
 * - **la quota scende mentre si invia,** non tutta alla fine. Una campagna
 *   interrotta a metà ha consumato metà, e il contatore lo dice.
 */

/** Quanti messaggi per giro. Oltre, il budget dell'esecuzione non basta. */
const LOTTO = 20;

export const DemSendPayload = z.object({
  venueId: z.string(),
  campaignId: z.string(),
  /** L'indirizzo pubblico, catturato al clic: dentro il cron non c'è. */
  origin: z.string(),
});
export type DemSendPayloadType = z.infer<typeof DemSendPayload>;

/**
 * Manda un lotto di messaggi e dice se ce n'è ancora.
 *
 * La chiama la coda, che le dà un turno alla volta: è per questo che non c'è
 * nessun ciclo che «finisce la campagna» — finirla in una volta sola
 * significherebbe una richiesta che dura dieci minuti e muore a metà.
 */
export async function eseguiInvioDem(raw: unknown, _job: JobRef): Promise<JobOutcome> {
  const { venueId, campaignId, origin } = DemSendPayload.parse(raw);

  const campagna = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campagna) return { done: true };
  if (campagna.status !== "QUEUED" && campagna.status !== "SENDING" && campagna.status !== "SCHEDULED") {
    return { done: true };
  }

  // Programmata per dopo: si rimette in coda invece di partire in anticipo.
  if (campagna.scheduledAt && campagna.scheduledAt > new Date()) {
    return { again: true, delayMs: Math.min(campagna.scheduledAt.getTime() - Date.now(), 60_000) };
  }

  const mittente = await mittenteDi(venueId);
  if (!mittente) {
    // Il dominio non è pronto: spedire da un dominio non firmato finirebbe
    // nello spam e porterebbe giù la reputazione di tutti gli altri clienti.
    await fermaCampagna(campaignId, venueId, campagna.name, "Il dominio di invio non è ancora pronto.");
    return { done: true };
  }

  if (campagna.status === "QUEUED" || campagna.status === "SCHEDULED") {
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: "SENDING", sendingStartedAt: campagna.sendingStartedAt ?? new Date() },
    });
  }

  const inAttesa = await db.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: LOTTO,
  });

  if (inAttesa.length === 0) {
    await concludi(campaignId, venueId, campagna.name);
    return { done: true };
  }

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { name: true, address: true, city: true, brandAccent: true },
  });

  const htmlBase = campagna.contentBlocks
    ? compileCampaignContent(campagna.contentBlocks, venue.brandAccent ?? undefined)
    : campagna.body || "";

  let inviati = 0;
  let saltati = 0;

  for (const destinatario of inAttesa) {
    const eleggibile = await ancoraRaggiungibile(venueId, destinatario.guestId, destinatario.email);

    if (!eleggibile) {
      await db.campaignRecipient.update({
        where: { id: destinatario.id },
        data: { status: "SKIPPED", error: "non più raggiungibile al momento dell'invio" },
      });
      saltati += 1;
      continue;
    }

    // «In corso» **prima** della chiamata: se il processo muore adesso, questa
    // riga resta qui e non verrà ripresa da nessuno. Una email in meno è un
    // danno piccolo; la stessa email due volte a un cliente vero no.
    const preso = await db.campaignRecipient.updateMany({
      where: { id: destinatario.id, status: "PENDING" },
      data: { status: "SENDING", queuedAt: new Date() },
    });
    if (preso.count === 0) continue;

    const html = resolveRecipientVariables(htmlBase, {
      firstName: destinatario.firstName,
      lastName: destinatario.lastName,
      restaurantName: venue.name,
      restaurantAddress: [venue.address, venue.city].filter(Boolean).join(", "),
      bookingLink: `${origin}/book?venue=${venueId}&c=${campaignId}`,
      unsubscribeLink: linkDisiscrizione(origin, destinatario.guestId),
    });

    try {
      const esito = await sesRichiesto().send(
        new SendEmailCommand({
          FromEmailAddress: mittente.from,
          ...(mittente.replyTo && { ReplyToAddresses: [mittente.replyTo] }),
          Destination: { ToAddresses: [destinatario.email] },
          ConfigurationSetName: mittente.configurationSet,
          // Lo spazio del cliente: è ciò che tiene separate le sue
          // soppressioni e le sue metriche da quelle di tutti gli altri.
          TenantName: nomeSpazio(venueId),
          EmailTags: [
            { Name: "campagna", Value: campaignId },
            { Name: "locale", Value: venueId },
          ],
          Content: {
            Simple: {
              Subject: { Data: campagna.subject ?? campagna.name, Charset: "UTF-8" },
              Body: { Html: { Data: html, Charset: "UTF-8" } },
              /*
                La disiscrizione con un clic, dentro il programma di posta.

                Non è una gentilezza: i provider la cercano, e una campagna che
                non ce l'ha finisce nella cartella dello spam più spesso. E chi
                non trova come disiscriversi segnala lo spam, che è la cosa che
                rovina la reputazione di tutti i clienti insieme.
              */
              Headers: [
                { Name: "List-Unsubscribe", Value: `<${linkDisiscrizione(origin, destinatario.guestId)}>` },
                { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
              ],
            },
          },
        }),
      );

      await db.campaignRecipient.update({
        where: { id: destinatario.id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: esito.MessageId ?? null },
      });
      inviati += 1;
    } catch (err) {
      registraErroreSes("invio_messaggio", err, { campaignId, venueId });
      await db.campaignRecipient.update({
        where: { id: destinatario.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          // Il messaggio tecnico resta qui e nei log: al cliente la pagina
          // dei risultati dice «non consegnate», che è quello che gli serve.
          error: (err instanceof Error ? err.message : "errore sconosciuto").slice(0, 300),
        },
      });
      saltati += 1;
    }
  }

  await aggiornaConti(campaignId, venueId, inviati, saltati);

  const restano = await db.campaignRecipient.count({ where: { campaignId, status: "PENDING" } });
  if (restano > 0) return { again: true };

  await concludi(campaignId, venueId, campagna.name);
  return { done: true };
}

/**
 * Il controllo dell'ultimo istante.
 *
 * Fra il momento in cui una campagna viene programmata e quello in cui parte
 * possono passare giorni. Chi si è disiscritto martedì non deve ricevere
 * venerdì una email decisa lunedì: la fotografia dei destinatari serve a
 * fissare il **costo**, non a congelare il consenso.
 */
async function ancoraRaggiungibile(
  venueId: string,
  guestId: string | null,
  email: string,
): Promise<boolean> {
  const soppresso = await db.demSuppression.findUnique({
    where: { venueId_email: { venueId, email: normalizzaEmail(email) } },
    select: { id: true },
  });
  if (soppresso) return false;

  if (!guestId) return true;
  const guest = await db.guest.findUnique({
    where: { id: guestId },
    select: { marketingOptIn: true, unsubscribedAt: true, anonymizedAt: true },
  });
  if (!guest) return true;
  return guest.marketingOptIn && !guest.unsubscribedAt && !guest.anonymizedAt;
}

function linkDisiscrizione(origin: string, guestId: string | null): string {
  // Senza scheda cliente non c'è niente da disiscrivere in modo mirato: il
  // link porta comunque alla pagina, che spiega cosa è successo.
  const token = guestId ? signUnsubscribeToken(guestId) : "";
  return `${origin}/api/unsubscribe?token=${token}`;
}

/**
 * Sposta i conti dopo un lotto: quota consumata, quota restituita, contatori.
 *
 * Gli inviati consumano; i saltati **restituiscono**, perché a quelle persone
 * non abbiamo scritto. Se restituire non fosse qui, una campagna programmata
 * su un segmento che nel frattempo si è svuotato terrebbe impegnati per tutto
 * il mese invii che nessuno userà.
 */
async function aggiornaConti(
  campaignId: string,
  venueId: string,
  inviati: number,
  saltati: number,
): Promise<void> {
  const campagna = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { usagePeriod: true, reservedCount: true },
  });
  if (!campagna?.usagePeriod) return;

  if (inviati > 0) await consumaQuota(venueId, campagna.usagePeriod, inviati);
  if (saltati > 0) await rilasciaQuota(venueId, campagna.usagePeriod, saltati);

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: inviati },
      failedCount: { increment: saltati },
      reservedCount: Math.max(0, campagna.reservedCount - inviati - saltati),
    },
  });
}

/** Ultimo lotto fatto: la campagna è finita. */
async function concludi(campaignId: string, venueId: string, nome: string): Promise<void> {
  const campagna = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true, usagePeriod: true, reservedCount: true },
  });
  if (!campagna || campagna.status === "SENT") return;

  // Quello che resta impegnato non è partito: torna disponibile.
  if (campagna.usagePeriod && campagna.reservedCount > 0) {
    await rilasciaQuota(venueId, campagna.usagePeriod, campagna.reservedCount);
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "SENT", sentAt: new Date(), reservedCount: 0 },
  });

  await avvisa(venueId, avvisoCampagnaInviata(nome, campaignId));
  logEvento("dem.campagna.conclusa", { campaignId, venueId });

  /*
    Il momento giusto per guardare la reputazione è appena finita una
    campagna: è quando i numeri sono cambiati davvero. Farlo solo una volta al
    giorno significherebbe lasciar partire la campagna successiva prima di
    accorgersi che la precedente è andata male.

    Gli esiti però arrivano dopo — consegne e rimbalzi ci mettono minuti o ore
    — quindi questo controllo vede soprattutto la campagna *prima*. Va bene
    così: serve a fermare la serie, non il singolo invio.
  */
  await controllaReputazione(venueId).catch(() => undefined);
}

/** Ferma tutto e restituisce quello che era impegnato. */
async function fermaCampagna(
  campaignId: string,
  venueId: string,
  nome: string,
  motivo: string,
): Promise<void> {
  const campagna = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { usagePeriod: true, reservedCount: true },
  });
  if (campagna?.usagePeriod && campagna.reservedCount > 0) {
    await rilasciaQuota(venueId, campagna.usagePeriod, campagna.reservedCount);
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "FAILED", reservedCount: 0, pausedAt: new Date() },
  });

  await avvisa(venueId, {
    kind: "DEM_DOMAIN_PROBLEM",
    title: `Campagna non inviata: ${nome}`,
    body: motivo,
    link: "/settings/marketing/invio",
    perEmail: true,
  });
}
