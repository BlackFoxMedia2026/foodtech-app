import { z } from "zod";
import { StaffMedicalFitness, StaffTrainingKind } from "@prisma/client";
import { db } from "@/lib/db";
import { fieldDiff, recordAudit, type AuditActor } from "./audit";

/**
 * Formazione e sicurezza: i corsi obbligatori e la visita del medico
 * competente.
 *
 * Due tabelle e non una: un corso si **ripete** (l'aggiornamento HACCP ogni
 * due o tre anni) e ogni edizione ha il suo attestato; una visita medica ha
 * un **giudizio** — idoneo, con limitazioni, non idoneo — che un corso non
 * ha. La scheda mostra per ogni tipo di corso l'edizione più recente, e per
 * la visita l'ultima; le precedenti restano come storia.
 */

export class FormazioneError extends Error {
  constructor(readonly code: "not_found") {
    super(code);
    this.name = "FormazioneError";
  }
}

async function personaDelLocale(venueId: string, waiterId: string) {
  const persona = await db.waiter.findFirst({ where: { id: waiterId, venueId }, select: { id: true } });
  if (!persona) throw new FormazioneError("not_found");
}

/* -------------------------------------------------------------------------- */
/*  Corsi                                                                     */
/* -------------------------------------------------------------------------- */

export const StaffTrainingInput = z
  .object({
    kind: z.nativeEnum(StaffTrainingKind),
    name: z.string().trim().max(160).nullable().optional(),
    completedAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    provider: z.string().trim().max(160).nullable().optional(),
    certificateNumber: z.string().trim().max(80).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => !d.completedAt || !d.expiresAt || d.expiresAt >= d.completedAt, {
    message: "expiry_before_completion",
    path: ["expiresAt"],
  });

export async function createTraining(venueId: string, waiterId: string, raw: unknown, actor?: AuditActor) {
  await personaDelLocale(venueId, waiterId);
  const data = StaffTrainingInput.parse(raw);
  const created = await db.staffTraining.create({
    data: {
      venueId,
      waiterId,
      kind: data.kind,
      name: data.name || null,
      completedAt: data.completedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      provider: data.provider || null,
      certificateNumber: data.certificateNumber || null,
      notes: data.notes || null,
    },
  });
  await recordAudit(actor, "waiter.training_create", "waiter", waiterId, {
    corso: created.name ?? created.kind,
    svolto: created.completedAt?.toISOString() ?? null,
    scade: created.expiresAt?.toISOString() ?? null,
  });
  return created;
}

export async function updateTraining(venueId: string, waiterId: string, trainingId: string, raw: unknown, actor?: AuditActor) {
  const existing = await db.staffTraining.findFirst({ where: { id: trainingId, venueId, waiterId } });
  if (!existing) throw new FormazioneError("not_found");
  const data = StaffTrainingInput.parse(raw);
  const updated = await db.staffTraining.update({
    where: { id: trainingId },
    data: {
      kind: data.kind,
      name: data.name || null,
      completedAt: data.completedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      provider: data.provider || null,
      certificateNumber: data.certificateNumber || null,
      notes: data.notes || null,
    },
  });
  // L'attestato collegato eredita la scadenza del corso: è la stessa data,
  // e due copie della stessa data prima o poi non coincidono più.
  if (updated.certificateDocumentId && existing.expiresAt?.getTime() !== updated.expiresAt?.getTime()) {
    await db.staffDocument.update({ where: { id: updated.certificateDocumentId }, data: { expiresAt: updated.expiresAt } });
  }
  const diff = fieldDiff(existing, updated);
  if (diff) await recordAudit(actor, "waiter.training_update", "waiter", waiterId, { corso: updated.name ?? updated.kind, ...diff });
  return updated;
}

export async function deleteTraining(venueId: string, waiterId: string, trainingId: string, actor?: AuditActor) {
  const existing = await db.staffTraining.findFirst({ where: { id: trainingId, venueId, waiterId } });
  if (!existing) throw new FormazioneError("not_found");
  // L'attestato resta fra i documenti: è un file che la persona ha, anche se
  // la riga del corso sparisce. Si toglie solo il collegamento.
  await db.staffTraining.delete({ where: { id: trainingId } });
  await recordAudit(actor, "waiter.training_delete", "waiter", waiterId, { corso: existing.name ?? existing.kind });
}

/* -------------------------------------------------------------------------- */
/*  Visita medica                                                             */
/* -------------------------------------------------------------------------- */

export const StaffMedicalCheckInput = z
  .object({
    examinedAt: z.coerce.date(),
    fitness: z.nativeEnum(StaffMedicalFitness).default("IDONEO"),
    expiresAt: z.coerce.date().nullable().optional(),
    doctorName: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => !d.expiresAt || d.expiresAt >= d.examinedAt, {
    message: "expiry_before_exam",
    path: ["expiresAt"],
  });

export async function createMedicalCheck(venueId: string, waiterId: string, raw: unknown, actor?: AuditActor) {
  await personaDelLocale(venueId, waiterId);
  const data = StaffMedicalCheckInput.parse(raw);
  const created = await db.staffMedicalCheck.create({
    data: {
      venueId,
      waiterId,
      examinedAt: data.examinedAt,
      fitness: data.fitness,
      expiresAt: data.expiresAt ?? null,
      doctorName: data.doctorName || null,
      notes: data.notes || null,
    },
  });
  await recordAudit(actor, "waiter.medical_create", "waiter", waiterId, {
    visita: created.examinedAt.toISOString(),
    idoneita: created.fitness,
    scade: created.expiresAt?.toISOString() ?? null,
  });
  return created;
}

export async function updateMedicalCheck(venueId: string, waiterId: string, checkId: string, raw: unknown, actor?: AuditActor) {
  const existing = await db.staffMedicalCheck.findFirst({ where: { id: checkId, venueId, waiterId } });
  if (!existing) throw new FormazioneError("not_found");
  const data = StaffMedicalCheckInput.parse(raw);
  const updated = await db.staffMedicalCheck.update({
    where: { id: checkId },
    data: {
      examinedAt: data.examinedAt,
      fitness: data.fitness,
      expiresAt: data.expiresAt ?? null,
      doctorName: data.doctorName || null,
      notes: data.notes || null,
    },
  });
  if (updated.certificateDocumentId && existing.expiresAt?.getTime() !== updated.expiresAt?.getTime()) {
    await db.staffDocument.update({ where: { id: updated.certificateDocumentId }, data: { expiresAt: updated.expiresAt } });
  }
  const diff = fieldDiff(existing, updated);
  if (diff) await recordAudit(actor, "waiter.medical_update", "waiter", waiterId, diff);
  return updated;
}

export async function deleteMedicalCheck(venueId: string, waiterId: string, checkId: string, actor?: AuditActor) {
  const existing = await db.staffMedicalCheck.findFirst({ where: { id: checkId, venueId, waiterId } });
  if (!existing) throw new FormazioneError("not_found");
  await db.staffMedicalCheck.delete({ where: { id: checkId } });
  await recordAudit(actor, "waiter.medical_delete", "waiter", waiterId, { visita: existing.examinedAt.toISOString() });
}
