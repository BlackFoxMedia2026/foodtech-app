import { z } from "zod";
import type { StaffCapability } from "@prisma/client";
import { db } from "@/lib/db";
import { TABLE_ASSIGNABLE_CAPABILITIES } from "@/lib/staff-roles";

export class StaffAssignmentError extends Error {
  constructor(
    public code: "waiter_not_found" | "waiter_resting" | "table_not_found" | "capability_missing",
  ) {
    super(code);
  }
}

const TableAssignmentType = z.enum(TABLE_ASSIGNABLE_CAPABILITIES);

export const TableStaffAssignmentInput = z.object({
  waiterId: z.string().min(1, "required"),
  tableId: z.string().min(1, "required"),
  assignmentType: TableAssignmentType,
  date: z.coerce.date(),
  service: z.string().trim().min(1, "required"),
});

function normalizeDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** All staff assignments for one table/date/service — used by the "Assegna
 * personale" dialog. */
export async function listStaffAssignmentsForTable(venueId: string, tableId: string, date: Date, service: string) {
  const day = normalizeDate(date);
  return db.staffAssignment.findMany({
    where: { venueId, tableId, date: day, service, scope: "TABLE" },
    include: { waiter: { select: { id: true, firstName: true, lastName: true, status: true } } },
  });
}

/** All table-scoped assignments for an entire service in one query — used by
 * floor/page.tsx to build the per-table map without N+1 queries. */
export async function listStaffAssignmentsForService(venueId: string, date: Date, service: string) {
  const day = normalizeDate(date);
  return db.staffAssignment.findMany({
    where: { venueId, date: day, service, scope: "TABLE" },
    include: { waiter: { select: { id: true, firstName: true, lastName: true, status: true } } },
  });
}

/** Active waiters holding a given capability — powers the filtered picker in
 * the assign-staff dialog ("Assegna Sommelier" only shows sommeliers). */
export async function listEligibleStaff(venueId: string, capability: StaffCapability) {
  return db.waiter.findMany({
    where: { venueId, status: "ACTIVE", capabilities: { has: capability } },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
}

/** Creates or replaces the person filling a role on a table for a given
 * date+service. Atomic upsert on the table-slot unique key — no multi-step
 * "steal from elsewhere" logic needed (unlike the old per-waiter model),
 * since every row here is scoped to a single table+role already. */
export async function upsertTableStaffAssignment(venueId: string, raw: unknown) {
  const data = TableStaffAssignmentInput.parse(raw);
  const day = normalizeDate(data.date);

  const waiter = await db.waiter.findFirst({ where: { id: data.waiterId, venueId } });
  if (!waiter) throw new StaffAssignmentError("waiter_not_found");
  if (waiter.status === "RESTING") throw new StaffAssignmentError("waiter_resting");
  if (!waiter.capabilities.includes(data.assignmentType)) {
    throw new StaffAssignmentError("capability_missing");
  }

  const table = await db.table.findFirst({ where: { id: data.tableId, venueId, active: true } });
  if (!table) throw new StaffAssignmentError("table_not_found");

  return db.staffAssignment.upsert({
    where: {
      StaffAssignment_table_slot: {
        tableId: data.tableId,
        date: day,
        service: data.service,
        assignmentType: data.assignmentType,
      },
    },
    create: {
      venueId,
      waiterId: data.waiterId,
      date: day,
      service: data.service,
      scope: "TABLE",
      tableId: data.tableId,
      roomId: table.roomId,
      assignmentType: data.assignmentType,
    },
    update: { waiterId: data.waiterId, roomId: table.roomId },
    include: { waiter: { select: { id: true, firstName: true, lastName: true, status: true } } },
  });
}

export async function removeTableStaffAssignment(
  venueId: string,
  params: { tableId: string; assignmentType: StaffCapability; date: Date; service: string },
) {
  const day = normalizeDate(params.date);
  await db.staffAssignment.deleteMany({
    where: {
      venueId,
      tableId: params.tableId,
      assignmentType: params.assignmentType,
      date: day,
      service: params.service,
    },
  });
}
