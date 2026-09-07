import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { deleteExperience, setExperiencePublished, updateExperience } from "@/server/experiences";

const SoloPubblicazione = z.object({ published: z.boolean() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    // Il solo interruttore «pubblicata» non deve pretendere tutti gli altri
    // campi: è un gesto, non una modifica.
    const soloStato = SoloPubblicazione.safeParse(body);
    const aggiornata =
      soloStato.success && Object.keys(body).length === 1
        ? await setExperiencePublished(ctx.venueId, params.id, soloStato.data.published, {
            actor: auditActor(ctx, req),
          })
        : await updateExperience(ctx.venueId, params.id, body, { actor: auditActor(ctx, req) });
    return NextResponse.json(aggiornata);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await deleteExperience(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
