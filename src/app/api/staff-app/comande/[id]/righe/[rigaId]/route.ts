import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { comandaConsentita } from "@/server/staff-app/accesso-tavolo";
import { aggiornaRiga } from "@/server/comande/comande";
import { avvisaModificaComanda } from "@/server/staff-app/notifiche";
import { db } from "@/lib/db";

/**
 * Cambia una riga: quantità, variazioni, ospite, allergie, nota.
 *
 * A quantità zero la riga se ne va — in bozza sparisce, dopo l'invio resta
 * annullata. Su una comanda già in cucina serve `confermaModifica: true`, e
 * senza si riceve un 409 con codice `modifica_da_confermare`: è il 409 che
 * l'interfaccia traduce nella conferma esplicita del §24.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; rigaId: string } },
) {
  const ctx = await requireStaffApi("edit_orders");
  if (!ctx.ok) return ctx.response;

  if (!(await comandaConsentita({ ...ctx, waiterId: ctx.persona.waiterId }, params.id))) {
    return apiError(403, "non_assegnato", "Questa comanda non è su un tuo tavolo.");
  }

  try {
    const corpo = await req.json().catch(() => ({}));
    const esito = await aggiornaRiga(ctx.venueId, params.id, params.rigaId, corpo, {
      actor: attoreStaff(ctx, req),
    });

    if (esito.avvisaCucina) {
      const c = await db.comanda.findUnique({
        where: { id: params.id },
        select: { waiterId: true, numero: true, tableId: true, table: { select: { label: true } } },
      });
      if (c) {
        await avvisaModificaComanda(ctx.venueId, {
          waiterId: c.waiterId,
          tavolo: c.table?.label ?? null,
          tableId: c.tableId,
          numero: c.numero,
          cosa: corpo?.quantity === 0 ? "Una voce annullata" : "Una voce modificata",
        });
      }
    }

    return NextResponse.json(esito.comanda);
  } catch (err) {
    return staffErrorResponse(err);
  }
}
