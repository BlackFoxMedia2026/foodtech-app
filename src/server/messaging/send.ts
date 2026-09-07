import { Resend } from "resend";
import type { MessageChannel } from "@prisma/client";
import { db } from "@/lib/db";

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
      return { providerId: res.data?.id ?? null };
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

export async function sendMessage(message: OutboundMessage): Promise<SendOutcome> {
  if (!message.to?.trim()) {
    return { sent: false, reason: "no_address" };
  }

  if (message.bookingId && (await alreadySent(message.bookingId, message.kind))) {
    return { sent: false, reason: "duplicate" };
  }

  const provider = PROVIDERS[message.channel];

  // Canale non configurato: si esce **senza** scrivere nel registro. Il cron
  // dei promemoria gira ogni quarto d'ora: una riga per tentativo sarebbe un
  // centinaio di righe al giorno per ogni prenotazione, per dire una cosa che
  // riguarda la configurazione e non il singolo messaggio. Il conteggio lo
  // riporta la risposta del cron.
  if (!provider?.available) {
    return { sent: false, reason: "no_channel", detail: `canale ${message.channel} non configurato` };
  }

  const preview = (message.preview ?? message.body.replace(/<[^>]+>/g, " ")).trim().slice(0, 300);

  // La riga nasce prima dell'invio: se il processo muore a metà, resta la
  // traccia che ci abbiamo provato — che è l'unica cosa che permette di
  // capire cosa è successo.
  const log = await db.messageLog.create({
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
