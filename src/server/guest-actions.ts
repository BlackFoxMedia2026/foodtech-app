import { db } from "@/lib/db";
import { verifyBookingToken, type BookingAction } from "@/lib/booking-token";
import { recordAudit } from "./audit";
import { disdiciDaFuori } from "./bookings";

/**
 * Le azioni che un ospite compie dal link nel promemoria, senza account.
 *
 * Il token è l'autorizzazione: firmato, legato a una prenotazione **e** a
 * un'azione. Non c'è sessione, quindi non c'è `venueId` dal contesto — il
 * locale si deduce dalla prenotazione, ed è l'unico caso in tutto il progetto
 * in cui è legittimo.
 *
 * L'azione non parte mai da una GET: i client di posta precaricano i link, e
 * un annullamento innescato da un'anteprima è una cena persa senza che
 * nessuno abbia cliccato. La pagina mostra, il POST agisce.
 */

export type GuestBookingView = {
  bookingId: string;
  action: BookingAction;
  guestName: string | null;
  venueName: string;
  venuePhone: string | null;
  timezone: string;
  startsAt: string;
  partySize: number;
  status: string;
  /** Vero quando l'azione del link non ha più senso (già annullata, già passata). */
  closed: boolean;
  /**
   * La richiesta aspetta ancora il sì del locale. L'ospite può dire che ci
   * sarà, ma non è lui a confermarla: la pagina lo deve dire.
   */
  inAttesa: boolean;
};

export async function readBookingByToken(token: string): Promise<GuestBookingView | null> {
  const verified = verifyBookingToken(token);
  if (!verified) return null;

  const booking = await db.booking.findFirst({
    where: { id: verified.bookingId, deletedAt: null },
    include: {
      guest: { select: { firstName: true } },
      venue: { select: { name: true, phone: true, timezone: true } },
    },
  });
  if (!booking) return null;

  const passata = booking.startsAt.getTime() < Date.now();
  const chiusa = ["CANCELLED", "NO_SHOW", "COMPLETED"].includes(booking.status);

  return {
    bookingId: booking.id,
    action: verified.action,
    guestName: booking.guest?.firstName ?? null,
    venueName: booking.venue.name,
    venuePhone: booking.venue.phone,
    timezone: booking.venue.timezone,
    startsAt: booking.startsAt.toISOString(),
    partySize: booking.partySize,
    status: booking.status,
    closed: chiusa || passata,
    inAttesa: booking.status === "PENDING",
  };
}

export type GuestActionResult =
  | { ok: true; status: string; message: string }
  | {
      ok: false;
      code: "invalid_token" | "not_found" | "already_closed" | "not_allowed" | "too_late";
      message: string;
    };

export async function applyBookingAction(token: string): Promise<GuestActionResult> {
  const verified = verifyBookingToken(token);
  if (!verified) {
    return { ok: false, code: "invalid_token", message: "Questo link non è più valido." };
  }
  if (verified.action !== "confirm" && verified.action !== "cancel") {
    return { ok: false, code: "not_allowed", message: "Questo link non permette questa operazione." };
  }

  const booking = await db.booking.findFirst({
    where: { id: verified.bookingId, deletedAt: null },
    include: { venue: { select: { orgId: true } } },
  });
  if (!booking) {
    return { ok: false, code: "not_found", message: "Questa prenotazione non esiste più." };
  }

  if (["CANCELLED", "NO_SHOW", "COMPLETED"].includes(booking.status)) {
    return {
      ok: false,
      code: "already_closed",
      message:
        booking.status === "CANCELLED"
          ? "Questa prenotazione è già stata annullata."
          : "Questa prenotazione è già stata chiusa. Chiamaci se ti serve una mano.",
    };
  }

  const attore = {
    userId: "guest",
    email: null,
    orgId: booking.venue.orgId,
    venueId: booking.venueId,
  };

  if (verified.action === "confirm") {
    /*
      «Sì, ci sono» dice che l'ospite verrà. Non **approva** niente e non
      riporta indietro niente.

      Prima scriveva `CONFIRMED` qualunque fosse lo stato: una richiesta dal
      sito ancora da valutare diventava confermata col clic dell'ospite stesso
      — cioè il locale si trovava un tavolo promesso che non aveva mai
      accettato — e un ospite già arrivato che riapriva la mail tornava
      «confermato», con l'orologio della sala che ripartiva da capo.

      Quindi lo stato non si tocca mai: resta scritto nel registro che
      l'ospite ha risposto, che è l'informazione utile a chi guarda la sala.
    */
    const inAttesa = booking.status === "PENDING";
    // L'attore è l'ospite, non un membro dello staff: nel registro resta
    // l'azione senza utente interno, che è esattamente l'informazione utile.
    await recordAudit(attore, "booking.guest_confirmed", "booking", booking.id, {
      statoPrecedente: booking.status,
      ...(inAttesa ? { inAttesaDelLocale: true } : {}),
    });
    return {
      ok: true,
      status: booking.status,
      message: inAttesa
        ? "Grazie! La tua richiesta è ancora in attesa di conferma da parte del locale: non è ancora un tavolo confermato."
        : "Grazie, ci vediamo presto!",
    };
  }

  /*
    La disdetta passa dalla stessa strada delle altre: caparra da restituire,
    annuncio alla sala, contatori dell'ospite. Prima scriveva lo stato da sé,
    e il tavolo liberato dall'ospite restava apparecchiato senza che la sala
    lo sapesse.
  */
  const esito = await disdiciDaFuori(booking.venueId, booking.id);
  if (!esito.ok) {
    if (esito.perche === "gia_passata") {
      return {
        ok: false,
        code: "too_late",
        message: "L'orario di questa prenotazione è già passato: per qualsiasi cosa chiama il locale.",
      };
    }
    if (esito.perche === "stato" && esito.stato === "CANCELLED") {
      return { ok: false, code: "already_closed", message: "Questa prenotazione è già stata annullata." };
    }
    if (esito.perche === "non_trovata") {
      return { ok: false, code: "not_found", message: "Questa prenotazione non esiste più." };
    }
    return {
      ok: false,
      code: "already_closed",
      message: "Questa prenotazione non si può più annullare da qui. Chiamaci se ti serve una mano.",
    };
  }

  await recordAudit(attore, "booking.guest_cancelled", "booking", booking.id, {
    statoPrecedente: booking.status,
    quando: booking.startsAt.toISOString(),
    coperti: booking.partySize,
  });

  return {
    ok: true,
    status: esito.booking.status,
    message: "Prenotazione annullata. Grazie per avercelo detto: possiamo rimettere il tavolo a disposizione.",
  };
}
