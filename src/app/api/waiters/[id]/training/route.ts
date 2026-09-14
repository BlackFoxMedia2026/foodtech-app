import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { FormazioneError, createTraining } from "@/server/staff-formazione";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    const created = await createTraining(ctx.venueId, params.id, await req.json(), auditActor(ctx, req));
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof FormazioneError) return apiError(404, err.code, "Questa persona non fa parte di questo locale.");
    return apiErrorResponse(err);
  }
}
