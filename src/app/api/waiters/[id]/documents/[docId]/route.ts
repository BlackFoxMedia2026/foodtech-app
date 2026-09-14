import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import {
  MESSAGGIO_ERRORE_DOCUMENTO,
  STATUS_ERRORE_DOCUMENTO,
  StaffDocumentError,
  deleteStaffDocument,
  getStaffDocument,
  replaceStaffDocumentFile,
  streamStaffDocument,
  updateStaffDocument,
} from "@/server/staff-documents";

type Params = { params: { id: string; docId: string } };

function erroreDocumento(err: unknown) {
  if (err instanceof StaffDocumentError) {
    return apiError(STATUS_ERRORE_DOCUMENTO[err.code], err.code, MESSAGGIO_ERRORE_DOCUMENTO[err.code]);
  }
  return apiErrorResponse(err);
}

/** Il file, in streaming, dopo aver ricontrollato tutto: come per i
 * contratti, l'URL del Blob non arriva mai al browser. */
export async function GET(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  const doc = await getStaffDocument(ctx.venueId, params.id, params.docId);
  if (!doc) return apiError(404, "not_found", MESSAGGIO_ERRORE_DOCUMENTO.not_found);

  const result = await streamStaffDocument(doc.storageKey);
  if (!result) return apiError(404, "not_found", MESSAGGIO_ERRORE_DOCUMENTO.not_found);

  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.fileSize),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.originalFileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

/** Nome, categoria, scadenza, note: i dati intorno al file. */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  try {
    const updated = await updateStaffDocument(ctx.venueId, params.id, params.docId, await req.json());
    return NextResponse.json(updated);
  } catch (err) {
    return erroreDocumento(err);
  }
}

/** Sostituisce il file, tenendo i dati intorno. */
export async function POST(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid_form", "Richiesta non valida.");
  try {
    const saved = await replaceStaffDocumentFile(ctx.venueId, params.id, params.docId, form.get("file"), auditActor(ctx, req));
    return NextResponse.json(saved);
  } catch (err) {
    return erroreDocumento(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteStaffDocument(ctx.venueId, params.id, params.docId, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroreDocumento(err);
  }
}
