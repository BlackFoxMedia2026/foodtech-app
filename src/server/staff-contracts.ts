import { z } from "zod";
import { StaffContractType } from "@prisma/client";
import { db } from "@/lib/db";
import { getContractStatus, getContractStatusDetail, pickCurrentContract, sortContractsByStartDateDesc } from "@/lib/staff-contracts";
import { deleteContractDocumentBlobIfAny } from "@/server/contract-documents";

export const StaffContractInput = z
  .object({
    contractType: z.nativeEnum(StaffContractType),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    weeklyHours: z.coerce.number().min(0, "negative_hours").nullable().optional(),
    contractualRole: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "end_before_start",
    path: ["endDate"],
  });

export const StaffContractUpdateInput = StaffContractInput;

export async function listContracts(venueId: string, waiterId: string) {
  const contracts = await db.staffContract.findMany({
    where: { venueId, waiterId },
    include: { document: { select: { id: true, originalFileName: true, mimeType: true, fileSize: true, createdAt: true } } },
  });
  return sortContractsByStartDateDesc(contracts);
}

export async function getContract(venueId: string, waiterId: string, contractId: string) {
  return db.staffContract.findFirst({ where: { id: contractId, venueId, waiterId } });
}

export async function createContract(venueId: string, waiterId: string, raw: unknown) {
  const waiter = await db.waiter.findFirst({ where: { id: waiterId, venueId } });
  if (!waiter) throw new Error("not_found");
  const data = StaffContractInput.parse(raw);
  return db.staffContract.create({ data: { venueId, waiterId, ...data } });
}

export async function updateContract(venueId: string, waiterId: string, contractId: string, raw: unknown) {
  const existing = await db.staffContract.findFirst({ where: { id: contractId, venueId, waiterId } });
  if (!existing) throw new Error("not_found");
  const data = StaffContractUpdateInput.parse(raw);
  const updated = await db.staffContract.update({ where: { id: contractId }, data });
  // The expiry date changed — drop reminders already sent so the daily job
  // re-evaluates thresholds against the new date instead of staying silent
  // for a schedule that no longer applies (brief section 39).
  if (existing.endDate?.getTime() !== updated.endDate?.getTime()) {
    await db.staffContractReminder.deleteMany({ where: { contractId } });
  }
  return updated;
}

export async function deleteContract(venueId: string, waiterId: string, contractId: string) {
  const existing = await db.staffContract.findFirst({ where: { id: contractId, venueId, waiterId } });
  if (!existing) throw new Error("not_found");
  // The ContractDocument row cascades automatically via the FK, but the
  // blob in storage doesn't — clean it up first so deleting a contract
  // never leaves an orphaned file behind (brief section 29).
  await deleteContractDocumentBlobIfAny(contractId);
  return db.staffContract.delete({ where: { id: contractId } });
}

/** Current contract status per waiter, keyed by waiterId — only for waiters
 * whose current contract is EXPIRING_SOON or EXPIRED, since the "Camerieri"
 * list should stay clean and only flag what needs attention (brief section
 * 19/20). Used by the waiters list indicator and available for the AI agent
 * / a future dashboard card (brief section 43). */
export async function listAttentionNeededContracts(venueId: string) {
  const contracts = await db.staffContract.findMany({ where: { venueId } });
  const byWaiter = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const list = byWaiter.get(c.waiterId) ?? [];
    list.push(c);
    byWaiter.set(c.waiterId, list);
  }

  const result = new Map<string, { status: "EXPIRING_SOON" | "EXPIRED"; detail: string }>();
  for (const [waiterId, list] of byWaiter) {
    const current = pickCurrentContract(list);
    if (!current) continue;
    const status = getContractStatus(current);
    if (status === "EXPIRING_SOON" || status === "EXPIRED") {
      result.set(waiterId, { status, detail: getContractStatusDetail(current) });
    }
  }
  return result;
}
