import { db } from "@/lib/db";
import { can, getActiveVenue } from "@/lib/tenant";
import { listBookingsForDay } from "@/server/bookings";
import { getShiftWindowForDate, getCurrentServiceName } from "@/server/booking-floor";
import { listRooms } from "@/server/rooms";
import { listServiceOptions } from "@/server/waiter-assignments";
import { BookingsPageClient } from "@/components/bookings/bookings-page-client";

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "pending" | "confirmed";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { day?: string; status?: string; service?: string };
}) {
  const ctx = await getActiveVenue();
  const day = searchParams.day ? new Date(searchParams.day) : new Date();
  const dayString = day.toISOString().slice(0, 10);
  const statusFilter = (searchParams.status as StatusFilter) ?? "all";
  const canManageBookings = can(ctx.role, "manage_bookings");

  const [rows, tables, allTables, rooms, serviceOptions] = await Promise.all([
    listBookingsForDay(ctx.venueId, day),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      select: { id: true, label: true, seats: true },
      orderBy: { label: "asc" },
    }),
    db.table.findMany({ where: { venueId: ctx.venueId }, orderBy: { label: "asc" } }),
    listRooms(ctx.venueId),
    listServiceOptions(ctx.venueId),
  ]);

  // Default to whichever service is happening right now (by wall-clock
  // time), not just the first one alphabetically/by start time — otherwise
  // opening the page outside lunch hours defaulted to "Pranzo" and silently
  // hid real dinner bookings behind a misleading "tutte assegnate" empty
  // state. An explicit ?service= from the user always wins.
  const service = searchParams.service ?? (await getCurrentServiceName(ctx.venueId, day)) ?? serviceOptions[0] ?? "";
  // Single lightweight lookup, not a second bookings query — the Mappa view
  // derives its unassigned/assigned split from the SAME `rows` fetched
  // above, just further narrowed to this window client-side (brief section
  // 24: one source of truth, no parallel dataset).
  const shiftWindow = service ? await getShiftWindowForDate(ctx.venueId, day, service) : null;

  let filteredRows = rows;
  if (statusFilter === "pending") {
    filteredRows = rows.filter((r) => r.status === "PENDING");
  } else if (statusFilter === "confirmed") {
    filteredRows = rows.filter((r) => r.status === "CONFIRMED");
  }

  const totalCovers = filteredRows.filter((r) => r.status !== "CANCELLED").reduce((s, b) => s + b.partySize, 0);
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  const roomsWithTables = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    floorPlanUrl: r.floorPlanUrl,
    activeLayoutMode: r.activeLayoutMode,
    roomLayoutElements: r.roomLayout?.elements ?? [],
    tables: allTables.filter((t) => t.roomId === r.id),
  }));

  return (
    <BookingsPageClient
      dayString={dayString}
      statusFilter={statusFilter}
      filteredRows={filteredRows}
      totalCovers={totalCovers}
      pendingCount={pendingCount}
      tables={tables}
      service={service}
      serviceOptions={serviceOptions}
      rooms={roomsWithTables}
      shiftWindow={shiftWindow}
      canManageBookings={canManageBookings}
    />
  );
}
