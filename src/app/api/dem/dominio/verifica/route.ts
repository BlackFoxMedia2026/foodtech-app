import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { statoInvio, verificaDominio } from "@/server/dem/dominio";
import { auditActor, recordAudit } from "@/server/audit";

/**
 * «Ho configurato i DNS»: si va a guardare.
 *
 * Il risultato non è mai inventato — arriva da un controllo vero sul dominio —
 * e può benissimo essere «non ancora»: i cambi DNS ci mettono da qualche
 * minuto a qualche ora, e dirlo è più utile che far finta che sia andata.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const prima = await statoInvio(ctx.venueId);
    const dominio = await verificaDominio(ctx.venueId);
    if (!dominio) throw new Error("not_found");

    if (prima.stato !== "VERIFIED" && dominio.status === "VERIFIED") {
      await recordAudit(auditActor(ctx, req), "dem.domain_verified", "dem_domain", dominio.id, {
        dominio: dominio.sendingDomain,
      });
    }

    return NextResponse.json(await statoInvio(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
