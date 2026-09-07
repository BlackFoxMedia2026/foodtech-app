import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { db } from "@/lib/db";
import { setRegoleFedelta } from "@/server/loyalty";

/**
 * Le due regole della raccolta punti.
 *
 * Le decide il locale, e senza entrambe la raccolta resta spenta: accenderla a
 * metà vorrebbe dire far accumulare punti che non si possono spendere, oppure
 * decidere noi quanto vale un punto — che è denaro del locale.
 */
export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await setRegoleFedelta(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const venue = await db.venue.findUnique({
    where: { id: ctx.venueId },
    select: { loyaltyPointsPerEuro: true, loyaltyPointValueCents: true },
  });
  return NextResponse.json(venue ?? { loyaltyPointsPerEuro: null, loyaltyPointValueCents: null });
}
