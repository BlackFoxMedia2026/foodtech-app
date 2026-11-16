import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { openaiProvider, trascriviAudio } from "@/server/ai/openai-adapter";

/** Due minuti di parlato compresso stanno larghi sotto questa soglia. */
const MAX_BYTE = 8 * 1024 * 1024;

/**
 * Trascrive un vocale per l'agente.
 *
 * Non consuma la quota dei messaggi AI: la consuma il messaggio, quando parte.
 * Trascrivere e poi non mandare (dettatura corretta e cancellata) non deve
 * costare un messaggio a chi ha cambiato idea.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  if (!openaiProvider.available) {
    return apiError(503, "ai_unavailable", "La trascrizione non è attiva su questa installazione.");
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return apiError(422, "audio_missing", "Non è arrivato nessun audio. Riprova.");
    }
    if (audio.size > MAX_BYTE) {
      return apiError(413, "audio_too_long", "Il vocale è troppo lungo: resta sotto i due minuti.");
    }

    const testo = await trascriviAudio(audio);
    if (!testo) {
      return apiError(422, "audio_empty", "Non ho sentito niente. Avvicina il telefono e riprova.");
    }
    return NextResponse.json({ testo }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
