import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireApiToken } from "@/lib/api-auth";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import { apriRichiestaEvento } from "@/server/eventi";

/**
 * `POST /api/v1/telefonia/evento`
 *
 * «Siamo quaranta per una laurea.»
 *
 * Il risponditore non prende una prenotazione da quaranta coperti — la sala si
 * concorda, e un tavolo così impegna mezza serata — e fino a ieri diceva «il
 * ristorante la richiamerà» e **non restava niente da nessuna parte**: la
 * telefonata che vale dieci coperti normali si perdeva nel modo più stupido
 * possibile.
 *
 * Adesso apre una trattativa in Tavolo, che suona nella campanella e finisce
 * nella coda di chi vende eventi. La voce può dire «l'ho segnata, la
 * richiamano» — e per la prima volta è vero.
 *
 * Idempotente sulla chiamata: il centralino che ritenta non apre due
 * trattative, e non manda due preventivi alla stessa persona.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  /** La chiamata da cui nasce: è anche la chiave anti-doppione. */
  chiamata: z.string().min(1).max(120),
  nome: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  persone: z.coerce.number().int().min(1).max(500),
  /** «un sabato di dicembre»: come l'ha detto. */
  quandoTesto: z.string().max(160).nullish(),
  tipo: z.string().max(60).nullish(),
  note: z.string().max(1000).nullish(),
});

export async function POST(req: Request) {
  const ctx = await requireApiToken(req, "telefonia:write");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "prenotazioni");
    const corpo = Corpo.parse(await req.json());

    const esito = await apriRichiestaEvento(
      ctx.venueId,
      {
        /* Senza nome si usa il numero: è meglio di «Sconosciuto» in una coda
           dove qualcuno deve richiamare. */
        nome: corpo.nome?.trim() || corpo.phone?.trim() || "Richiesta dal telefono",
        telefono: corpo.phone ?? null,
        persone: corpo.persone,
        quandoTesto: corpo.quandoTesto ?? null,
        tipo: corpo.tipo ?? null,
        note: corpo.note ?? null,
        callId: corpo.chiamata,
      },
      { da: "telefono" },
    );

    return NextResponse.json(esito, { status: esito.giaAperta ? 200 : 201 });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}
