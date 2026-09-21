import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { tavoloConsentito } from "@/server/staff-app/accesso-tavolo";
import { contoDelTavolo } from "@/server/staff-app/tavolo";
import { bozzaDelConto } from "@/server/comande/comande";

/**
 * «+ Aggiungi ordine»: apre la comanda in bozza del tavolo.
 *
 * Apre il conto se non c'era (idempotente), crea i commensali se mancavano,
 * restituisce la bozza — quella già aperta se qualcuno l'ha aperta un istante
 * prima. Un solo giro di rete per il gesto più frequente del servizio.
 */
export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("create_orders");
  if (!ctx.ok) return ctx.response;

  if (!(await tavoloConsentito({ ...ctx, waiterId: ctx.persona.waiterId }, params.tableId))) {
    return apiError(403, "non_assegnato", "Questo tavolo non è fra i tuoi.");
  }

  try {
    const attore = attoreStaff(ctx, req);
    const { orderId } = await contoDelTavolo(ctx.venueId, params.tableId, { actor: attore });
    const bozza = await bozzaDelConto(ctx.venueId, orderId, { waiterId: ctx.persona.waiterId });
    return NextResponse.json({ orderId, comanda: bozza });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
