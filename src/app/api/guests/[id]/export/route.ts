import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { ExportError, esportaOspite, nomeFileExport } from "@/server/guest-export";

/**
 * Tutti i dati che il locale ha su una persona, in un file.
 *
 * `manage_venue` come la cancellazione: il documento contiene le note
 * riservate scritte dal personale, e non è una cosa da scaricare passando dal
 * tablet della sala.
 *
 * Arriva come allegato, non come pagina: chi lo chiede lo deve poter girare a
 * chi gliel'ha chiesto, e un JSON aperto dentro il browser non è un file che
 * si inoltra.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const documento = await esportaOspite(ctx.venueId, params.id, { actor: auditActor(ctx, req) });
    const nome = nomeFileExport(documento.documento.riguarda);

    return new NextResponse(JSON.stringify(documento, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${nome}"`,
        // Un documento con dati personali non si mette in cache da nessuna parte.
        "cache-control": "no-store, private",
      },
    });
  } catch (err) {
    if (err instanceof ExportError) return apiError(404, "not_found", "Questo cliente non esiste.");
    return apiErrorResponse(err);
  }
}
