import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { comandaConsentita } from "@/server/staff-app/accesso-tavolo";
import { aggiungiRiga } from "@/server/comande/comande";
import { avvisaModificaComanda } from "@/server/staff-app/notifiche";
import { db } from "@/lib/db";

/**
 * Batte un piatto sulla comanda.
 *
 * È il gesto più frequente dell'intera Staff App: il «+» sulla card del piatto
 * arriva qui. Una richiesta, una riga, la comanda aggiornata di ritorno — così
 * la schermata non deve ricaricare niente per mostrare il carrello cresciuto.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireStaffApi("create_orders");
  if (!ctx.ok) return ctx.response;

  if (!(await comandaConsentita({ ...ctx, waiterId: ctx.persona.waiterId }, params.id))) {
    return apiError(403, "non_assegnato", "Questa comanda non è su un tuo tavolo.");
  }

  try {
    const corpo = await req.json().catch(() => ({}));
    const esito = await aggiungiRiga(ctx.venueId, params.id, corpo, {
      actor: attoreStaff(ctx, req),
    });

    if (esito.avvisaCucina) await avvisaCucina(ctx.venueId, params.id, "Un piatto aggiunto");
    return NextResponse.json(esito.comanda);
  } catch (err) {
    return staffErrorResponse(err);
  }
}

/** §24: una comanda già in cucina non si modifica in silenzio. */
async function avvisaCucina(venueId: string, comandaId: string, cosa: string) {
  const c = await db.comanda.findUnique({
    where: { id: comandaId },
    select: { waiterId: true, numero: true, tableId: true, table: { select: { label: true } } },
  });
  if (!c) return;
  await avvisaModificaComanda(venueId, {
    waiterId: c.waiterId,
    tavolo: c.table?.label ?? null,
    tableId: c.tableId,
    numero: c.numero,
    cosa,
  });
}
