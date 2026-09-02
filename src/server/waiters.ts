import { z } from "zod";
import { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { db } from "@/lib/db";
import { staffPrimaryRoleLabel } from "@/lib/staff-roles";

export const WAITER_ROLES = [
  "Cameriere",
  "Responsabile di sala",
  "Maître",
  "Runner",
  "Sommelier",
  "Host / Hostess",
  "Altro",
] as const;

export const WaiterInput = z.object({
  firstName: z.string().trim().min(1, "required"),
  lastName: z.string().trim().min(1, "required"),
  birthday: z.coerce.date().refine((d) => d.getTime() <= Date.now(), "future_date"),
  phone: z
    .string()
    .trim()
    .min(1, "required")
    .regex(/^\+?[0-9\s()-]{6,20}$/, "invalid_phone")
    .refine((v) => (v.match(/\d/g)?.length ?? 0) >= 6, "invalid_phone"),
  // Legacy free-text role, kept for backward compatibility and historical
  // display — now optional, derived from primaryRole when omitted (see
  // resolveRole below). primaryRole/capabilities are the new structured
  // fields the UI actually edits going forward.
  role: z.string().trim().min(1).optional(),
  primaryRole: z.nativeEnum(StaffPrimaryRole).nullable().optional(),
  capabilities: z.array(z.nativeEnum(StaffCapability)).optional(),
});

export const WaiterUpdateInput = WaiterInput.partial().extend({
  status: z.enum(["ACTIVE", "RESTING"]).optional(),
  photoUrl: z.string().url().nullable().optional(),
});

/** role stays populated (for the legacy list-row subtitle) even though the
 * UI no longer edits it directly — derived from primaryRole's label when a
 * caller doesn't pass an explicit role. */
function resolveRole(data: { role?: string; primaryRole?: StaffPrimaryRole | null }) {
  if (data.role) return data.role;
  if (data.primaryRole) return staffPrimaryRoleLabel(data.primaryRole);
  return undefined;
}

export async function listWaiters(venueId: string) {
  return db.waiter.findMany({ where: { venueId }, orderBy: { createdAt: "desc" } });
}

export async function getWaiter(venueId: string, id: string) {
  return db.waiter.findFirst({ where: { id, venueId } });
}

export async function createWaiter(venueId: string, raw: unknown) {
  const data = WaiterInput.parse(raw);
  const role = resolveRole(data);
  if (!role) throw new Error("role_required");
  return db.waiter.create({ data: { venueId, ...data, role } });
}

export async function updateWaiter(venueId: string, id: string, raw: unknown) {
  const data = WaiterUpdateInput.parse(raw);
  const existing = await db.waiter.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  const role = data.role ?? (data.primaryRole ? staffPrimaryRoleLabel(data.primaryRole) : undefined);
  return db.waiter.update({ where: { id }, data: { ...data, ...(role ? { role } : {}) } });
}

export async function deleteWaiter(venueId: string, id: string) {
  const existing = await db.waiter.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.waiter.delete({ where: { id } });
}
