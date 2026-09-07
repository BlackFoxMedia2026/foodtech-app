import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { OrderError, cancelOrder } from "@/server/orders";

/** Annulla il conto: resta in tabella, segnato annullato, e non fa incasso. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await cancelOrder(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof OrderError) {
      return apiError(err.code === "already_closed" ? 409 : 404, err.code, "Questo conto non è più aperto.");
    }
    return apiErrorResponse(err);
  }
}
