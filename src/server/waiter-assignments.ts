import { z } from "zod";
import { db } from "@/lib/db";

export type TableConflict = { waiterName: string; tableLabels: string[] };

export class AssignmentConflictError extends Error {
  constructor(public conflicts: TableConflict[]) {
    super("table_conflict");
  }
}

export const AssignmentInput = z.object({
  waiterId: z.string().min(1, "required"),
  date: z.coerce.date(),
  service: z.string().trim().min(1, "required"),
  roomId: z.string().min(1).optional(),
  tableIds: z.array(z.string().min(1)).optional(),
});

function normalizeDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function listServiceOptions(venueId: string) {
  const shifts = await db.shift.findMany({
    where: { venueId, active: true },
    orderBy: { startMinute: "asc" },
    select: { name: true },
  });
  const options: string[] = [];
  for (const s of shifts) {
    if (!options.includes(s.name)) options.push(s.name);
  }
  return options.length > 0 ? options : ["Pranzo", "Cena"];
}

export async function listAssignmentsForDate(venueId: string, date: Date) {
  const day = normalizeDate(date);
  return db.waiterAssignment.findMany({
    where: { venueId, date: day },
    include: { room: true },
  });
}

export async function getWaiterAssignment(venueId: string, waiterId: string, date: Date, service: string) {
  const day = normalizeDate(date);
  return db.waiterAssignment.findFirst({
    where: { venueId, waiterId, date: day, service },
    include: { room: true },
  });
}

export async function listTableAssignmentsForService(venueId: string, date: Date, service: string) {
  const day = normalizeDate(date);
  return db.waiterAssignment.findMany({
    where: { venueId, date: day, service, assignmentMode: "TABLES" },
    include: { waiter: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function upsertWaiterAssignment(venueId: string, raw: unknown) {
  const data = AssignmentInput.parse(raw);
  const day = normalizeDate(data.date);

  const waiter = await db.waiter.findFirst({ where: { id: data.waiterId, venueId } });
  if (!waiter) throw new Error("waiter_not_found");
  if (waiter.status === "RESTING") throw new Error("waiter_resting");

  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });
  const mode = venue.serviceAssignmentMode;

  if (mode === "ROOMS") {
    if (!data.roomId) throw new Error("room_required");
    const room = await db.room.findFirst({ where: { id: data.roomId, venueId } });
    if (!room) throw new Error("room_not_found");

    return db.waiterAssignment.upsert({
      where: { waiterId_date_service: { waiterId: data.waiterId, date: day, service: data.service } },
      create: {
        venueId,
        waiterId: data.waiterId,
        date: day,
        service: data.service,
        assignmentMode: "ROOMS",
        roomId: room.id,
        tableIds: [],
      },
      update: { assignmentMode: "ROOMS", roomId: room.id, tableIds: [] },
      include: { room: true },
    });
  }

  if (!data.tableIds || data.tableIds.length === 0) throw new Error("tables_required");
  const tables = await db.table.findMany({ where: { id: { in: data.tableIds }, venueId, active: true } });
  if (tables.length !== data.tableIds.length) throw new Error("table_not_found");

  const others = await db.waiterAssignment.findMany({
    where: {
      venueId,
      date: day,
      service: data.service,
      assignmentMode: "TABLES",
      waiterId: { not: data.waiterId },
    },
    include: { waiter: true },
  });
  const conflicts: TableConflict[] = [];
  for (const other of others) {
    const overlapIds = other.tableIds.filter((id) => data.tableIds!.includes(id));
    if (overlapIds.length === 0) continue;
    const tableLabels = overlapIds.map((id) => tables.find((t) => t.id === id)?.label ?? id);
    conflicts.push({ waiterName: `${other.waiter.firstName} ${other.waiter.lastName}`, tableLabels });
  }
  if (conflicts.length > 0) throw new AssignmentConflictError(conflicts);

  return db.waiterAssignment.upsert({
    where: { waiterId_date_service: { waiterId: data.waiterId, date: day, service: data.service } },
    create: {
      venueId,
      waiterId: data.waiterId,
      date: day,
      service: data.service,
      assignmentMode: "TABLES",
      roomId: null,
      tableIds: data.tableIds,
    },
    update: { assignmentMode: "TABLES", roomId: null, tableIds: data.tableIds },
    include: { room: true },
  });
}

export async function assignTableToWaiter(
  venueId: string,
  params: { tableId: string; waiterId: string; date: Date; service: string },
) {
  const day = normalizeDate(params.date);

  const waiter = await db.waiter.findFirst({ where: { id: params.waiterId, venueId } });
  if (!waiter) throw new Error("waiter_not_found");
  if (waiter.status === "RESTING") throw new Error("waiter_resting");

  const table = await db.table.findFirst({ where: { id: params.tableId, venueId, active: true } });
  if (!table) throw new Error("table_not_found");

  const others = await db.waiterAssignment.findMany({
    where: {
      venueId,
      date: day,
      service: params.service,
      assignmentMode: "TABLES",
      waiterId: { not: params.waiterId },
      tableIds: { has: params.tableId },
    },
  });
  for (const other of others) {
    const nextIds = other.tableIds.filter((id) => id !== params.tableId);
    if (nextIds.length === 0) {
      await db.waiterAssignment.delete({ where: { id: other.id } });
    } else {
      await db.waiterAssignment.update({ where: { id: other.id }, data: { tableIds: nextIds } });
    }
  }

  const mine = await db.waiterAssignment.findUnique({
    where: { waiterId_date_service: { waiterId: params.waiterId, date: day, service: params.service } },
  });
  if (mine) {
    if (mine.assignmentMode !== "TABLES") throw new Error("assignment_mode_mismatch");
    const nextIds = mine.tableIds.includes(params.tableId) ? mine.tableIds : [...mine.tableIds, params.tableId];
    return db.waiterAssignment.update({
      where: { id: mine.id },
      data: { tableIds: nextIds },
      include: { waiter: true },
    });
  }

  return db.waiterAssignment.create({
    data: {
      venueId,
      waiterId: params.waiterId,
      date: day,
      service: params.service,
      assignmentMode: "TABLES",
      tableIds: [params.tableId],
    },
    include: { waiter: true },
  });
}

export async function removeTableAssignment(venueId: string, params: { tableId: string; date: Date; service: string }) {
  const day = normalizeDate(params.date);
  const assignment = await db.waiterAssignment.findFirst({
    where: { venueId, date: day, service: params.service, assignmentMode: "TABLES", tableIds: { has: params.tableId } },
  });
  if (!assignment) return null;
  const nextIds = assignment.tableIds.filter((id) => id !== params.tableId);
  if (nextIds.length === 0) {
    await db.waiterAssignment.delete({ where: { id: assignment.id } });
  } else {
    await db.waiterAssignment.update({ where: { id: assignment.id }, data: { tableIds: nextIds } });
  }
  return true;
}
