import { db } from "@/lib/db";
import { signBookingToken } from "@/lib/booking-token";
import { dateKeyInVenue } from "@/lib/venue-time";
import { sendMessage } from "./messaging/send";

/**
 * Promemoria prima del servizio.
 *
 * Il no-show è il costo più sentito da un ristorante, e il promemoria è il
 * rimedio più economico: un messaggio il giorno prima e uno qualche ora prima,
 * con la possibilità di annullare in un tocco. Meglio una cancellazione con
 * tre ore di anticipo — quel tavolo si rivende — che un tavolo vuoto alle
 * 21:00.
 *
 * Prima esisteva solo l'email di conferma alla creazione. Niente prima del
 * servizio, niente su modifica o annullo.
 *
 * Due regole che tengono il sistema onesto:
 *
 * - **Un promemoria per tipo, per prenotazione.** La chiave è `MessageLog`
 *   (`bookingId` + `kind`): il cron può girare ogni quarto d'ora senza il
 *   rischio di inondare nessuno.
 * - **Mai a chi non aspetta niente.** Chi ha annullato, chi è già arrivato,
 *   chi non ha lasciato un contatto: nessun messaggio.
 */

export const REMINDER_KINDS = {
  /** Il giorno prima. */
  day: "booking.reminder_24h",
  /** Poche ore prima, quando il tavolo si può ancora rivendere. */
  hours: "booking.reminder_3h",
} as const;

/** Quanto prima parte ogni promemoria, in minuti. */
const OFFSET_MIN = {
  [REMINDER_KINDS.day]: 24 * 60,
  [REMINDER_KINDS.hours]: 3 * 60,
} as const;

/**
 * La finestra: si manda quando mancano fra `offset` e `offset - windowMin`
 * minuti. Deve essere più larga dell'intervallo del cron, altrimenti una
 * prenotazione può cadere fra due passaggi e non ricevere niente.
 */
const WINDOW_MIN = 45;

/** Stati che aspettano ancora qualcuno: gli altri non vanno disturbati. */
const REMINDABLE = ["CONFIRMED", "PENDING"] as const;

export type ReminderResult = {
  kind: string;
  bookingId: string;
  outcome: "sent" | "duplicate" | "no_address" | "no_channel" | "error";
};

function formatOra(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

function formatGiorno(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instant);
}

function corpo(opts: {
  guestName: string;
  venueName: string;
  giorno: string;
  ora: string;
  partySize: number;
  quando: "domani" | "oggi";
  confirmUrl: string;
  cancelUrl: string;
  venuePhone: string | null;
}) {
  const apertura =
    opts.quando === "domani"
      ? `ti aspettiamo <strong>domani</strong>, ${opts.giorno}, alle <strong>${opts.ora}</strong>`
      : `ti aspettiamo <strong>oggi</strong> alle <strong>${opts.ora}</strong>`;

  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #2F1F11; max-width: 520px;">
      <p style="font-size:16px;">Ciao ${opts.guestName},</p>
      <p style="font-size:16px;">${apertura} in ${opts.partySize} ${
        opts.partySize === 1 ? "persona" : "persone"
      } da <strong>${opts.venueName}</strong>.</p>

      <p style="font-size:15px;">Ci confermi che ci sei?</p>

      <p>
        <a href="${opts.confirmUrl}"
           style="display:inline-block;background:#0F2920;color:#F2E7D0;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:15px;">
          Sì, ci sono
        </a>
        <a href="${opts.cancelUrl}"
           style="display:inline-block;color:#8a6a48;text-decoration:underline;padding:12px 16px;font-size:14px;">
          Non riesco a venire
        </a>
      </p>

      <p style="font-size:13px;color:#6b5a45;">
        Se ti serve cambiare orario o numero di persone${
          opts.venuePhone ? `, chiamaci allo ${opts.venuePhone}` : ", rispondi a questa email"
        }.
      </p>
      <p style="font-size:13px;color:#6b5a45;">A presto!<br/><strong>${opts.venueName}</strong></p>
    </div>
  `;
}

/**
 * Manda i promemoria dovuti in questo momento, per tutti i locali attivi.
 *
 * Il tempo si misura in istanti assoluti — la differenza fra adesso e l'inizio
 * della prenotazione — quindi il fuso del locale non entra nel *quando*
 * mandare. Entra nel *cosa scrivere*: «domani» e l'ora vanno detti nel fuso
 * del ristorante, non in quello del server.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderResult[]> {
  const risultati: ReminderResult[] = [];

  for (const [kind, offset] of Object.entries(OFFSET_MIN) as [string, number][]) {
    const da = new Date(now.getTime() + (offset - WINDOW_MIN) * 60_000);
    const a = new Date(now.getTime() + offset * 60_000);

    const bookings = await db.booking.findMany({
      where: {
        startsAt: { gte: da, lte: a },
        status: { in: [...REMINDABLE] },
        deletedAt: null,
        venue: { active: true },
        // Escludere qui chi l'ha già ricevuto evita di caricare e scartare
        // centinaia di prenotazioni a ogni passaggio del cron.
        messages: { none: { kind, status: { in: ["QUEUED", "SENT", "DELIVERED"] } } },
      },
      include: {
        guest: { select: { id: true, firstName: true, email: true, marketingOptIn: true } },
        venue: { select: { id: true, name: true, timezone: true, phone: true } },
      },
      take: 200,
    });

    for (const booking of bookings) {
      const email = booking.guest?.email;
      if (!email) {
        risultati.push({ kind, bookingId: booking.id, outcome: "no_address" });
        continue;
      }

      const timezone = booking.venue.timezone;
      const quando = dateKeyInVenue(booking.startsAt, timezone) === dateKeyInVenue(now, timezone) ? "oggi" : "domani";
      const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const esito = await sendMessage({
        venueId: booking.venueId,
        venueName: booking.venue.name,
        channel: "EMAIL",
        to: email,
        guestId: booking.guest?.id ?? null,
        bookingId: booking.id,
        kind,
        subject:
          quando === "domani"
            ? `Ci vediamo domani alle ${formatOra(booking.startsAt, timezone)}?`
            : `Ci vediamo oggi alle ${formatOra(booking.startsAt, timezone)}?`,
        body: corpo({
          guestName: booking.guest?.firstName ?? "",
          venueName: booking.venue.name,
          giorno: formatGiorno(booking.startsAt, timezone),
          ora: formatOra(booking.startsAt, timezone),
          partySize: booking.partySize,
          quando,
          confirmUrl: `${base}/b/${signBookingToken(booking.id, "confirm")}`,
          cancelUrl: `${base}/b/${signBookingToken(booking.id, "cancel")}`,
          venuePhone: booking.venue.phone,
        }),
        preview: `Promemoria prenotazione del ${formatGiorno(booking.startsAt, timezone)} alle ${formatOra(
          booking.startsAt,
          timezone,
        )}`,
      });

      risultati.push({
        kind,
        bookingId: booking.id,
        outcome: esito.sent
          ? "sent"
          : esito.reason === "duplicate"
            ? "duplicate"
            : esito.reason === "no_address"
              ? "no_address"
              : esito.reason === "no_channel"
                ? "no_channel"
                : "error",
      });
    }
  }

  return risultati;
}

/**
 * Quali promemoria sono già partiti per una prenotazione: serve al dettaglio,
 * così chi risponde al telefono sa se l'ospite è già stato avvisato.
 */
export function listBookingMessages(venueId: string, bookingId: string) {
  return db.messageLog.findMany({
    where: { venueId, bookingId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, channel: true, status: true, sentAt: true, createdAt: true, error: true },
  });
}
