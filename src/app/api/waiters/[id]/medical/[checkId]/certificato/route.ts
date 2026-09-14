import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { MESSAGGIO_ERRORE_DOCUMENTO, STATUS_ERRORE_DOCUMENTO, StaffDocumentError, uploadAttestato } from "@/server/staff-documents";

/** Il certificato di idoneità: un documento della persona, collegato alla visita. */
export async function POST(req: Request, { params }: { params: { id: string; checkId: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid_form", "Richiesta non valida.");
  try {
    const nome = String(form.get("name") ?? "Certificato di idoneità").trim() || "Certificato di idoneità";
    const saved = await uploadAttestato(ctx.venueId, params.id, { medicalCheckId: params.checkId }, form.get("file"), nome, auditActor(ctx, req));
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    if (err instanceof StaffDocumentError) {
      return apiError(STATUS_ERRORE_DOCUMENTO[err.code], err.code, MESSAGGIO_ERRORE_DOCUMENTO[err.code]);
    }
    return apiErrorResponse(err);
  }
}
