import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { confirmWaitlistEntry } from "@/server/waitlist";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await confirmWaitlistEntry(ctx.venueId, params.id, auditActor(ctx, req)));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
