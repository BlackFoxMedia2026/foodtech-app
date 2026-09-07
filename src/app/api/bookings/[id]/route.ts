import { NextResponse } from "next/server";
import { auditActor } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { deleteBooking, updateBooking } from "@/server/bookings";
import { bookingWriteErrorResponse } from "@/server/booking-errors";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const item = await db.booking.findFirst({
    where: { id: params.id, venueId: ctx.venueId },
    include: { guest: true, table: true, payments: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const updated = await updateBooking(ctx.venueId, params.id, body, { actor: auditActor(ctx, req) });
    return NextResponse.json(updated);
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteBooking(ctx.venueId, params.id, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
