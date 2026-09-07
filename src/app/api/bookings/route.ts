import { NextResponse } from "next/server";
import { apiError, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
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

    /**
     * La forzatura: accettare una prenotazione oltre orari, capienza o posti
     * del tavolo. Serve davvero — un tavolo condiviso, un gruppo sistemato a
     * mano, un cliente a cui non si dice no — ma **non** è raggiungibile dai
     * canali pubblici (che hanno la loro route) e pretende un motivo scritto,
     * che finisce nel registro con il nome di chi l'ha usata.
     */
    const force = body?.force;
    const forceReason = typeof force?.reason === "string" ? force.reason.trim() : "";
    if (force && forceReason.length < 3) {
      return apiError(422, "force_reason_required", "Per forzare serve un motivo, anche breve.");
    }

    const created = await createBooking(ctx.venueId, body, {
      actor: auditActor(ctx, req),
      ...(force ? { skipAvailabilityCheck: true, forceReason } : {}),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}
