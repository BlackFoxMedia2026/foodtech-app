import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { chiediRimando } from "@/server/voice/rimando";

/**
 * `POST /api/v1/telefonia/rimando`
 *
 * Il centralino chiede a Tavolo se puo rimandare una chiamata al locale.
 *
 * Esiste per una ragione sola: **il cerchio**. Con la deviazione su occupato,
 * una chiamata rimandata al locale occupato torna a noi, e senza questa
 * domanda gira per sempre. La risposta e una riga: `rimanda` e il numero,
 * oppure `rimanda: false` e il motivo — che il centralino usa per decidere se
 * offrire la richiamata.
 *
 * Chiede `telefonia:write` perche **conta**: ogni domanda consuma il permesso
 * di rimandare per quella chiamata. Vedi `src/server/voice/rimando.ts`.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  /** L'identificativo della chiamata nel centralino, lo stesso degli eventi. */
  id: z.string().min(1).max(120),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const { id } = Corpo.parse(await req.json());
    return NextResponse.json(await chiediRimando(ctx.venueId, id));
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}
