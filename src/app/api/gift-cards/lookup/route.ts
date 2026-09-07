import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { findGiftCardByCode, MOTIVO_GIFT_CARD } from "@/server/gift-cards";

/**
 * Cosa c'è su questa carta.
 *
 * Serve al tavolo, prima di scalare: il cameriere deve poter dire «ci sono
 * 62 €» senza tentare un utilizzo e vedere cosa succede. La dedica e il nome
 * del destinatario non tornano: qui interessa il residuo.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
    if (!code) return apiError(400, "bad_request", "Scrivi il codice della gift card.");

    const card = await findGiftCardByCode(ctx.venueId, code);
    if (!card) return apiError(404, "not_found", "Nessuna gift card con questo codice.");

    return NextResponse.json({
      id: card.id,
      code: card.code,
      residuoCents: card.residuoCents,
      initialCents: card.initialCents,
      currency: card.currency,
      expiresAt: card.expiresAt,
      stato: card.stato,
      motivo: card.stato === "usabile" ? null : MOTIVO_GIFT_CARD[card.stato],
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
