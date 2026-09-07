import { NextResponse } from "next/server";
import { z } from "zod";
import { auditActor } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import {
  ASSIGN_ERROR_MESSAGE,
  ASSIGN_ERROR_STATUS,
  BookingAssignError,
  combineTablesForBooking,
} from "@/server/booking-floor";

const Body = z.object({
  /** Il primo è il tavolo principale, gli altri gli accostati. */
  tableIds: z.array(z.string().min(1)).min(2).max(8),
  force: z.boolean().optional(),
  forceReason: z.string().max(300).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    const body = Body.parse(await req.json());
    const updated = await combineTablesForBooking(ctx.venueId, params.id, body.tableIds, {
      force: body.force,
      forceReason: body.forceReason,
      actor: auditActor(ctx, req),
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof BookingAssignError) {
      return NextResponse.json(
        { error: err.code, message: ASSIGN_ERROR_MESSAGE[err.code], detail: err.detail },
        { status: ASSIGN_ERROR_STATUS[err.code] },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", message: "Per unire servono almeno due tavoli." },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
