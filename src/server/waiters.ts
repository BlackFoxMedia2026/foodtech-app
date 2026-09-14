import { z } from "zod";
import { fieldDiff, recordAudit, type AuditActor } from "./audit";
import { StaffCapability, StaffDepartment, StaffPrimaryRole, WaiterStatus } from "@prisma/client";
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
  email: z.string().trim().toLowerCase().email("invalid_email").max(200).nullable().optional(),
  hireDate: z.coerce.date().nullable().optional(),
  // Override del reparto: normalmente nullo, il reparto si deduce dal ruolo
  // (ROLE_DEPARTMENT in @/lib/staff-roles). Nessuna schermata lo scrive oggi.
  department: z.nativeEnum(StaffDepartment).nullable().optional(),
});

export const WaiterUpdateInput = WaiterInput.partial().extend({
  status: z.nativeEnum(WaiterStatus).optional(),
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
  return db.waiter.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    // L'account collegato, quando c'è. Serve alla scheda della persona per
    // rispondere a «questo qui entra in Tavolo, e con che indirizzo?» — che
    // finché `Waiter.userId` non si vedeva da nessuna parte era una domanda
    // a cui si poteva rispondere solo dal database.
    include: { user: { select: { email: true } } },
  });
}

/** Quante persone per stato, per la fascia in cima a Staff. Un conteggio solo
 * in una query sola: l'elenco è già in memoria, ma contare lì dentro vorrebbe
 * dire contare **le persone filtrate**, e i numeri in testata devono parlare
 * di tutto l'organico anche mentre si sta cercando qualcuno. */
export async function countWaitersByStatus(venueId: string) {
  const righe = await db.waiter.groupBy({
    by: ["status"],
    where: { venueId },
    _count: { _all: true },
  });
  const per = Object.fromEntries(righe.map((r) => [r.status, r._count._all])) as Partial<
    Record<WaiterStatus, number>
  >;
  return {
    totale: righe.reduce((n, r) => n + r._count._all, 0),
    inServizio: per.ACTIVE ?? 0,
    aRiposo: per.RESTING ?? 0,
    assenti: (per.VACATION ?? 0) + (per.SICK_LEAVE ?? 0) + (per.UNAVAILABLE ?? 0),
  };
}

export async function getWaiter(venueId: string, id: string) {
  return db.waiter.findFirst({ where: { id, venueId } });
}

export async function createWaiter(venueId: string, raw: unknown, actor?: AuditActor) {
  const data = WaiterInput.parse(raw);
  const role = resolveRole(data);
  if (!role) throw new Error("role_required");
  const created = await db.waiter.create({ data: { venueId, ...data, role } });
  await recordAudit(actor, "waiter.create", "waiter", created.id, {
    cameriere: `${created.firstName} ${created.lastName}`,
    ruolo: created.role,
  });
  return created;
}

export async function updateWaiter(venueId: string, id: string, raw: unknown, actor?: AuditActor) {
  const data = WaiterUpdateInput.parse(raw);
  const existing = await db.waiter.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  const role = data.role ?? (data.primaryRole ? staffPrimaryRoleLabel(data.primaryRole) : undefined);
  const updated = await db.waiter.update({ where: { id }, data: { ...data, ...(role ? { role } : {}) } });
  const diff = fieldDiff(existing, updated);
  if (diff) await recordAudit(actor, "waiter.update", "waiter", id, diff);
  return updated;
}

export async function deleteWaiter(venueId: string, id: string, actor?: AuditActor) {
  const existing = await db.waiter.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  const deleted = await db.waiter.delete({ where: { id } });
  await recordAudit(actor, "waiter.delete", "waiter", id, {
    cameriere: `${existing.firstName} ${existing.lastName}`,
    ruolo: existing.role,
  });
  return deleted;
}
