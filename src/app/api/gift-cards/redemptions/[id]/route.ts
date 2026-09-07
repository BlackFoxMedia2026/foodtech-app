import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { GiftCardError, undoGiftCardRedemption } from "@/server/gift-cards";

/**
 * Rimette l'importo sulla carta.
 *
 * Come per i coupon, lo sbaglio più comune al tavolo non è la frode: è aver
 * scalato la cifra sbagliata, o sulla carta sbagliata. Deve poterlo rimediare
 * chi sta servendo, subito.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await undoGiftCardRedemption(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof GiftCardError) {
      return apiError(404, "not_found", "Questo utilizzo non esiste o è già stato annullato.");
    }
    return apiErrorResponse(err);
  }
}
