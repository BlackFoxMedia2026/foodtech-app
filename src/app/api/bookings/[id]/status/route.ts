import { NextResponse } from "next/server";
import { apiError, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { updateBooking } from "@/server/bookings";
import { bookingWriteErrorResponse } from "@/server/booking-errors";

/**
 * Cambio di stato in un gesto, per la modalità Servizio.
 *
 * Esiste come endpoint suo e non come `PATCH /api/bookings/[id]` con un campo
 * in più perché durante il servizio è l'operazione più frequente e più
 * frettolosa: chi la usa preme un pulsante mentre cammina. Un percorso
 * dedicato è più difficile da sbagliare, e qui la disponibilità non va
 * ricontrollata — segnare «è arrivato» non sposta niente.
 */
const AMMESSI = ["ARRIVED", "SEATED", "COMPLETED", "NO_SHOW", "CONFIRMED"] as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!AMMESSI.includes(status)) {
    return apiError(422, "invalid_status", "Stato non valido.", { ammessi: AMMESSI });
  }

  try {
    const updated = await updateBooking(
      ctx.venueId,
      params.id,
      { status },
      // Segnare arrivo, seduta o no-show non cambia orario, coperti o tavolo:
      // il controllo di disponibilità non ha niente da verificare, e
      // rieseguirlo rifiuterebbe di segnare «seduto» un tavolo che è occupato
      // proprio da questa prenotazione.
      { skipAvailabilityCheck: true, actor: auditActor(ctx, req) },
    );
    return NextResponse.json(updated);
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}
