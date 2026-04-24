import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { db } from "@/lib/db";
import { deleteBooking, updateBooking } from "@/server/bookings";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const item = await db.booking.findFirst({
    where: { id: params.id, venueId: ctx.venueId },
    include: { guest: true, table: true, payments: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const updated = await updateBooking(ctx.venueId, params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  try {
    await deleteBooking(ctx.venueId, params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
