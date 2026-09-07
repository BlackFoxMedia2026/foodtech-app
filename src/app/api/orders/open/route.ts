import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { OrderError, openOrderForBooking } from "@/server/orders";

const Body = z.object({ bookingId: z.string().min(1) });

/** Apre il conto di una prenotazione, o restituisce quello già aperto. */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const { bookingId } = Body.parse(await req.json());
    return NextResponse.json(await openOrderForBooking(ctx.venueId, bookingId, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof OrderError) return apiError(404, "not_found", "Prenotazione non trovata.");
    return apiErrorResponse(err);
  }
}
