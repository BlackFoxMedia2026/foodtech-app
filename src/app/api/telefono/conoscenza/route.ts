import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import {
  CATEGORIE,
  creaRisposta,
  risposteDelLocale,
} from "@/server/voice/conoscenza";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Le risposte che il telefono deve dare.
 *
 * Leggere è di chi risponde al telefono (`use_phone`): le cerca mentre parla.
 * Scrivere è del manager (`manage_phone`): è una decisione del locale — «i
 * cani sì, ma non in sala» non è una cosa che si cambia durante un servizio.
 */

const Corpo = z.object({
  categoria: z.enum(CATEGORIE as [string, ...string[]]),
  argomenti: z.array(z.string().min(1).max(60)).max(20).default([]),
  risposta: z.string().min(2).max(1200),
});

export async function GET() {
  const ctx = await requireVenueApi("use_phone");
  if (!ctx.ok) return ctx.response;
  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    return NextResponse.json({
      risposte: await risposteDelLocale(ctx.venueId),
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

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    const creata = await creaRisposta(ctx.venueId, {
      categoria: corpo.categoria as never,
      argomenti: corpo.argomenti,
      risposta: corpo.risposta,
    });
    return NextResponse.json(creata, { status: 201 });
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
