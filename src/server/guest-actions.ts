import { db } from "@/lib/db";
import { verifyBookingToken, type BookingAction } from "@/lib/booking-token";
import { recordAudit } from "./audit";

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
  };
}

export type GuestActionResult =
  | { ok: true; status: string; message: string }
  | { ok: false; code: "invalid_token" | "not_found" | "already_closed" | "not_allowed"; message: string };

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

  if (verified.action === "confirm") {
    const aggiornata = await db.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED" },
    });
    // L'attore è l'ospite, non un membro dello staff: nel registro resta
    // l'azione senza utente interno, che è esattamente l'informazione utile.
    await recordAudit(
      { userId: "guest", email: null, orgId: booking.venue.orgId, venueId: booking.venueId },
      "booking.guest_confirmed",
      "booking",
      booking.id,
      { statoPrecedente: booking.status },
    );
    return { ok: true, status: aggiornata.status, message: "Grazie, ci vediamo presto!" };
  }

  const aggiornata = await db.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", closedAt: new Date() },
  });
  await recordAudit(
    { userId: "guest", email: null, orgId: booking.venue.orgId, venueId: booking.venueId },
    "booking.guest_cancelled",
    "booking",
    booking.id,
    { statoPrecedente: booking.status, quando: booking.startsAt.toISOString(), coperti: booking.partySize },
  );

  return {
    ok: true,
    status: aggiornata.status,
    message: "Prenotazione annullata. Grazie per avercelo detto: possiamo rimettere il tavolo a disposizione.",
  };
}
