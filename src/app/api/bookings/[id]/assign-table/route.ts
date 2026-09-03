import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { BookingAssignError, assignBookingToTable } from "@/server/booking-floor";

const ERROR_STATUS: Record<BookingAssignError["code"], number> = {
  booking_not_found: 404,
  table_not_found: 404,
  table_conflict: 409,
  capacity_mismatch: 409,
  retry: 409,
};

const ERROR_MESSAGE: Record<BookingAssignError["code"], string> = {
  booking_not_found: "Prenotazione non trovata.",
  table_not_found: "Tavolo non trovato.",
  table_conflict: "Questo tavolo è stato appena assegnato a un'altra prenotazione.",
  capacity_mismatch: "Il tavolo ha meno posti dei previsti per questa prenotazione.",
  retry: "Il tavolo è stato modificato nel frattempo. Riprova.",
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_bookings")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const tableId = body?.tableId;
  if (!tableId || typeof tableId !== "string") {
    return NextResponse.json({ error: "missing_tableId" }, { status: 400 });
  }

  try {
    const updated = await assignBookingToTable(ctx.venueId, params.id, tableId, { force: !!body?.force });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof BookingAssignError) {
      return NextResponse.json({ error: err.code, message: ERROR_MESSAGE[err.code], detail: err.detail }, { status: ERROR_STATUS[err.code] });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
