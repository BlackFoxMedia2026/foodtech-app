import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { apriRecupero } from "@/server/voice/recupero-link";

/**
 * `POST /api/v1/telefonia/interrotta`
 *
 * Il risponditore dice: «questa persona stava prenotando e ha riattaccato
 * prima di confermare» — con quello che aveva già raccolto.
 *
 * Tavolo apre il recupero, prova a mandare il link, e **dichiara com'è andato
 * l'invio**: se su questa installazione non c'è un canale per mandare
 * messaggi, la risposta lo dice invece di far credere che il cliente abbia
 * ricevuto qualcosa.
 *
 * Chiede la funzione `prenotazioni` della licenza, non `riconoscimento`: qui
 * non si riconosce chi chiama, si prepara una prenotazione.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");
    const esito = await apriRecupero(ctx.venueId, await req.json(), origine(req));
    /* Il link torna al centralino **una volta sola**, e non perché gli serva:
       perché nei suoi registri resti la traccia di cosa è stato mandato. In
       tabella, da qui in avanti, c'è solo il suo hash. */
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "funzione_non_attiva",
        "Le prenotazioni al telefono non sono attive su questo locale.",
      );
    }
    return apiErrorResponse(err);
  }
}

function origine(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
