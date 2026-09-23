import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { catalogoPerLocale } from "@/server/integrations/vista";

/**
 * Il catalogo delle integrazioni visto dal locale attivo: ogni voce con la
 * sua installazione, se c'è. Solo lettura, `integration:view`.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("integration:view");
  if (!ctx.ok) return ctx.response;
  try {
    const schede = await catalogoPerLocale(ctx.venueId, { stripe: ctx.venue.stripeChargesEnabled });
    return NextResponse.json({ schede });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
