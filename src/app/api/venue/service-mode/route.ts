import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { setServiceAssignmentMode } from "@/server/venue-settings";

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const updated = await setServiceAssignmentMode(ctx.venueId, body);
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
