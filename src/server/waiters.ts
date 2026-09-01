import { z } from "zod";
import { db } from "@/lib/db";

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
  role: z.string().trim().min(1, "required"),
});

export const WaiterUpdateInput = WaiterInput.partial().extend({
  status: z.enum(["ACTIVE", "RESTING"]).optional(),
  photoUrl: z.string().url().nullable().optional(),
});

export async function listWaiters(venueId: string) {
  return db.waiter.findMany({ where: { venueId }, orderBy: { createdAt: "desc" } });
}

export async function getWaiter(venueId: string, id: string) {
  return db.waiter.findFirst({ where: { id, venueId } });
}

export async function createWaiter(venueId: string, raw: unknown) {
  const data = WaiterInput.parse(raw);
  return db.waiter.create({ data: { venueId, ...data } });
}

export async function updateWaiter(venueId: string, id: string, raw: unknown) {
  const data = WaiterUpdateInput.parse(raw);
  const existing = await db.waiter.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.waiter.update({ where: { id }, data });
}

export async function deleteWaiter(venueId: string, id: string) {
  const existing = await db.waiter.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.waiter.delete({ where: { id } });
}
