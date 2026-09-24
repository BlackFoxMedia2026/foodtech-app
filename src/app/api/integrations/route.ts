import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { catalogoCliente } from "@/server/integrations/vista-cliente";

/**
 * Il catalogo delle integrazioni visto dal locale attivo: ogni voce con la
 * sua installazione, se c'è, nella versione per il cliente (`vista-cliente.ts`).
 * Solo lettura, `integration:view`.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("integration:view");
  if (!ctx.ok) return ctx.response;
  try {
    const schede = await catalogoCliente(ctx.venueId, { stripe: ctx.venue.stripeChargesEnabled });
    return NextResponse.json({ schede });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
