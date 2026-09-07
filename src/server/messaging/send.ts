import { Resend } from "resend";
import { z } from "zod";
import type { MessageChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueJob } from "@/server/jobs/queue";

/**
 * Un solo punto da cui escono i messaggi verso gli ospiti.
 *
 * Prima le email partivano direttamente da `emails.ts` con una chiamata a
 * Resend per ogni tipo di messaggio, e nessuna traccia: non si poteva sapere
 * se un promemoria era già stato mandato, né se era arrivato. `MessageLog`
 * esisteva nello schema ed era usato solo dalle campagne.
 *
 * Due conseguenze pratiche:
 *
 * - **Non si manda due volte la stessa cosa.** `bookingId` + `kind` sono la
 *   chiave: un cron che gira ogni quarto d'ora non può inondare un ospite di
 *   promemoria.
 * - **Aggiungere un canale non tocca il resto.** SMS e WhatsApp hanno il posto
 *   pronto in `PROVIDERS`; finché non ci sono, chi chiama riceve `no_channel`
 *   e nessuna interfaccia li offre.
 *
 * Ci sono due modi di uscire da qui:
 *
 * - `enqueueMessage` — la strada normale. Scrive la riga nel registro come
 *   `QUEUED` e mette in coda la consegna: chi ha chiesto l'invio non aspetta il
 *   fornitore. È quella che usano promemoria e sondaggi, che ne mandano
 *   centinaia per volta.
 * - `sendMessage` — consegna immediata, per quando serve sapere subito com'è
 *   andata (un invio di prova, un messaggio singolo scritto a mano).
 *
 * Entrambe passano dagli stessi controlli e scrivono la stessa riga: non ci
 * sono due verità sul fatto che un messaggio sia partito.
 */

export type OutboundMessage = {
  venueId: string;
  channel: MessageChannel;
  to: string;
  subject?: string;
  /** Corpo già pronto: HTML per l'email, testo per gli altri canali. */
  body: string;
  /** Anteprima leggibile salvata nel registro, senza HTML. */
  preview?: string;
  guestId?: string | null;
  bookingId?: string | null;
  /** Che messaggio è. Con `bookingId` impedisce il doppio invio. */
  kind: string;
  /** Nome del locale, usato come mittente visibile. */
  venueName?: string;
};

export type SendOutcome =
  | { sent: true; messageLogId: string; providerId: string | null }
  | { sent: false; reason: "duplicate" | "no_channel" | "no_address" | "provider_error"; detail?: string };

type Provider = {
  /** Vero quando il canale è configurato e utilizzabile. */
  available: boolean;
  send(message: OutboundMessage): Promise<{ providerId: string | null }>;
};

const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;
const FROM = process.env.RESEND_FROM || "noreply@tavolo.local";

/**
 * Cosa dice davvero la risposta di Resend.
 *
 * Il client **non solleva** un errore quando l'invio viene rifiutato: torna un
 * oggetto con `error` valorizzato e `data` vuoto. Il codice guardava solo
 * `data?.id ?? null` e considerava riuscito tutto: con una chiave non valida i
 * promemoria risultavano «inviati», e il locale avrebbe letto due messaggi
 * partiti dove non era partito niente.
 *
 * Anche un esito senza identificativo è un esito da non credere: se il
 * fornitore non dice quale messaggio ha accettato, non sappiamo che l'ha
 * accettato.
 */
export function esitoResend(res: { data?: { id?: string } | null; error?: { message?: string } | null }): {
  providerId: string;
} {
  if (res.error) throw new Error(res.error.message || "il fornitore email ha rifiutato l'invio");
  const providerId = res.data?.id;
  if (!providerId) throw new Error("il fornitore email non ha confermato l'invio");
  return { providerId };
}

