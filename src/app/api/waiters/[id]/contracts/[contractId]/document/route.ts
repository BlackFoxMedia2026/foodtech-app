import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { can, getActiveVenue } from "@/lib/tenant";
import {
  ContractDocumentError,
  deleteContractDocument,
  getContractDocument,
  uploadContractDocument,
} from "@/server/contract-documents";

const ERROR_STATUS: Record<ContractDocumentError["code"], number> = {
  not_found: 404,
  unsupported_type: 400,
  file_too_large: 413,
  invalid_file: 400,
};

const ERROR_MESSAGE: Record<ContractDocumentError["code"], string> = {
  not_found: "not_found",
  unsupported_type: "Carica un file PDF, JPG o PNG.",
  file_too_large: "Il file supera la dimensione massima consentita.",
  invalid_file: "Il file non è valido.",
};

/** GET streams the document back through this authenticated route rather
 * than a signed Blob URL handed to the client — every request re-checks
 * session + tenant + contract ownership + ability, so nothing about the
 * file is reachable just by knowing the contractId (brief section 19). */
export async function GET(req: Request, { params }: { params: { id: string; contractId: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_contracts")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let doc;
  try {
    doc = await getContractDocument(ctx.venueId, params.id, params.contractId);
  } catch (err) {
    if (err instanceof ContractDocumentError) return NextResponse.json({ error: err.code }, { status: ERROR_STATUS[err.code] });
    throw err;
  }
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await get(doc.storageKey, { access: "public" });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.fileSize),
      "Content-Disposition": `${disposition}; filename="${doc.originalFileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string; contractId: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_contracts")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    const saved = await uploadContractDocument(ctx.venueId, params.id, params.contractId, file, ctx.userId);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    if (err instanceof ContractDocumentError) {
      return NextResponse.json({ error: err.code, message: ERROR_MESSAGE[err.code] }, { status: ERROR_STATUS[err.code] });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; contractId: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_contracts")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await deleteContractDocument(ctx.venueId, params.id, params.contractId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContractDocumentError) return NextResponse.json({ error: err.code }, { status: ERROR_STATUS[err.code] });
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
