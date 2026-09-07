import { NextResponse } from "next/server";
import { auditActor } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import {
  ASSIGN_ERROR_MESSAGE,
  ASSIGN_ERROR_STATUS,
  BookingAssignError,
  assignBookingToTable,
} from "@/server/booking-floor";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  const body = await req.json().catch(() => null);
  const tableId = body?.tableId;
  if (!tableId || typeof tableId !== "string") {
    return NextResponse.json({ error: "missing_tableId" }, { status: 400 });
  }

  try {
    const updated = await assignBookingToTable(ctx.venueId, params.id, tableId, {
      force: !!body?.force,
      forceReason: typeof body?.forceReason === "string" ? body.forceReason : undefined,
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
