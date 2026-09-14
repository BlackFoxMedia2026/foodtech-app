import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import {
  MESSAGGIO_ERRORE_DOCUMENTO,
  STATUS_ERRORE_DOCUMENTO,
  StaffDocumentError,
  listStaffDocuments,
  uploadStaffDocument,
} from "@/server/staff-documents";

/**
 * I documenti di una persona. Stessa capacità dei contratti
 * (`manage_contracts`): una busta paga o un permesso di soggiorno sono dati
 * dello stesso peso, e chi può leggere l'uno può leggere l'altro.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await listStaffDocuments(ctx.venueId, params.id));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid_form", "Richiesta non valida.");
  try {
    const saved = await uploadStaffDocument(
      ctx.venueId,
      params.id,
      form.get("file"),
      {
        name: form.get("name"),
        category: form.get("category") ?? undefined,
        expiresAt: form.get("expiresAt") || null,
        notes: form.get("notes") || null,
      },
      auditActor(ctx, req),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    if (err instanceof StaffDocumentError) {
      return apiError(STATUS_ERRORE_DOCUMENTO[err.code], err.code, MESSAGGIO_ERRORE_DOCUMENTO[err.code]);
    }
    return apiErrorResponse(err);
  }
}