const PROVIDERS: Record<MessageChannel, Provider> = {
  EMAIL: {
    available: !!resend,
    async send(message) {
      if (!resend) throw new Error("email_not_configured");
      const res = await resend.emails.send({
        from: message.venueName ? `${message.venueName} <${FROM}>` : FROM,
        to: message.to,
        subject: message.subject ?? "",
        html: message.body,
      });
      return esitoResend(res);
    },
  },
  // Il posto è pronto e la firma è quella giusta: quando ci sarà un fornitore,
  // qui va l'adattatore e non cambia nient'altro. Vedi docs/INTEGRATIONS.md.
  SMS: {
    available: false,
    async send() {
      throw new Error("sms_not_configured");
    },
  },
  WHATSAPP: {
    available: false,
    async send() {
      throw new Error("whatsapp_not_configured");
    },
  },
};

export function channelAvailable(channel: MessageChannel): boolean {
  return PROVIDERS[channel]?.available ?? false;
}

/** Questo messaggio è già stato mandato per questa prenotazione? */
export async function alreadySent(bookingId: string, kind: string): Promise<boolean> {
  const esistente = await db.messageLog.findFirst({
    where: { bookingId, kind, status: { in: ["QUEUED", "SENT", "DELIVERED"] } },
    select: { id: true },
  });
  return !!esistente;
}

/**
 * I controlli comuni alle due strade. Restituisce il motivo per cui il
 * messaggio non va mandato, oppure `null` se si può procedere.
 *
 * Canale non configurato: si esce **senza** scrivere nel registro. Il cron dei
 * promemoria gira ogni quarto d'ora: una riga per tentativo sarebbe un
 * centinaio di righe al giorno per ogni prenotazione, per dire una cosa che
 * riguarda la configurazione e non il singolo messaggio. Il conteggio lo
 * riporta la risposta del cron.
 */
async function motivoPerNonMandare(
  message: OutboundMessage
): Promise<"no_address" | "duplicate" | "no_channel" | null> {
  if (!message.to?.trim()) return "no_address";
  if (message.bookingId && (await alreadySent(message.bookingId, message.kind))) return "duplicate";
  if (!PROVIDERS[message.channel]?.available) return "no_channel";
  return null;
}

/**
 * La riga nasce prima dell'invio: se il processo muore a metà, resta la
 * traccia che ci abbiamo provato — che è l'unica cosa che permette di capire
 * cosa è successo. `QUEUED` significa esattamente questo, e blocca il doppio
 * invio anche mentre il messaggio è ancora in coda.
 */
async function creaRigaRegistro(message: OutboundMessage) {
  const preview = (message.preview ?? message.body.replace(/<[^>]+>/g, " ")).trim().slice(0, 300);
  return db.messageLog.create({
    data: {
      venueId: message.venueId,
      guestId: message.guestId ?? null,
      bookingId: message.bookingId ?? null,
      kind: message.kind,
      channel: message.channel,
      toAddress: message.to,
      subject: message.subject ?? null,
      bodyPreview: preview,
      status: "QUEUED",
    },
  });
}

export type QueueOutcome =
  | { queued: true; messageLogId: string; jobId: string }
  | { queued: false; reason: "duplicate" | "no_channel" | "no_address"; detail?: string };

/** Quello che serve al lavoro in coda per consegnare il messaggio. */
export const QueuedMessagePayload = z.object({
  messageLogId: z.string(),
  venueId: z.string(),
  channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]),
  to: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  venueName: z.string().optional(),
  kind: z.string(),
});
export type QueuedMessagePayloadType = z.infer<typeof QueuedMessagePayload>;

/**
 * Mette un messaggio in coda: chi lo chiede non aspetta il fornitore.
 *
 * La chiave di deduplica del lavoro è l'identificativo della riga di registro,
 * che è unico per definizione: un messaggio non può essere messo in coda due
 * volte per la stessa riga, e la riga stessa non nasce due volte grazie ai
 * controlli qui sopra.
 */
