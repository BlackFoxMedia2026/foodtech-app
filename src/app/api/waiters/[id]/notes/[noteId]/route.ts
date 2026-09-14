import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { cancellaNota } from "@/server/staff-note";

export async function DELETE(req: Request, { params }: { params: { id: string; noteId: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    await cancellaNota(ctx.venueId, params.id, params.noteId, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
