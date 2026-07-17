import { NextResponse } from "next/server";
import { createBooking } from "@/server/bookings";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const venueId = typeof body?.venueId === "string" ? body.venueId : undefined;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const venue = await db.venue.findFirst({ where: { id: venueId, active: true } });
    if (!venue) {
      return NextResponse.json({ error: "venue not found" }, { status: 404 });
    }

    const payload = {
      guest: body?.guest,
      partySize: body?.partySize,
      startsAt: body?.startsAt,
      durationMin: body?.durationMin,
      occasion: body?.occasion,
      notes: body?.notes,
      source: "WIDGET" as const,
    };

    const booking = await createBooking(venueId, payload);
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
