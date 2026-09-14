import { del, get, put } from "@vercel/blob";
import { z } from "zod";
import { StaffDocumentCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * I documenti della persona: carta d'identità, permesso di soggiorno, buste
 * paga, attestati, certificati medici.
 *
 * Stessa disciplina di `contract-documents.ts`, che resta com'è perché il
 * documento del contratto appartiene al contratto e non alla persona:
 *
 * - il file sta nel Blob con un percorso interno e un UUID; il suo URL non
 *   esce mai dal server. Si legge solo attraverso
 *   `/api/waiters/[id]/documents/[docId]`, che ricontrolla sessione, locale
 *   e permesso a ogni richiesta;
 * - il tipo dichiarato non basta: si guardano i primi byte;
 * - quando si sostituisce, il vecchio blob si cancella **dopo** che il nuovo
 *   è scritto e referenziato. Un caricamento fallito non lascia mai la
 *   persona senza il documento che aveva.
 */

export const STAFF_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const MIME_AMMESSI = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

const ESTENSIONE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function primiByteCoerenti(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return buffer.subarray(0, 4).toString("latin1") === "%PDF";
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}

export class StaffDocumentError extends Error {
  constructor(readonly code: "not_found" | "unsupported_type" | "file_too_large" | "invalid_file" | "missing_file") {
    super(code);
    this.name = "StaffDocumentError";
  }
}

export const MESSAGGIO_ERRORE_DOCUMENTO: Record<StaffDocumentError["code"], string> = {
  not_found: "Questo documento non esiste più.",
  unsupported_type: "Carica un file PDF, JPG, PNG o WebP.",
  file_too_large: "Il file supera i 10 MB.",
  invalid_file: "Il file non è valido.",
  missing_file: "Nessun file ricevuto.",
};

export const STATUS_ERRORE_DOCUMENTO: Record<StaffDocumentError["code"], number> = {
  not_found: 404,
  unsupported_type: 400,
  file_too_large: 413,
  invalid_file: 400,
  missing_file: 400,
};

/** I dati che accompagnano un file: come si chiama, di che tipo è, quando scade. */
export const StaffDocumentMetaInput = z.object({
  name: z.string().trim().min(1, "required").max(160),
  category: z.nativeEnum(StaffDocumentCategory).default("ALTRO"),
  expiresAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const StaffDocumentUpdateInput = StaffDocumentMetaInput.partial();

async function personaDelLocale(venueId: string, waiterId: string) {
  const persona = await db.waiter.findFirst({ where: { id: waiterId, venueId }, select: { id: true } });
  if (!persona) throw new StaffDocumentError("not_found");
}

async function leggiFile(file: unknown) {
  if (!file || !(file instanceof File)) throw new StaffDocumentError("missing_file");
  if (!MIME_AMMESSI.has(file.type)) throw new StaffDocumentError("unsupported_type");
  if (file.size > STAFF_DOCUMENT_MAX_BYTES) throw new StaffDocumentError("file_too_large");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!primiByteCoerenti(buffer, file.type)) throw new StaffDocumentError("invalid_file");
  return { file, buffer };
}

export async function listStaffDocuments(venueId: string, waiterId: string) {
  return db.staffDocument.findMany({
    where: { venueId, waiterId },
    orderBy: { createdAt: "desc" },
    include: {
      training: { select: { id: true, kind: true, name: true } },
      medicalCheck: { select: { id: true, examinedAt: true } },
    },
  });
}

export async function getStaffDocument(venueId: string, waiterId: string, docId: string) {
  return db.staffDocument.findFirst({ where: { id: docId, venueId, waiterId } });
}

export async function uploadStaffDocument(
  venueId: string,
  waiterId: string,
  rawFile: unknown,
  rawMeta: unknown,
  actor?: AuditActor,
) {
  await personaDelLocale(venueId, waiterId);
  const meta = StaffDocumentMetaInput.parse(rawMeta);
  const { file, buffer } = await leggiFile(rawFile);

  const pathname = `staff-documents/${venueId}/${waiterId}/${crypto.randomUUID()}.${ESTENSIONE[file.type]}`;
  // Il Blob di questo progetto conosce solo `access: "public"` (vedi la nota in
  // contract-documents.ts): l'URL diretto non si restituisce a nessuno e
  // l'UUID nel percorso lo rende non indovinabile. È un compromesso noto.
  const blob = await put(pathname, buffer, { access: "public", contentType: file.type });

  const saved = await db.staffDocument.create({
    data: {
      venueId,
      waiterId,
      name: meta.name,
      category: meta.category,
      expiresAt: meta.expiresAt ?? null,
      notes: meta.notes ?? null,
      storageKey: blob.pathname,
      originalFileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy: actor?.userId ?? null,
    },
  });

  await recordAudit(actor, "waiter.document_upload", "waiter", waiterId, {
    documento: saved.name,
    categoria: saved.category,
    file: saved.originalFileName,
  });
  return saved;
}

/** Sostituisce il file, tenendo nome, categoria e scadenza. */
export async function replaceStaffDocumentFile(
  venueId: string,
  waiterId: string,
  docId: string,
  rawFile: unknown,
  actor?: AuditActor,
) {
  const existing = await getStaffDocument(venueId, waiterId, docId);
  if (!existing) throw new StaffDocumentError("not_found");
  const { file, buffer } = await leggiFile(rawFile);

  const pathname = `staff-documents/${venueId}/${waiterId}/${crypto.randomUUID()}.${ESTENSIONE[file.type]}`;
  const blob = await put(pathname, buffer, { access: "public", contentType: file.type });

  const saved = await db.staffDocument.update({
    where: { id: docId },
    data: {
      storageKey: blob.pathname,
      originalFileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy: actor?.userId ?? null,
    },
  });
  if (existing.storageKey !== saved.storageKey) await del(existing.storageKey).catch(() => {});

  await recordAudit(actor, "waiter.document_replace", "waiter", waiterId, {
    documento: saved.name,
    file: saved.originalFileName,
  });
  return saved;
}

export async function updateStaffDocument(venueId: string, waiterId: string, docId: string, raw: unknown) {
  const existing = await getStaffDocument(venueId, waiterId, docId);
  if (!existing) throw new StaffDocumentError("not_found");
  const data = StaffDocumentUpdateInput.parse(raw);
  return db.staffDocument.update({ where: { id: docId }, data });
}

export async function deleteStaffDocument(venueId: string, waiterId: string, docId: string, actor?: AuditActor) {
  const existing = await getStaffDocument(venueId, waiterId, docId);
  if (!existing) throw new StaffDocumentError("not_found");
  // Le righe di corso/visita che lo puntavano restano, con il riferimento a
  // null (onDelete: SetNull): si perde il file, non il corso.
  await db.staffDocument.delete({ where: { id: docId } });
  await del(existing.storageKey).catch(() => {});
  await recordAudit(actor, "waiter.document_delete", "waiter", waiterId, {
    documento: existing.name,
    categoria: existing.category,
  });
}

/** Lo stream del file, per la route che lo serve. */
export async function streamStaffDocument(storageKey: string) {
  return get(storageKey, { access: "public" });
}

/**
 * Carica un file **come attestato di un corso** o **certificato di una
 * visita**: crea il documento nella categoria giusta e lo collega. Se
 * c'era già un attestato, quello vecchio si cancella — un corso ha un
 * attestato, non una pila.
 */
export async function uploadAttestato(
  venueId: string,
  waiterId: string,
  destinazione: { trainingId: string } | { medicalCheckId: string },
  rawFile: unknown,
  nome: string,
  actor?: AuditActor,
) {
  const categoria: StaffDocumentCategory = "trainingId" in destinazione ? "ATTESTATO" : "CERTIFICATO_MEDICO";
  const riga =
    "trainingId" in destinazione
      ? await db.staffTraining.findFirst({ where: { id: destinazione.trainingId, venueId, waiterId } })
      : await db.staffMedicalCheck.findFirst({ where: { id: destinazione.medicalCheckId, venueId, waiterId } });
  if (!riga) throw new StaffDocumentError("not_found");

  const nuovo = await uploadStaffDocument(
    venueId,
    waiterId,
    rawFile,
    { name: nome, category: categoria, expiresAt: riga.expiresAt },
    actor,
  );

  const precedente = riga.certificateDocumentId;
  if ("trainingId" in destinazione) {
    await db.staffTraining.update({ where: { id: riga.id }, data: { certificateDocumentId: nuovo.id } });
  } else {
    await db.staffMedicalCheck.update({ where: { id: riga.id }, data: { certificateDocumentId: nuovo.id } });
  }
  if (precedente) {
    const vecchio = await db.staffDocument.findUnique({ where: { id: precedente } });
    if (vecchio) {
      await db.staffDocument.delete({ where: { id: precedente } });
      await del(vecchio.storageKey).catch(() => {});
    }
  }
  return nuovo;
}
