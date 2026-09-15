import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { openaiProvider } from "@/server/ai/openai-adapter";
import { tryConsumeLLMRequest } from "@/server/ai/usage-service";

/**
 * Le riscritture dell'assistente dentro l'editor email.
 *
 * Passa dalla stessa quota mensile dell'assistente del CRM
 * (`tryConsumeLLMRequest`): sono richieste allo stesso modello e allo stesso
 * costo, e una seconda porta senza contatore renderebbe il limite una
 * decorazione.
 */
const Body = z.object({
  action: z.enum(["rewrite", "shorter", "elegant", "persuasive", "fix", "alternative"]),
  text: z.string().trim().min(1).max(4000),
});

const ISTRUZIONI: Record<z.infer<typeof Body>["action"], string> = {
  rewrite: "Riscrivi il testo mantenendo lo stesso significato, con parole diverse e più scorrevoli.",
  shorter: "Accorcia il testo di almeno un terzo, togliendo il superfluo e non il senso.",
  elegant: "Riscrivi il testo con un tono più elegante e curato, senza diventare pomposo.",
  persuasive: "Riscrivi il testo rendendolo più persuasivo: un motivo concreto per venire, non slogan.",
  fix: "Correggi refusi, grammatica e punteggiatura. Non cambiare le parole che sono già corrette.",
  alternative: "Proponi una versione alternativa dello stesso messaggio, con un taglio diverso.",
};

const SISTEMA = [
  "Sei l'assistente di scrittura di un ristorante italiano che invia email ai propri clienti.",
  "Scrivi in italiano, con un tono caldo e diretto, senza superlativi pubblicitari e senza emoji.",
  "Conserva esattamente i segnaposto fra doppie graffe (per esempio {{FIRSTNAME}}): sono variabili, non testo.",
  "Rispondi SOLO con il testo finale: niente virgolette attorno, niente commenti, niente spiegazioni.",
].join(" ");

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;

  try {
    const { action, text } = Body.parse(await req.json());

    if (!openaiProvider.available) {
      return NextResponse.json(
        { error: "llm_unavailable", message: "L'assistente non è configurato su questo ambiente." },
        { status: 503 }
      );
    }

    const quota = await tryConsumeLLMRequest(ctx.venueId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          message: `Hai esaurito le ${quota.limit} richieste all'assistente di questo mese.`,
        },
        { status: 429 }
      );
    }

    let out = "";
    for await (const delta of openaiProvider.stream([
      { role: "system", content: SISTEMA },
      { role: "user", content: `${ISTRUZIONI[action]}\n\nTesto:\n${text}` },
    ])) {
      out += delta;
    }

    const cleaned = out.trim().replace(/^["«»']|["«»']$/g, "");
    if (!cleaned) {
      return NextResponse.json(
        { error: "empty_answer", message: "L'assistente non ha prodotto un testo." },
        { status: 502 }
      );
    }
    return NextResponse.json({ text: cleaned });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
