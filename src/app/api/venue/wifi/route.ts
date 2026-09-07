import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { setPortale } from "@/server/wifi";

/** La configurazione del portale: rete, password, testi, sconto automatico. */
export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const venue = await setPortale(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) });
    return NextResponse.json({
      networkName: venue.wifiNetworkName,
      attivo: venue.wifiSetupAt != null,
      couponEnabled: venue.wifiAutoCouponEnabled,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
