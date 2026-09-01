import { UserCog } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listWaiters } from "@/server/waiters";
import { listRooms } from "@/server/rooms";
import { listAssignmentsForDate, listServiceOptions } from "@/server/waiter-assignments";
import { formatTableSelectionLabel } from "@/lib/table-range";
import { NewWaiterDialog } from "@/components/waiters/new-waiter-dialog";
import { WaiterRow } from "@/components/waiters/waiter-row";

export const dynamic = "force-dynamic";

export default async function WaitersPage() {
  const ctx = await getActiveVenue();
  const mode = ctx.venue.serviceAssignmentMode;

  const [waiters, rooms, tables, serviceOptions, todayAssignments] = await Promise.all([
    listWaiters(ctx.venueId),
    listRooms(ctx.venueId),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, seats: true },
    }),
    listServiceOptions(ctx.venueId),
    listAssignmentsForDate(ctx.venueId, new Date()),
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
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Camerieri</h1>
        </div>
        <NewWaiterDialog />
      </header>

      {waiters.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <UserCog className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          Nessun cameriere registrato ancora.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border bg-card">
          {waiters.map((w) => (
            <WaiterRow
              key={w.id}
              waiter={w}
              assignmentSummary={summaryByWaiterId.get(w.id) ?? null}
              mode={mode}
              rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
              tables={tables}
              serviceOptions={serviceOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
