import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { dettaglioCosti, serviziDelCiclo, avvisiDelCliente } from "@/server/costi/dettaglio";
import { ricalcolaPeriodo } from "@/server/costi/periodo";

export const dynamic = "force-dynamic";

/** Il quadro completo di un cliente. `?ricalcola=1` è il pulsante «Aggiorna». */
export async function GET(req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  /*
    Il ricalcolo è esplicito e non automatico a ogni apertura: la pagina legge
    l'aggregato che il cron tiene aggiornato ogni venti minuti, e chi vuole il
    dato di adesso lo chiede. Ricalcolare a ogni caricamento significherebbe
    rileggere il ledger di un cliente ogni volta che qualcuno passa di lì.
  */
  if (new URL(req.url).searchParams.get("ricalcola") === "1") {
    await ricalcolaPeriodo(params.venueId).catch(() => null);
  }

  const dettaglio = await dettaglioCosti(params.venueId);
  if (!dettaglio) return apiError(404, "not_found", "Locale non trovato.");

  return NextResponse.json({
    dettaglio,
    servizi: await serviziDelCiclo(params.venueId, dettaglio.ciclo, dettaglio.exchangeRate),
    avvisi: await avvisiDelCliente(params.venueId),
  });
}
