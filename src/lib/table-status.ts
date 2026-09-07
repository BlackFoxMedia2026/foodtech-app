import type { BookingStatus } from "@prisma/client";

export type TableOperationalStatus = "LIBERO" | "PRENOTATO" | "OCCUPATO" | "NON_DISPONIBILE";

export const TABLE_STATUS_LABELS: Record<TableOperationalStatus, string> = {
  LIBERO: "Libero",
  PRENOTATO: "Prenotato",
  OCCUPATO: "Occupato",
  NON_DISPONIBILE: "Non disponibile",
};

const ACTIVE_UPCOMING_STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING", "ARRIVED"];

/**
 * Derived, never persisted: a Table has no status column of its own, so the
 * operational room view infers one from its `active` flag plus whatever
 * Booking rows land on it for the day being viewed.
 */
export function deriveTableStatus(
  table: { active: boolean },
  bookingsForTable: Array<{ status: BookingStatus; startsAt: Date; durationMin: number; closedAt: Date | null }>,
  now: Date,
): TableOperationalStatus {
  if (!table.active) return "NON_DISPONIBILE";
  if (bookingsForTable.some((b) => b.status === "SEATED" && !b.closedAt)) return "OCCUPATO";
  const upcoming = bookingsForTable.some((b) => {
    if (!ACTIVE_UPCOMING_STATUSES.includes(b.status)) return false;
    return new Date(b.startsAt.getTime() + b.durationMin * 60_000) > now;
  });
  return upcoming ? "PRENOTATO" : "LIBERO";
}
