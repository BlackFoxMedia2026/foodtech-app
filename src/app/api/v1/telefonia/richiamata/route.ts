import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { apriRichiamata, NumeroNonRichiamabileError } from "@/server/voice/richiamate";

/**
 * `POST /api/v1/telefonia/richiamata`
 *
 * «Mi faccia richiamare da una persona.»
 *
 * È la versione onesta del «passo a un operatore» che vendono i concorrenti:
 * qui un operatore a cui passare **non c'è** — la voce risponde proprio perché
 * in sala non ha risposto nessuno. Trasferire una chiamata a un telefono che
 * ha già squillato a vuoto sarebbe una promessa vuota; metterla in coda alle
 * richiamate è una promessa che qualcuno mantiene.
 *
 * La coda è la stessa delle chiamate perse (`server/voice/richiamate.ts`), e
 * `apriRichiamata` è già idempotente sul numero: chi chiede due volte non
 * compare due volte.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  phone: z.string().max(40).nullish(),
  /** La chiamata da cui nasce: il numero e l'ospite si leggono da lei. */
  chiamata: z.string().max(120).nullish(),
  nota: z.string().max(500).nullish(),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");
    const corpo = Corpo.parse(await req.json());

    const esito = await apriRichiamata(
      ctx.venueId,
      {
        numero: corpo.phone ?? null,
        callId: corpo.chiamata ?? null,
        nota: corpo.nota ?? "Chiesto al risponditore: vuole parlare con una persona.",
      },
      "centralino",
    );

    return NextResponse.json({ id: esito.id, giaInCoda: esito.giaInCoda }, { status: 201 });
  } catch (err) {
    /* Numero riservato: non è un guasto, è un caso previsto. Si dice **quale**
       ostacolo, perché al telefono la frase giusta è «non vedo il suo numero,
       me lo detta?» — e la voce può dirla solo se la sa. */
    if (err instanceof NumeroNonRichiamabileError) {
      return NextResponse.json({ ok: false, perche: "numero_riservato" }, { status: 409 });
    }
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}
