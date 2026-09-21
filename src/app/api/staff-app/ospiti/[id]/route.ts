import { NextResponse } from "next/server";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { rinominaOspite } from "@/server/comande/comande";

/**
 * Rinomina un commensale: «Ospite 2» diventa «Laura».
 *
 * Il controllo di appartenenza al locale sta nella `where` di
 * `rinominaOspite` (`order: { venueId }`): un identificativo di un altro
 * ristorante non trova niente e riceve 404, non l'errore di un permesso — che
 * confermerebbe l'esistenza della riga.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireStaffApi("edit_orders");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = await req.json().catch(() => ({}));
    return NextResponse.json(
      await rinominaOspite(ctx.venueId, params.id, corpo, { actor: attoreStaff(ctx, req) }),
    );
  } catch (err) {
    return staffErrorResponse(err);
  }
}
