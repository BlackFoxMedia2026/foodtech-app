import { db } from "@/lib/db";
import { can, getActiveVenue } from "@/lib/tenant";
import { getFloorLive } from "@/server/floor-live";
import { RoomLiveView } from "@/components/service/room-live-view";

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
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <RoomLiveView
      initial={live}
      tables={tables.map((t) => ({ ...t, shape: String(t.shape) }))}
      rooms={rooms}
      canManage={can(ctx.role, "manage_bookings")}
    />
  );
}