export async function enqueueMessage(message: OutboundMessage): Promise<QueueOutcome> {
  const motivo = await motivoPerNonMandare(message);
  if (motivo) {
    return {
      queued: false,
      reason: motivo,
      ...(motivo === "no_channel" && { detail: `canale ${message.channel} non configurato` }),
    };
  }

  const log = await creaRigaRegistro(message);
  const payload: QueuedMessagePayloadType = {
    messageLogId: log.id,
    venueId: message.venueId,
    channel: message.channel,
    to: message.to,
    body: message.body,
    kind: message.kind,
    ...(message.subject !== undefined && { subject: message.subject }),
    ...(message.venueName !== undefined && { venueName: message.venueName }),
  };

  const { jobId } = await enqueueJob({
    kind: "message.send",
    venueId: message.venueId,
    payload,
    dedupeKey: `message.send:${log.id}`,
  });

  return { queued: true, messageLogId: log.id, jobId };
}

/**
 * Consegna un messaggio già in registro. La chiama la coda.
 *
 * Se il fornitore dà errore, la riga **non** diventa subito «non riuscito»:
 * finché ci sono tentativi resta in coda con il motivo scritto accanto, e
 * diventa `FAILED` solo quando si smette di provare. Lo stato dice sempre la
 * verità di quel momento.
 */
export async function deliverQueuedMessage(
  raw: unknown,
  opts: { finalAttempt: boolean } = { finalAttempt: true }
): Promise<void> {
  const payload = QueuedMessagePayload.parse(raw);
  const log = await db.messageLog.findUnique({ where: { id: payload.messageLogId } });
  // La riga può essere sparita (locale cancellato) o essere già partita: in
  // entrambi i casi il lavoro è concluso, non fallito.
  if (!log || log.status === "SENT" || log.status === "DELIVERED") return;

  const provider = PROVIDERS[payload.channel];
  if (!provider?.available) {
    await db.messageLog.update({
      where: { id: log.id },
      data: { status: "SKIPPED", error: `canale ${payload.channel} non configurato` },
    });
    return;
  }

  try {
    const { providerId } = await provider.send({
      venueId: payload.venueId,
      channel: payload.channel,
      to: payload.to,
      body: payload.body,
      kind: payload.kind,
      ...(payload.subject !== undefined && { subject: payload.subject }),
      ...(payload.venueName !== undefined && { venueName: payload.venueName }),
    });
    await db.messageLog.update({
      where: { id: log.id },
      data: { status: "SENT", sentAt: new Date(), providerId, error: null },
    });
  } catch (err) {
    const detail = (err instanceof Error ? err.message : "errore sconosciuto").slice(0, 500);
    await db.messageLog.update({
      where: { id: log.id },
      data: opts.finalAttempt
        ? { status: "FAILED", failedAt: new Date(), error: detail }
        : { error: detail },
    });
    throw err;
  }
}

/** Consegna immediata: per quando serve sapere subito com'è andata. */
export async function sendMessage(message: OutboundMessage): Promise<SendOutcome> {
  const motivo = await motivoPerNonMandare(message);
  if (motivo) {
    return {
      sent: false,
      reason: motivo,
      ...(motivo === "no_channel" && { detail: `canale ${message.channel} non configurato` }),
    };
  }

  const provider = PROVIDERS[message.channel];
  const log = await creaRigaRegistro(message);

  try {
    const { providerId } = await provider.send(message);
    await db.messageLog.update({
      where: { id: log.id },
      data: { status: "SENT", sentAt: new Date(), providerId },
    });
    return { sent: true, messageLogId: log.id, providerId };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "errore sconosciuto";
    await db.messageLog.update({
      where: { id: log.id },
      data: { status: "FAILED", failedAt: new Date(), error: detail.slice(0, 500) },
    });
    console.error("[messaging] invio non riuscito", { kind: message.kind, canale: message.channel }, err);
    return { sent: false, reason: "provider_error", detail };
  }
}
