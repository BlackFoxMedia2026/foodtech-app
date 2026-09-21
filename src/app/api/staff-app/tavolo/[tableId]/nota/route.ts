import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { tavoloConsentito } from "@/server/staff-app/accesso-tavolo";
import { scriviNotaTavolo } from "@/server/staff-app/tavolo";

/** La nota di servizio: «compleanno», «portare la torta alle 22:30». */
export async function PATCH(req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  if (!(await tavoloConsentito({ ...ctx, waiterId: ctx.persona.waiterId }, params.tableId))) {
    return apiError(403, "non_assegnato", "Questo tavolo non è fra i tuoi.");
  }

  try {
    const corpo = await req.json().catch(() => ({}));
    return NextResponse.json(
      await scriviNotaTavolo(ctx.venueId, params.tableId, corpo, { actor: attoreStaff(ctx, req) }),
    );
  } catch (err) {
    return staffErrorResponse(err);
  }
}
