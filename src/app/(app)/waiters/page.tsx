import { db } from "@/lib/db";
import { can, getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { listRooms } from "@/server/rooms";
import { listAssignmentsForDate, listServiceOptions } from "@/server/waiter-assignments";
import { listAttentionNeededContracts } from "@/server/staff-contracts";
import { formatTableSelectionLabel } from "@/lib/table-range";
import { WaitersPageClient } from "@/components/waiters/waiters-page-client";

export const dynamic = "force-dynamic";

export default async function WaitersPage() {
  const ctx = await getActiveVenue();
  const mode = ctx.venue.serviceAssignmentMode;
  const canManageContracts = can(ctx.role, "manage_contracts");

  const [waiters, rooms, tables, serviceOptions, todayAssignments, contractAttention] = await Promise.all([
    listWaiters(ctx.venueId),
    listRooms(ctx.venueId),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, seats: true },
    }),
    listServiceOptions(ctx.venueId),
    listAssignmentsForDate(ctx.venueId, new Date()),
    canManageContracts ? listAttentionNeededContracts(ctx.venueId) : Promise.resolve(new Map()),
  ]);

  const tableLabelById = new Map(tables.map((t) => [t.id, t.label]));
  const summaryByWaiterId = new Map<string, string>();
  for (const a of todayAssignments) {
    const target =
      a.assignmentMode === "ROOMS"
        ? a.room?.name ?? "Sala"
        : formatTableSelectionLabel(a.tableIds.map((id) => tableLabelById.get(id) ?? id));
    const line = `${a.service} · ${target}`;
    const existing = summaryByWaiterId.get(a.waiterId);
    summaryByWaiterId.set(a.waiterId, existing ? `${existing} · ${line}` : line);
  }

  return (
    <WaitersPageClient
      waiters={waiters}
      mode={mode}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
      tables={tables}
      serviceOptions={serviceOptions}
      canManageContracts={canManageContracts}
      assignmentSummaryByWaiterId={Object.fromEntries(summaryByWaiterId)}
      contractAttentionByWaiterId={Object.fromEntries(contractAttention)}
    />
  );
}
