import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { FormazioneError, deleteTraining, updateTraining } from "@/server/staff-formazione";

type Params = { params: { id: string; trainingId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    const updated = await updateTraining(ctx.venueId, params.id, params.trainingId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof FormazioneError) return apiError(404, err.code, "Questo corso non esiste più.");
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteTraining(ctx.venueId, params.id, params.trainingId, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof FormazioneError) return apiError(404, err.code, "Questo corso non esiste più.");
    return apiErrorResponse(err);
  }
}
