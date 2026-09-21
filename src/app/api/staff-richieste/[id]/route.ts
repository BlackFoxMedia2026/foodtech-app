import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { RichiestaError, decidiRichiesta } from "@/server/staff-richieste";
import { messaggio } from "../route";

/**
 * Decidere una richiesta.
 *
 * `PATCH` e non `PUT`: non si sostituisce la richiesta, si aggiunge la
 * decisione. Quello che la persona ha chiesto resta scritto com'era — è
 * l'unica versione che le due parti hanno vista.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  stato: z.enum(["APPROVED", "REJECTED", "WITHDRAWN"]),
  nota: z.string().trim().max(1000).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_shifts");
  if (!ctx.ok) return ctx.response;
  try {
    const corpo = Corpo.parse(await req.json());
    const decisa = await decidiRichiesta(
      ctx.venueId,
      params.id,
      corpo,
      auditActor(ctx, req),
    );
    return NextResponse.json(decisa);
  } catch (err) {
    if (err instanceof RichiestaError) return messaggio(err);
    return apiErrorResponse(err);
  }
}
