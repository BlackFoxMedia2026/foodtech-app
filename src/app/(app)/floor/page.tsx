import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listRooms } from "@/server/rooms";
import { listWaiters } from "@/server/waiters";
import { listServiceOptions, listTableAssignmentsForService } from "@/server/waiter-assignments";
import { FloorRoomsView } from "@/components/floor/floor-rooms-view";

export const dynamic = "force-dynamic";

export default async function FloorPage({
  searchParams,
}: {
  searchParams: { date?: string; service?: string; room?: string };
}) {
  const ctx = await getActiveVenue();
  const isTablesMode = ctx.venue.serviceAssignmentMode === "TABLES";

  const [rooms, tables, serviceOptions, allWaiters] = await Promise.all([
    listRooms(ctx.venueId),
    db.table.findMany({
      where: { venueId: ctx.venueId },
      orderBy: { label: "asc" },
    }),
    listServiceOptions(ctx.venueId),
    listWaiters(ctx.venueId),
  ]);

  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const service = searchParams.service ?? serviceOptions[0] ?? "";

  const waiterByTableId: Record<string, { id: string; name: string }> = {};
  if (isTablesMode && service) {
    const assignments = await listTableAssignmentsForService(ctx.venueId, new Date(date), service);
    for (const a of assignments) {
      const name = `${a.waiter.firstName} ${a.waiter.lastName}`;
      for (const tableId of a.tableIds) waiterByTableId[tableId] = { id: a.waiterId, name };
    }
  }

  const roomsWithTables = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    floorPlanUrl: r.floorPlanUrl,
    tables: tables.filter((t) => t.roomId === r.id),
  }));

  const waiters = allWaiters
    .filter((w) => w.status === "ACTIVE")
    .map((w) => ({ id: w.id, name: `${w.firstName} ${w.lastName}` }));

  return (
    <FloorRoomsView
      rooms={roomsWithTables}
      isTablesMode={isTablesMode}
      date={date}
      service={service}
      serviceOptions={serviceOptions}
      waiterByTableId={waiterByTableId}
      waiters={waiters}
    />
  );
}
