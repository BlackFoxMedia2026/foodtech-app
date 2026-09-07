import { NextResponse } from "next/server";
import { apiErrorResponse, apiError, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { seatWaitlistEntry } from "@/server/waitlist";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
import { AvailabilityError } from "@/server/availability";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  const body = await req.json().catch(() => null);
  const tableId = body?.tableId;
  if (!tableId || typeof tableId !== "string") {
    return apiError(422, "missing_table", "Scegli il tavolo su cui accomodare l'ospite.");
  }
  try {
    const result = await seatWaitlistEntry(
      ctx.venueId,
      params.id,
      { tableId, startsAt: body?.startsAt ? new Date(body.startsAt) : undefined },
      auditActor(ctx, req),
    );
    return NextResponse.json(result);
  } catch (err) {
    // Se è il motore di disponibilità a rifiutare, il cliente merita i motivi
    // in chiaro e non un errore generico.
    if (err instanceof AvailabilityError) return bookingWriteErrorResponse(err);
    return apiErrorResponse(err);
  }
}
