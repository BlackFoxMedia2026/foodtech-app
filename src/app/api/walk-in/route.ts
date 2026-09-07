import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { seatWalkIn } from "@/server/walk-in";
import { AvailabilityError } from "@/server/availability";
import { bookingWriteErrorResponse } from "@/server/booking-errors";

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const booking = await seatWalkIn(ctx.venueId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    // I motivi del motore di disponibilità sono già scritti per una persona.
    if (err instanceof AvailabilityError) return bookingWriteErrorResponse(err);
    return apiErrorResponse(err);
  }
}
