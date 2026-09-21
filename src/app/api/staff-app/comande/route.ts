import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { puo } from "@/lib/permessi-staff";
import { comandeVive } from "@/server/comande/comande";

/**
 * L'elenco delle comande vive, per la schermata «Comande».
 *
 * Chi non ha `view_all_tables` vede **le proprie**: non è una preferenza
 * dell'interfaccia, è il filtro applicato qui — la schermata non riceve
 * nemmeno le altre.
 */
export async function GET() {
  const ctx = await requireStaffApi("view_kitchen_status");
  if (!ctx.ok) return ctx.response;

  try {
    const comande = await comandeVive(ctx.venueId, {
      waiterId: puo(ctx.permessi, "view_all_tables") ? null : ctx.persona.waiterId,
    });
    return NextResponse.json({ comande }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
