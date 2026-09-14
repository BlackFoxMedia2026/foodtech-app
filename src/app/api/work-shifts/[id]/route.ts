import { NextResponse } from "next/server";
import { auditActor } from "@/server/audit";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { deleteWorkShift, updateWorkShift, WorkShiftError } from "@/server/work-shifts";
import { rispostaErroreTurno } from "@/lib/work-shift-errors";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_shifts");
  if (!ctx.ok) return ctx.response;
  try {
    const aggiornato = await updateWorkShift(ctx.venueId, params.id, await req.json(), auditActor(ctx, req));
    return NextResponse.json(aggiornato);
  } catch (err) {
    if (err instanceof WorkShiftError) return rispostaErroreTurno(err);
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_shifts");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteWorkShift(ctx.venueId, params.id, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkShiftError) return rispostaErroreTurno(err);
    return apiErrorResponse(err);
  }
}
