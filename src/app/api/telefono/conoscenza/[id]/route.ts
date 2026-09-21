import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import {
  CATEGORIE,
  aggiornaRisposta,
  eliminaRisposta,
} from "@/server/voice/conoscenza";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

const Corpo = z.object({
  categoria: z.enum(CATEGORIE as [string, ...string[]]).optional(),
  argomenti: z.array(z.string().min(1).max(60)).max(20).optional(),
  risposta: z.string().min(2).max(1200).optional(),
  /** Spenta e non cancellata: una risposta che non vale più questa settimana. */
  attivo: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    await aggiornaRisposta(ctx.venueId, params.id, corpo as never);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errore(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    await eliminaRisposta(ctx.venueId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errore(err);
  }
}

function errore(err: unknown) {
  if (err instanceof LicenzaError) {
    return apiError(
      403,
      "centralino_non_attivo",
      "Il telefono non è attivo su questo locale.",
    );
  }
  if (err instanceof Error && err.message === "not_found") {
    return apiError(404, "not_found", "Questa risposta non esiste.");
  }
  return apiErrorResponse(err);
}
