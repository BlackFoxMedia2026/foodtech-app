import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { updateWaitlistEntry } from "@/server/waitlist";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const updated = await updateWaitlistEntry(ctx.venueId, params.id, await req.json(), auditActor(ctx, req));
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
