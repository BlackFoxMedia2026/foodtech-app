import { db } from "@/lib/db";
import { mezzanotteInVenue, todayInVenue } from "@/lib/venue-time";
import { can, getActiveVenue } from "@/lib/tenant";
import { listRooms } from "@/server/rooms";
import { readRoomLayout } from "@/server/room-layout";
import { summarizeAnalysis } from "@/lib/floorplan-analysis";
import { listServiceOptions } from "@/server/waiter-assignments";
import { listStaffAssignmentsForService } from "@/server/staff-assignments";
import { getTableStatusesForDay } from "@/server/bookings";
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

  const date = searchParams.date ?? todayInVenue(ctx.venue.timezone);
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

  const roomsWithTables = rooms.map((r) => {
    const layout = readRoomLayout(r.roomLayout);
    return {
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      floorPlanUrl: r.floorPlanUrl,
      elements: layout.elements,
      layers: layout.layers,
      inventory: layout.inventory,
      meta: layout.meta,
      // Il riassunto e non l'analisi intera: al client serve una riga da
      // mostrare sotto la miniatura, non trecento coordinate normalizzate che
      // ha già usato il giorno in cui la piantina è stata generata.
      riassuntoAnalisi: layout.analysis ? summarizeAnalysis(layout.analysis) : null,
      tables: tables.filter((t) => t.roomId === r.id),
    };
  });

  /* «Oggi» è il giorno del locale, come `date` qui sopra: confrontarlo col
     giorno UTC faceva sembrare «un altro giorno» la serata in corso fra
     mezzanotte e le due, e ogni tavolo si leggeva dalla mezzanotte invece
     che dall'orologio. */
  const isToday = date === todayInVenue(ctx.venue.timezone);
  // Viewing a day other than today shouldn't compare bookings against the
  // real clock — every active booking that day should still read as
  // PRENOTATO/OCCUPATO instead of collapsing to LIBERO (see table-status.ts).
  const statusByTableId = await getTableStatusesForDay(
    ctx.venueId,
    date,
    tables,
    isToday ? new Date() : mezzanotteInVenue(date, ctx.venue.timezone),
    ctx.venue.timezone,
  );

  return (
    <FloorRoomsView
      rooms={roomsWithTables}
      date={date}
      service={service}
      serviceOptions={serviceOptions}
      staffByTableId={staffByTableId}
      statusByTableId={statusByTableId}
      // Chi guarda decide cosa si può toccare dal profilo del tavolo: la
      // matrice sta in `lib/abilities.ts`, e leggerla qui è il motivo per cui
      // il pannello non mostra a un cameriere un interruttore che spegne gli
      // incassi.
      permessi={{
        prenotazioni: can(ctx.role, "manage_bookings"),
        personale: can(ctx.role, "manage_staff"),
        locale: can(ctx.role, "manage_venue"),
      }}
    />
  );
}
