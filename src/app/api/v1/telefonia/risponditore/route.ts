import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { risponditorePerCentralino } from "@/server/voice/benvenuto";

/**
 * `GET /api/v1/telefonia/risponditore`
 *
 * Cosa deve dire il risponditore quando alza: il saluto scritto dal locale, il
 * nome del locale e il suo fuso.
 *
 * Il centralino la chiama **mentre il telefono squilla**, quindi tiene in
 * memoria l'ultima risposta e non aspetta questa per rispondere: se Tavolo è
 * lento o fermo, la voce alza comunque col saluto che aveva l'ultima volta.
 * Una telefonata non si perde per un campo di testo.
 *
 * `venueId` viene dal token e non dalla richiesta: se arrivasse come
 * parametro, chi ha il token di un ristorante leggerebbe il saluto di un
 * altro — e nel saluto c'è il nome del locale.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:read");
  if (!ctx.ok) return ctx.response;

  try {
    /* La stessa funzione che serve le prenotazioni al telefono: il saluto del
       risponditore è parte di quella, non una cosa a sé che si possa avere
       senza. */
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");
    return NextResponse.json(await risponditorePerCentralino(ctx.venueId));
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}
