import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { TeamError, revocaInvito } from "@/server/team";

/** Ritirare un invito prima che venga usato. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    await revocaInvito(ctx.venueId, params.id, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamError) return apiError(404, err.code, "Questo invito non esiste più.");
    return apiErrorResponse(err);
  }
}
