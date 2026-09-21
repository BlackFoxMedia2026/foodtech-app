import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import {
  NumeroNonRichiamabileError,
  apriRichiamata,
} from "@/server/voice/richiamate";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Mettere qualcuno in coda da richiamare.
 *
 * Due modi, e servono entrambi: da una **chiamata** (il caso di ogni giorno —
 * è squillato e nessuno ha risposto) o da un **numero** scritto a mano (uno
 * chiama, c'è confusione, dice «mi richiami fra mezz'ora»: quella chiamata
 * ha risposta, e la richiamata va fatta comunque).
 *
 * Risponde **200 e non 409** quando quel numero è già in coda: chi ha premuto
 * voleva che quella persona fosse da richiamare, e lo è. Un errore lo
 * farebbe dubitare di una coda che è già giusta.
 */

const Corpo = z
  .object({
    chiamataId: z.string().min(1).nullish(),
    numero: z.string().min(3).max(40).nullish(),
    nota: z.string().max(400).nullish(),
    /** Entro quando conviene richiamare. Serve a dire «in ritardo». */
    entro: z.coerce.date().nullish(),
  })
  .refine((v) => v.chiamataId || v.numero, {
    message: "Serve la chiamata o il numero.",
  });

export async function POST(req: Request) {
  const ctx = await requireVenueApi("use_phone");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    const esito = await apriRichiamata(
      ctx.venueId,
      {
        callId: corpo.chiamataId ?? null,
        numero: corpo.numero ?? null,
        nota: corpo.nota ?? null,
        entro: corpo.entro ?? null,
      },
      ctx.session.user?.email ?? ctx.userId,
    );
    return NextResponse.json(esito, { status: esito.giaInCoda ? 200 : 201 });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    if (err instanceof NumeroNonRichiamabileError) {
      return apiError(
        422,
        "numero_non_richiamabile",
        "Questo numero non si può richiamare: è arrivato riservato.",
      );
    }
    if (err instanceof Error && err.message === "not_found") {
      return apiError(404, "not_found", "Questa chiamata non esiste.");
    }
    return apiErrorResponse(err);
  }
}
