import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { salvaPolitica } from "@/server/caparre";

/**
 * La regola della caparra di questo locale.
 *
 * `manage_venue`: è una regola sul **denaro dei clienti** — quanto si chiede,
 * da quanti coperti, entro quando si annulla senza perderla. Non è il gesto di
 * chi prende le prenotazioni.
 */
export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      await salvaPolitica(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) }),
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      /* Le due regole che si possono sbagliare hanno una frase loro: una
         caparra accesa senza importo è un interruttore che non fa niente, e
         due importi insieme sono un'occasione di dirne uno sbagliato. */
      const dove = err.issues[0]?.path?.[0];
      return apiError(
        422,
        "caparra_non_valida",
        dove === "fissaCents"
          ? "Scegli **uno** dei due importi: a testa oppure fisso."
          : "Per accendere la caparra serve un importo: a testa oppure fisso.",
      );
    }
    return apiErrorResponse(err);
  }
}
