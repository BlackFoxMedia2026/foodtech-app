import { NextResponse } from "next/server";
import { createBooking } from "@/server/bookings";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
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

    /**
     * La campagna arriva dal link cliccato, quindi dal mondo esterno: si
     * accetta solo se esiste e appartiene a **questo** locale. Se non torna,
     * la prenotazione si fa comunque senza attribuzione: un link storto non
     * deve impedire a un cliente di prenotare.
     */
    const campagnaRichiesta = typeof body?.campaignId === "string" ? body.campaignId : null;
    const campaignId = campagnaRichiesta
      ? (
          await db.campaign.findFirst({
            where: { id: campagnaRichiesta, venueId },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    const payload = {
      guest: body?.guest,
      partySize: body?.partySize,
      startsAt: body?.startsAt,
      durationMin: body?.durationMin,
      occasion: body?.occasion,
      notes: body?.notes,
      source: "WIDGET" as const,
    };

    const booking = await createBooking(venueId, payload, { campaignId, canale: "pubblico" });
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}
