import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getOrder } from "@/server/orders";

/**
 * Rileggere un conto.
 *
 * Serve dopo aver scalato una gift card o usato dei punti: quanto resta da
 * incassare lo decide il server, non la finestra aperta sul tablet. Se lo
 * calcolasse il tablet, due camerieri sullo stesso tavolo vedrebbero due
 * cifre diverse.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const conto = await getOrder(ctx.venueId, params.id);
    if (!conto) return apiError(404, "not_found", "Questo conto non esiste.");
    return NextResponse.json(conto);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
