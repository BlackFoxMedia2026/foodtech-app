import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { tavoloConsentito } from "@/server/staff-app/accesso-tavolo";
import { contoDelTavolo } from "@/server/staff-app/tavolo";
import { bozzaDelConto } from "@/server/comande/comande";
import { prendiInCaricoSeScoperto } from "@/server/staff-app/presa-in-carico";

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
    /*
      Chi batte la comanda di un tavolo scoperto lo sta servendo: da qui in
      poi è suo, e comparirà fra i suoi tavoli invece che nella coda di tutti.
      Chiedergli di premere prima «prendo io» sarebbe un tocco in più su un
      fatto che il gesto ha già dichiarato. Su un tavolo che ha già un
      responsabile non cambia niente — vedi `prendiInCaricoSeScoperto`.
    */
    await prendiInCaricoSeScoperto(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.tableId,
      { actor: attore },
    );
    const { orderId } = await contoDelTavolo(ctx.venueId, params.tableId, { actor: attore });
    const bozza = await bozzaDelConto(ctx.venueId, orderId, { waiterId: ctx.persona.waiterId });
    return NextResponse.json({ orderId, comanda: bozza });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
