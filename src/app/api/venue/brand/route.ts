import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/server/audit";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { updateBrandSettings } from "@/server/venue-brand";

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const { action, ...fields } = body as { action?: "complete" | "skip"; [key: string]: unknown };
    const updated = await updateBrandSettings(ctx.venueId, fields, action);
    await recordAudit(auditActor(ctx, req), "venue.brand_update", "venue", ctx.venueId, {
      campi: Object.keys(fields),
      azione: action ?? null,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
