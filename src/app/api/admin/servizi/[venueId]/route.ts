import { NextResponse } from "next/server";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { logEvento } from "@/lib/observability";
import { cambiaServizio } from "@/server/admin/servizi";

/**
 * Accende o spegne un servizio a un locale.
 *
 * Il controllo sta qui, come per tutto il pannello di piattaforma, e a chi non
 * è amministratore risponde **404**: un 403 è comunque una risposta, e dice
 * che a questo indirizzo c'è qualcosa.
 *
 * Questa rotta accende il telefono a un ristorante. Nel registro va **chi**,
 * perché è l'unica domanda che si fa davanti a un servizio comparso o sparito.
 */
export async function PUT(req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const corpo = await req.json();
    await cambiaServizio(params.venueId, corpo, admin.email);
    logEvento("admin.servizio_cambiato", {
      venueId: params.venueId,
      da: admin.email,
      corpo,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "locale_non_trovato") {
      return apiError(404, "not_found", "Questo locale non esiste.");
    }
    return apiErrorResponse(err);
  }
}
