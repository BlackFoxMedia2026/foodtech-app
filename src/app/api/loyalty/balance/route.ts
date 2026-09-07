import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getSaldoFedelta } from "@/server/loyalty";

/**
 * Quanti punti ha questo cliente, e quanto valgono.
 *
 * Serve al tavolo prima di usarli: il cameriere deve poter dire «ha 180 punti,
 * sono 9 €» senza aprire la scheda del cliente e perdere il conto.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const guestId = new URL(req.url).searchParams.get("guestId")?.trim() ?? "";
    if (!guestId) return apiError(400, "bad_request", "Manca il cliente.");
    return NextResponse.json(await getSaldoFedelta(ctx.venueId, guestId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
