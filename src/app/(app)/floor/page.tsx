import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listRooms } from "@/server/rooms";
import { listServiceOptions } from "@/server/waiter-assignments";
import { listStaffAssignmentsForService } from "@/server/staff-assignments";
import { FloorRoomsView } from "@/components/floor/floor-rooms-view";
import type { TableStaffMap } from "@/components/floor/table-node";

export const dynamic = "force-dynamic";

export default async function FloorPage({
  searchParams,
}: {
  searchParams: { date?: string; service?: string; room?: string };
}) {
  const ctx = await getActiveVenue();

  const [rooms, tables, serviceOptions] = await Promise.all([
    listRooms(ctx.venueId),
    db.table.findMany({
      where: { venueId: ctx.venueId },
      orderBy: { label: "asc" },
    }),
    listServiceOptions(ctx.venueId),
  ]);

  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const service = searchParams.service ?? serviceOptions[0] ?? "";

  const staffByTableId: Record<string, TableStaffMap> = {};
  if (service) {
    const assignments = await listStaffAssignmentsForService(ctx.venueId, new Date(date), service);
    for (const a of assignments) {
      if (!a.tableId) continue;
      const map = (staffByTableId[a.tableId] ??= {});
      map[a.assignmentType as keyof TableStaffMap] = {
        id: a.waiterId,
        name: `${a.waiter.firstName} ${a.waiter.lastName}`,
        status: a.waiter.status,
      };
    }
  }

  const roomsWithTables = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    floorPlanUrl: r.floorPlanUrl,
    activeLayoutMode: r.activeLayoutMode,
    roomLayoutElements: r.roomLayout?.elements ?? [],
    tables: tables.filter((t) => t.roomId === r.id),
  }));

  return (
    <FloorRoomsView
      rooms={roomsWithTables}
      date={date}
      service={service}
      serviceOptions={serviceOptions}
      staffByTableId={staffByTableId}
    />
  );
}
