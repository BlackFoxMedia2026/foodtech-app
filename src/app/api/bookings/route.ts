import { NextResponse } from "next/server";
import { auditActor } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";

import { createBooking, listBookingsForDay } from "@/server/bookings";
import { bookingWriteErrorResponse } from "@/server/booking-errors";

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const day = url.searchParams.get("day");
  const target = day ? new Date(day) : new Date();
  const data = await listBookingsForDay(ctx.venueId, target);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const created = await createBooking(ctx.venueId, body, { actor: auditActor(ctx, req) });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}
