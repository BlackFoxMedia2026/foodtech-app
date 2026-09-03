import { del, put } from "@vercel/blob";
import { db } from "@/lib/db";

export const CONTRACT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** First bytes of each accepted format — declared MIME type alone can be
 * spoofed by a hand-crafted multipart request, so this is a cheap
 * defense-in-depth check against uploads carrying a fake Content-Type
 * (brief section 5/26). Not a full antivirus scan — the project has none to
 * reuse, and building one is out of scope here. */
function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return buffer.subarray(0, 4).toString("latin1") === "%PDF";
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return false;
}

export class ContractDocumentError extends Error {
  constructor(public code: "not_found" | "unsupported_type" | "file_too_large" | "invalid_file") {
    super(code);
  }
}

export async function getContractDocument(venueId: string, waiterId: string, contractId: string) {
  const contract = await db.staffContract.findFirst({ where: { id: contractId, venueId, waiterId } });
  if (!contract) throw new ContractDocumentError("not_found");
  return db.contractDocument.findUnique({ where: { contractId } });
}

export async function uploadContractDocument(
  venueId: string,
  waiterId: string,
  contractId: string,
  file: File,
  uploadedBy: string,
) {
  const contract = await db.staffContract.findFirst({ where: { id: contractId, venueId, waiterId } });
  if (!contract) throw new ContractDocumentError("not_found");

  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new ContractDocumentError("unsupported_type");
  if (file.size > CONTRACT_DOCUMENT_MAX_BYTES) throw new ContractDocumentError("file_too_large");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesMagicBytes(buffer, file.type)) throw new ContractDocumentError("invalid_file");

  const extension = EXTENSION_BY_MIME[file.type];
  const pathname = `contract-documents/${venueId}/${waiterId}/${contractId}/${crypto.randomUUID()}.${extension}`;
  // The project's Blob store only supports `access: "public"` (same as the
  // waiter-photo/brand-logo uploads elsewhere in this app) — there is no
  // per-upload "private" mode available here. The blob's direct URL is
  // never returned to the client or stored anywhere reachable by it: every
  // view/download goes through the authenticated proxy route below, and the
  // random UUID in the path keeps the direct URL unguessable. This is a
  // known trade-off, not a true private-object guarantee — see the task's
  // final report.
  const blob = await put(pathname, buffer, { access: "public", contentType: file.type });

  const existing = await db.contractDocument.findUnique({ where: { contractId } });
  const saved = await db.contractDocument.upsert({
    where: { contractId },
    create: {
      venueId,
      contractId,
      storageKey: blob.pathname,
      originalFileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy,
    },
    update: {
      storageKey: blob.pathname,
      originalFileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy,
    },
  });

  // Replacing an existing document (brief section 12): drop the old blob
  // only after the new one is safely written and referenced, so a failed
  // upload never leaves the contract without its previous document.
  if (existing && existing.storageKey !== saved.storageKey) {
    await del(existing.storageKey).catch(() => {});
  }

  return saved;
}

export async function deleteContractDocument(venueId: string, waiterId: string, contractId: string) {
  const contract = await db.staffContract.findFirst({ where: { id: contractId, venueId, waiterId } });
  if (!contract) throw new ContractDocumentError("not_found");

  const existing = await db.contractDocument.findUnique({ where: { contractId } });
  if (!existing) throw new ContractDocumentError("not_found");

  await db.contractDocument.delete({ where: { contractId } });
  await del(existing.storageKey).catch(() => {});
}

/** Called when a contract itself is deleted — the DB row cascades
 * automatically (onDelete: Cascade), but the blob in storage does not, so
 * this must run before the contract is deleted to avoid an orphaned file
 * (brief section 29). */
export async function deleteContractDocumentBlobIfAny(contractId: string) {
  const existing = await db.contractDocument.findUnique({ where: { contractId } });
  if (!existing) return;
  await del(existing.storageKey).catch(() => {});
}
