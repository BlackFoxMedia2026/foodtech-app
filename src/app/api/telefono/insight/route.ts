import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { proponiInsight } from "@/server/voice/insight";
import { TIPI_INSIGHT } from "@/lib/voice-insight";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Proporre un'informazione emersa in chiamata.
 *
 * `use_phone`: la scrive chi risponde al telefono, mentre parla. Non entra
 * nella scheda di nessuno finché qualcuno non la approva — e approvare chiede
 * `manage_bookings`, la stessa capacità con cui si modifica una scheda a mano.
 */

const Corpo = z.object({
  chiamataId: z.string().min(1),
  tipo: z.enum(TIPI_INSIGHT),
  valore: z.string().min(2).max(300),
});

export async function POST(req: Request) {
  const ctx = await requireVenueApi("use_phone");
  if (!ctx.ok) return ctx.response;
  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    const creato = await proponiInsight(
      ctx.venueId,
      corpo.chiamataId,
      { tipo: corpo.tipo, valore: corpo.valore },
      ctx.session.user?.email ?? ctx.userId,
    );
    return NextResponse.json(creato, { status: 201 });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    if (err instanceof Error && err.message === "not_found") {
      return apiError(404, "not_found", "Questa chiamata non esiste.");
    }
    return apiErrorResponse(err);
  }
}
