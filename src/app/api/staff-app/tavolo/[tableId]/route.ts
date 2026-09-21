import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { puo } from "@/lib/permessi-staff";
import { apiError } from "@/lib/api-auth";
import { apriTavolo } from "@/server/staff-app/tavolo";

/**
 * Il tavolo aperto.
 *
 * Il controllo che conta è l'ultimo: chi non ha `view_all_tables` può aprire
 * **solo i propri tavoli**. Non è una regola dell'interfaccia — un cameriere
 * che scrive a mano l'identificativo di un tavolo di un collega riceve 403,
 * che è esattamente quello che chiede il §47 del brief.
 */
export async function GET(_req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("view_tables");
  if (!ctx.ok) return ctx.response;

  try {
    const tavolo = await apriTavolo(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.tableId,
    );

    if (!tavolo.mio && !puo(ctx.permessi, "view_all_tables")) {
      return apiError(403, "non_assegnato", "Questo tavolo non è fra i tuoi.");
    }

    return NextResponse.json(tavolo, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
