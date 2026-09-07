import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { notifyWaitlistEntry } from "@/server/waitlist";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json().catch(() => ({}));
    const updated = await notifyWaitlistEntry(
      ctx.venueId,
      params.id,
      { via: typeof body?.via === "string" ? body.via : undefined },
      auditActor(ctx, req),
    );
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
