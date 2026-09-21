import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { EsitoNonModificabileError, impostaEsito } from "@/server/voice/esiti";
import { ESITI_A_MANO } from "@/lib/voice-esiti";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Dire com'è finita una telefonata.
 *
 * Solo i quattro esiti che una persona può scegliere. Gli altri li scrive il
 * sistema perché sotto c'è un fatto — una prenotazione, una riga in lista
 * d'attesa, un centralino che dice «nessuno ha risposto» — e accettarli da una
 * richiesta vorrebbe dire poter dichiarare una prenotazione che non esiste.
 *
 * `manage_bookings`: lo fa chi risponde al telefono, appena riattaccato.
 */

const Corpo = z.object({
  esito: z.enum(ESITI_A_MANO),
  nota: z.string().max(1000).nullish(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireVenueApi("use_phone");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    const esito = await impostaEsito(ctx.venueId, params.id, corpo.esito, {
      nota: corpo.nota ?? null,
      attore: ctx.session.user?.email ?? ctx.userId,
    });
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    if (err instanceof EsitoNonModificabileError) {
      /* 409 e non 422: la richiesta è ben formata, è lo **stato** che la
         rifiuta. E il messaggio dice qual è quello stato, perché chi legge
         sta guardando una riga che secondo lui era da chiudere. */
      return apiError(409, "esito_derivato", err.spiegazione);
    }
    if (err instanceof Error && err.message === "not_found") {
      return apiError(404, "not_found", "Questa chiamata non esiste.");
    }
    return apiErrorResponse(err);
  }
}
