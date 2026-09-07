import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { OrderError, closeOrder } from "@/server/orders";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await closeOrder(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof OrderError) {
      if (err.code === "empty_order") {
        return apiError(
          409,
          "empty_order",
          "Il conto è vuoto: un incasso da zero euro fra i dati veri non si distingue da un errore. Annullalo, se era uno sbaglio.",
        );
      }
      return apiError(err.code === "already_closed" ? 409 : 404, err.code, "Il conto è già chiuso.");
    }
    return apiErrorResponse(err);
  }
}
