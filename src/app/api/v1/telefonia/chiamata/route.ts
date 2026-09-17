import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";
import { registraEventoChiamata } from "@/server/chiamate";

/**
 * `POST /api/v1/telefonia/chiamata`
 *
 * Il centralino dice a Tavolo che il telefono sta squillando, e poi come è
 * finita. È la rotta che fa comparire il riquadro in Servizio.
 *
 * Chiede l'ambito **`telefonia:write`**, non `read`: qui si scrive. Un token
 * che legge la rubrica non deve poter inventare chiamate — comparirebbero
 * sullo schermo di chi lavora in sala.
 *
 * Ogni evento della stessa chiamata porta lo stesso `id`, e la riga si
 * aggiorna: una consegna ripetuta, che su una rete succede, non deve far
 * comparire due volte la stessa persona.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  /** L'identificativo della chiamata **nel centralino**. */
  id: z.string().min(1).max(120),
  /** Il numero di chi chiama. Assente quando arriva riservato. */
  phone: z.string().max(40).nullish(),
  stato: z.enum(["RINGING", "ANSWERED", "MISSED", "ENDED"]),
  /** Quando è successo, se diverso da adesso. */
  quando: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");

    const corpo = Corpo.parse(await req.json());
    const esito = await registraEventoChiamata(ctx.venueId, {
      externalId: corpo.id,
      phone: corpo.phone ?? null,
      stato: corpo.stato,
      quando: corpo.quando ? new Date(corpo.quando) : undefined,
    });

    /* Si risponde con chi è stato riconosciuto, così il centralino può dirlo
       anche altrove — sul suo cruscotto, o a voce nel risponditore — senza
       fare una seconda chiamata mentre il telefono squilla. */
    return NextResponse.json({
      id: esito.id,
      stato: esito.stato,
      chi: esito.chi
        ? {
            id: esito.chi.id,
            firstName: esito.chi.firstName,
            lastName: esito.chi.lastName,
            blocked: esito.chi.blocked,
            noShowCount: esito.chi.noShowCount,
          }
        : null,
    });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    return apiErrorResponse(err);
  }
}
