/** Whether two [start, start+duration) windows overlap — shared by the
 * client-side "which tables are already taken for this booking" checks
 * (assign-table-dialog, bookings-floor-view) so there's one definition of
 * "overlap" instead of copies drifting apart. The server has its own copy
 * in booking-floor.ts (kept independent on purpose — no client/server
 * coupling for four lines of arithmetic). */
export function bookingsOverlap(aStart: Date, aDurationMin: number, bStart: Date, bDurationMin: number): boolean {
  const aEnd = new Date(aStart.getTime() + aDurationMin * 60_000);
  const bEnd = new Date(bStart.getTime() + bDurationMin * 60_000);
  return aStart < bEnd && bStart < aEnd;
}
