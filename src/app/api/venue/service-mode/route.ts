import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/server/audit";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { setServiceAssignmentMode } from "@/server/venue-settings";

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const updated = await setServiceAssignmentMode(ctx.venueId, body);
    await recordAudit(auditActor(ctx, req), "venue.service_mode_update", "venue", ctx.venueId, {
      modalita: (body as { mode?: unknown })?.mode ?? null,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
