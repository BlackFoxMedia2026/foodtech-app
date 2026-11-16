import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { cercaOspitiPerNome } from "@/server/guests";

/**
 * Gli ospiti il cui nome somiglia a quello che si sta scrivendo (walk-in).
 *
 * Dietro `manage_bookings` come `riconosci`: chi può accomodare può sapere
 * se una persona è già passata di qui, e nient'altro.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(
      { ospiti: await cercaOspitiPerNome(ctx.venueId, q.slice(0, 80)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
