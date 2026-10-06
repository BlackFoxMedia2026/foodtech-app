import { NextResponse } from "next/server";
import { apiError, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
import { GiaGestitaError, gestisciNuova } from "@/server/prenotazioni-nuove";

/**
 * I tre gesti del riquadro «Prenotazioni» della Panoramica: conferma, rifiuta,
 * segna come vista.
 *
 * Un percorso suo e non `status` perché ognuno di questi gesti segna anche la
 * prenotazione come **vista** (`Booking.seenAt`), e perché vale solo su una
 * prenotazione ancora da gestire: se un collega l'ha già fatto, 409.
 */
const AZIONI = ["conferma", "rifiuta", "vista"] as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  const body = await req.json().catch(() => null);
  const azione = body?.azione;
  if (!AZIONI.includes(azione)) {
    return apiError(422, "invalid_action", "Azione non valida.", { ammesse: AZIONI });
  }

  try {
    const aggiornata = await gestisciNuova(ctx.venueId, params.id, azione, auditActor(ctx, req));
    return NextResponse.json(aggiornata);
  } catch (err) {
    if (err instanceof GiaGestitaError) {
      return apiError(409, "already_handled", "Qualcuno l'ha già gestita.");
    }
    return bookingWriteErrorResponse(err);
  }
}
