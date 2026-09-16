import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { WifiError, setPortale, statoPortale } from "@/server/wifi";

/** La configurazione del portale: rete, password, testi, campi, sconto automatico. */
export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const venue = await setPortale(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) });
    return NextResponse.json({
      ...statoPortale(venue),
      couponEnabled: venue.wifiAutoCouponEnabled,
    });
  } catch (err) {
    // Il solo errore di questa rotta che vale una frase sua: spegnere tutti i
    // recapiti lascerebbe un modulo che chiede un nome e non sa dove trovare
    // la persona.
    if (err instanceof WifiError && err.code === "no_field") {
      return apiError(
        400,
        err.code,
        "Serve almeno un recapito: tieni acceso l'indirizzo email o il telefono.",
      );
    }
    return apiErrorResponse(err);
  }
}
