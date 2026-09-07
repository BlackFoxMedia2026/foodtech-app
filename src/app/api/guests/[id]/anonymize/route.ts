import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { ErasureError, anonimizzaOspite, anteprimaCancellazione } from "@/server/guest-erasure";

const Body = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Scrivi perché: fra un anno «anonimizzato» senza contesto non si distingue da un errore")
    .max(300),
});

/**
 * Cosa sparirebbe e cosa resterebbe.
 *
 * Una cancellazione irreversibile non si chiede con «sei sicuro?»: si chiede
 * mostrando l'elenco. `manage_venue` anche solo per guardare, perché l'elenco
 * dice quante note riservate esistono su quella persona.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await anteprimaCancellazione(ctx.venueId, params.id));
  } catch (err) {
    if (err instanceof ErasureError) return apiError(404, "not_found", "Questo cliente non esiste.");
    return apiErrorResponse(err);
  }
}

/** Esegue la cancellazione. Irreversibile, e riservata a un manager. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = Body.parse(await req.json());
    return NextResponse.json(
      await anonimizzaOspite(ctx.venueId, params.id, body, { actor: auditActor(ctx, req) }),
    );
  } catch (err) {
    if (err instanceof ErasureError) {
      if (err.code === "already_anonymized") {
        return apiError(409, err.code, "I dati di questa persona sono già stati cancellati.");
      }
      if (err.code === "reason_required") {
        return apiError(400, err.code, "Scrivi il motivo della cancellazione.");
      }
      return apiError(404, "not_found", "Questo cliente non esiste.");
    }
    return apiErrorResponse(err);
  }
}
