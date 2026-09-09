import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { TeamError, chiudiLeSessioni } from "@/server/team";

/**
 * Chiude tutte le sessioni di una persona del team.
 *
 * `DELETE` e non `POST`: quello che si sta cancellando è l'accesso aperto, e
 * il verbo dice cosa succede.
 *
 * Riservata a `manage_venue`, come le altre azioni sul team. Su di sé non si
 * agisce da qui: per uscire dai propri dispositivi c'è `/api/account/sessioni`,
 * che non chiede di essere manager — chiudere le proprie sessioni è sempre
 * lecito.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const quando = await chiudiLeSessioni(ctx.venueId, params.id, ctx.userId, auditActor(ctx, req));
    return NextResponse.json({ da: quando.toISOString() });
  } catch (err) {
    if (err instanceof TeamError) {
      if (err.code === "non_su_di_te") {
        return apiError(
          409,
          err.code,
          "Per uscire dai tuoi dispositivi usa «Esci da tutti i dispositivi» nel tuo profilo.",
        );
      }
      return apiError(409, err.code, "Questa persona non fa parte di questo locale.");
    }
    return apiErrorResponse(err);
  }
}
