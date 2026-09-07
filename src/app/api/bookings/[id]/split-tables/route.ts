import { NextResponse } from "next/server";
import { auditActor } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import {
  ASSIGN_ERROR_MESSAGE,
  ASSIGN_ERROR_STATUS,
  BookingAssignError,
  splitTablesForBooking,
} from "@/server/booking-floor";

/** Scioglie la tavolata: resta il tavolo principale, gli altri tornano liberi. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    const updated = await splitTablesForBooking(ctx.venueId, params.id, { actor: auditActor(ctx, req) });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof BookingAssignError) {
      return NextResponse.json(
        { error: err.code, message: ASSIGN_ERROR_MESSAGE[err.code], detail: err.detail },
        { status: ASSIGN_ERROR_STATUS[err.code] },
      );
    }
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
