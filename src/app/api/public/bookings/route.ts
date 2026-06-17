import { NextResponse } from "next/server";
import { createBooking } from "@/server/bookings";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { venueId } = body;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const venue = await db.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      return NextResponse.json({ error: "venue not found" }, { status: 404 });
    }

    const booking = await createBooking(venueId, body);
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
