import { db } from "@/lib/db";
import { boundingBox, SaveRoomLayoutSchema, type RoomElement } from "@/lib/room-layout";

export async function getRoomLayout(venueId: string, roomId: string) {
  const room = await db.room.findFirst({ where: { id: roomId, venueId }, include: { roomLayout: true } });
  if (!room) throw new Error("not_found");
  return room.roomLayout;
}

export async function saveRoomLayout(venueId: string, roomId: string, raw: unknown) {
  const room = await db.room.findFirst({ where: { id: roomId, venueId } });
  if (!room) throw new Error("not_found");

  const input = SaveRoomLayoutSchema.parse(raw);
  const box = boundingBox(input.elements as RoomElement[]);
  const margin = 40;
  const width = Math.max(input.width, Math.round(box.maxX + margin));
  const height = Math.max(input.height, Math.round(box.maxY + margin));

  const [layout] = await db.$transaction([
    db.roomLayout.upsert({
      where: { roomId },
      create: { roomId, elements: input.elements },
      update: { elements: input.elements },
    }),
    db.room.update({ where: { id: roomId }, data: { width, height, activeLayoutMode: "BUILDER" } }),
  ]);

  return layout;
}

export async function setActiveLayoutMode(venueId: string, roomId: string, mode: "IMAGE" | "BUILDER") {
  const room = await db.room.findFirst({ where: { id: roomId, venueId } });
  if (!room) throw new Error("not_found");
  return db.room.update({ where: { id: roomId }, data: { activeLayoutMode: mode } });
}
