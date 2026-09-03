import { Prisma, type Booking, type BookingStatus, type Guest, type Table } from "@prisma/client";
import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "@/lib/utils";

export type FloorBooking = Booking & { guest: Guest | null; table: Table | null };

/**
 * Maps a named service (e.g. "Cena") to its configured time-of-day window
 * for the given date's weekday, using the same Shift model that already
 * backs `listServiceOptions()` elsewhere (Sala/Camerieri) — no new "service"
 * concept introduced. Returns null when no Shift row is configured for that
 * exact weekday+name combination; callers should fall back to the whole day
 * rather than guessing an arbitrary lunch/dinner split.
 */
export async function getShiftWindowForDate(
  venueId: string,
  date: Date,
  serviceName: string,
): Promise<{ start: Date; end: Date } | null> {
  const weekday = date.getDay();
  const shift = await db.shift.findFirst({ where: { venueId, name: serviceName, weekday, active: true } });
  if (!shift) return null;

  const dayStart = startOfDay(date);
  const start = new Date(dayStart.getTime() + shift.startMinute * 60_000);
  const end = new Date(dayStart.getTime() + shift.endMinute * 60_000);
  return { start, end };
}

/**
 * Which configured service is happening right now, by wall-clock time —
 * used only to pick a sane DEFAULT service for the Mappa view on first
 * load. Without this, the default fell back to the first service ordered
 * by start time (usually "Pranzo"), which silently hid real dinner
 * bookings from "Da assegnare" behind a misleading "tutte assegnate"
 * empty state whenever someone opened the page outside lunch hours.
 * Returns null if no shift covers the current moment (e.g. venue closed).
 */
export async function getCurrentServiceName(venueId: string, date: Date): Promise<string | null> {
  const weekday = date.getDay();
  const shifts = await db.shift.findMany({ where: { venueId, weekday, active: true } });
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return shifts.find((s) => nowMinutes >= s.startMinute && nowMinutes < s.endMinute)?.name ?? null;
}

const ACTIVE_STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING", "ARRIVED", "SEATED", "COMPLETED"];

export class BookingAssignError extends Error {
  constructor(
    public code: "booking_not_found" | "table_not_found" | "table_conflict" | "capacity_mismatch" | "retry",
    public detail?: unknown,
  ) {
    super(code);
  }
}

function overlaps(aStart: Date, aDurationMin: number, bStart: Date, bDurationMin: number) {
  const aEnd = new Date(aStart.getTime() + aDurationMin * 60_000);
  const bEnd = new Date(bStart.getTime() + bDurationMin * 60_000);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Assigns (or reassigns) a booking to a table, atomically re-checking
 * availability server-side (brief sections 23/29/47) — the frontend's view
 * of "this table is free" can be stale the moment two users act at once.
 * Runs at Serializable isolation so a genuine race between two concurrent
 * assignments to the same table is caught by Postgres itself (one call
 * throws a serialization failure, mapped below to a retriable "retry" —
 * see the API route) rather than silently overwriting.
 */
export async function assignBookingToTable(
  venueId: string,
  bookingId: string,
  tableId: string,
  opts: { force?: boolean } = {},
): Promise<FloorBooking> {
  try {
    return await db.$transaction(
      async (tx) => {
        const booking = await tx.booking.findFirst({ where: { id: bookingId, venueId, deletedAt: null } });
        if (!booking) throw new BookingAssignError("booking_not_found");

        const table = await tx.table.findFirst({ where: { id: tableId, venueId, active: true } });
        if (!table) throw new BookingAssignError("table_not_found");

        if (table.seats < booking.partySize && !opts.force) {
          throw new BookingAssignError("capacity_mismatch", { tableSeats: table.seats, partySize: booking.partySize });
        }

        const dayStart = startOfDay(booking.startsAt);
        const dayEnd = endOfDay(booking.startsAt);
        const candidates = await tx.booking.findMany({
          where: {
            venueId,
            tableId,
            deletedAt: null,
            id: { not: bookingId },
            status: { in: ACTIVE_STATUSES },
            startsAt: { gte: dayStart, lte: dayEnd },
          },
        });
        const conflict = candidates.find((c) => overlaps(booking.startsAt, booking.durationMin, c.startsAt, c.durationMin));
        if (conflict) throw new BookingAssignError("table_conflict");

        return tx.booking.update({ where: { id: bookingId }, data: { tableId }, include: { guest: true, table: true } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof BookingAssignError) throw err;
    // Postgres serialization failure (40001) from a genuinely concurrent
    // conflicting transaction — the caller should refetch and let the user
    // retry, not treat it as the same "already taken" case (that one is
    // caught explicitly above with a clearer, non-retriable message).
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "40001") throw new BookingAssignError("retry");
    throw err;
  }
}
