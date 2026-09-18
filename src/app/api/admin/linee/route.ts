import { NextResponse } from "next/server";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { logEvento } from "@/lib/observability";
import { LineaError, montaEAssegna } from "@/server/admin/linee";
import { CentralinoRemotoError } from "@/server/admin/centralino-remoto";
import { NumeroDiUnAltroError } from "@/server/voice/numeri-linea";

/**
 * Monta una linea dell'operatore e la assegna a un locale.
 *
 * Nel registro finisce cosa è stato montato e **non** la password: quella passa
 * da questa richiesta al file di configurazione del centralino e da nessuna
 * altra parte — né in tabella, né nei log, né in una risposta.
 */
export async function POST(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const corpo = (await req.json()) as Record<string, unknown>;
    const esito = await montaEAssegna(corpo);
    logEvento("admin.linea_montata", {
      da: admin.email,
      venueId: String(corpo.venueId ?? ""),
      host: String(corpo.host ?? ""),
      numero: esito.numero,
      montata: esito.montata,
    });
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof LineaError) {
      return apiError(err.codice === "locale_non_trovato" ? 404 : 409, err.codice, err.message);
    }
    if (err instanceof CentralinoRemotoError) {
      return apiError(502, err.codice, err.message, err.dettaglio);
    }
    if (err instanceof NumeroDiUnAltroError) {
      return apiError(
        409,
        "numero_di_un_altro_locale",
        "Questo numero è già assegnato a un altro locale in Tavolo.",
        { numero: err.numero },
      );
    }
    return apiErrorResponse(err);
  }
}
