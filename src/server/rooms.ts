import { z } from "zod";
import { db } from "@/lib/db";

export const RoomInput = z.object({
  name: z.string().trim().min(1, "required"),
});

export async function listRooms(venueId: string) {
  return db.room.findMany({ where: { venueId }, orderBy: { ordering: "asc" } });
}

export async function createRoom(venueId: string, raw: unknown) {
  const { name } = RoomInput.parse(raw);
  const count = await db.room.count({ where: { venueId } });
  return db.room.create({ data: { venueId, name, ordering: count } });
}

export async function renameRoom(venueId: string, id: string, raw: unknown) {
  const { name } = RoomInput.parse(raw);
  const existing = await db.room.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.room.update({ where: { id }, data: { name } });
}

export async function deleteRoom(venueId: string, id: string) {
  const existing = await db.room.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  const totalRooms = await db.room.count({ where: { venueId } });
  if (totalRooms <= 1) throw new Error("last_room");
  try {
    return await db.room.delete({ where: { id } });
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "P2003") throw new Error("room_in_use");
    throw err;
  }
}

export async function setRoomFloorPlan(venueId: string, id: string, floorPlanUrl: string | null) {
  const existing = await db.room.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.room.update({ where: { id }, data: { floorPlanUrl } });
}
