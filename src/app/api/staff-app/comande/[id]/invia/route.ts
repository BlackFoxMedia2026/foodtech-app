import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { comandaConsentita } from "@/server/staff-app/accesso-tavolo";
import { inviaComanda } from "@/server/comande/comande";

/**
 * «Invia in cucina».
 *
 * La protezione dal doppio invio (§38) è **nel corpo della richiesta**: il
 * client genera una `invioKey` per tentativo, e due tap la mandano identica.
 * Il secondo trova la comanda già partita e riceve la stessa conferma con
 * `inviataAdesso: false` — nessun errore in faccia a chi ha solo premuto due
 * volte su una rete lenta, e nessuna seconda comanda in cucina.
 *
 * Non è un controllo applicativo: l'unicità è un vincolo del database, perché
 * due richieste in parallelo non si vedrebbero mai a vicenda.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireStaffApi("send_orders");
  if (!ctx.ok) return ctx.response;

  if (!(await comandaConsentita({ ...ctx, waiterId: ctx.persona.waiterId }, params.id))) {
    return apiError(403, "non_assegnato", "Questa comanda non è su un tuo tavolo.");
  }

  try {
    const corpo = await req.json().catch(() => ({}));
    const esito = await inviaComanda(ctx.venueId, params.id, corpo, {
      waiterId: ctx.persona.waiterId,
      userId: ctx.userId,
      actor: attoreStaff(ctx, req),
    });
    return NextResponse.json(esito);
  } catch (err) {
    return staffErrorResponse(err);
  }
}
