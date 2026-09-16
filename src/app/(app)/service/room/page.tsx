import { db } from "@/lib/db";
import { can, getActiveVenue } from "@/lib/tenant";
import { getFloorLive } from "@/server/floor-live";
import { RoomLiveView } from "@/components/service/room-live-view";
import { parseRoomLayoutElements } from "@/lib/room-layout";

export const dynamic = "force-dynamic";

export default async function ServiceRoomPage() {
  const ctx = await getActiveVenue();

  const [live, tables, rooms] = await Promise.all([
    getFloorLive(ctx.venueId),
    db.table.findMany({
      where: { venueId: ctx.venueId },
      select: { id: true, label: true, seats: true, posX: true, posY: true, shape: true, roomId: true },
      orderBy: { label: "asc" },
    }),
    db.room.findMany({
      where: { venueId: ctx.venueId },
      select: { id: true, name: true, roomLayout: { select: { elements: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <RoomLiveView
      initial={live}
      tables={tables.map((t) => ({ ...t, shape: String(t.shape) }))}
      rooms={rooms.map((r) => ({
        id: r.id,
        name: r.name,
        elementi: parseRoomLayoutElements(r.roomLayout?.elements ?? []),
      }))}
      canManage={can(ctx.role, "manage_bookings")}
      permessi={{
        prenotazioni: can(ctx.role, "manage_bookings"),
        personale: can(ctx.role, "manage_staff"),
        locale: can(ctx.role, "manage_venue"),
      }}
    />
  );
}
