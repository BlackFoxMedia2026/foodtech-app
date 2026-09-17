import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { riconosciChiamante } from "@/server/telefonia";

/**
 * `GET /api/v1/telefonia/ospite?phone=...`
 *
 * La prima rotta di Tavolo che **un altro programma** chiama: il centralino
 * telefonico, che vive su un altro server e chiede «chi è questo numero?»
 * mentre il telefono squilla.
 *
 * Due cose la rendono diversa dalle altre rotte:
 *
 *  - si autentica con un **token del locale**, non con la sessione di una
 *    persona. Il `venueId` viene dal token e **non** dalla richiesta: se
 *    arrivasse come parametro, chi ha il token di un ristorante potrebbe
 *    leggere la rubrica di un altro;
 *  - ha un tetto di tempo vero. Il centralino abbandona la richiesta dopo
 *    **800 ms**, perché una persona che chiama sente il silenzio.
 *
 * `/api/v1/` nel percorso è una promessa: questa risposta la legge un
 * programma che non aggiorniamo noi, quindi la sua forma non si cambia più —
 * si aggiunge, o si fa una `v2`.
 */

/* Niente cache: la risposta dipende dal token e cambia a ogni prenotazione. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:read");
  if (!ctx.ok) return ctx.response;

  try {
    const url = new URL(req.url);
    /* `+` in una query string si decodifica come spazio: `?phone=+39333...`
       arriva come « 39333...». Non lo correggiamo qui perché a valle si
       guardano solo le cifre — ma va detto, o il prossimo pensa che il `+` si
       perda da qualche parte. */
    const phone = url.searchParams.get("phone");

    if (!phone || !phone.trim()) {
      return apiError(400, "phone_mancante", "Serve il numero che sta chiamando (`phone`).");
    }

    const esito = await riconosciChiamante(ctx.venueId, phone);
    /* 200 anche quando `guest` è `null`: «questo numero non è di nessuno» è
       una risposta, non un errore. Un 404 costringerebbe il centralino a
       trattare il caso più frequente come un guasto. */
    return NextResponse.json(esito);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
