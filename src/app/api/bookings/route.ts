import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { createBooking, listBookingsForDay } from "@/server/bookings";

export async function GET(req: Request) {
  const ctx = await getActiveVenue();
  const url = new URL(req.url);
  const day = url.searchParams.get("day");
  const target = day ? new Date(day) : new Date();
  const data = await listBookingsForDay(ctx.venueId, target);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const created = await createBooking(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
