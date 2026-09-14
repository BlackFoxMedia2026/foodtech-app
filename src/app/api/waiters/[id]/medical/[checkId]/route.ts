import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { FormazioneError, deleteMedicalCheck, updateMedicalCheck } from "@/server/staff-formazione";

type Params = { params: { id: string; checkId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    const updated = await updateMedicalCheck(ctx.venueId, params.id, params.checkId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof FormazioneError) return apiError(404, err.code, "Questa visita non esiste più.");
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteMedicalCheck(ctx.venueId, params.id, params.checkId, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof FormazioneError) return apiError(404, err.code, "Questa visita non esiste più.");
    return apiErrorResponse(err);
  }
}
