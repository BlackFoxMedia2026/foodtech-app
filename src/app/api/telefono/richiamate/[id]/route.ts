import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { chiudiRichiamata, segnaTentativo } from "@/server/voice/richiamate";
import {
  LicenzaError,
  richiediFunzioneCentralino,
} from "@/server/licenza-centralino";

/**
 * Chiudere una richiamata, o segnare che si è provato.
 *
 * Tre gesti, e sono tre cose diverse:
 *
 * - **fatta**: ho parlato con la persona, non c'è più niente da fare;
 * - **non richiamare**: ho deciso di lasciar perdere. È una decisione, e
 *   distinguerla da una dimenticanza è tutto il valore di questa coda;
 * - **ho provato**: non risponde. Resta in coda e il contatore sale — senza
 *   questo, o si mente chiudendola o il collega riprova fra cinque minuti.
 */

const Corpo = z.union([
  z.object({
    come: z.enum(["DONE", "IGNORED"]),
    nota: z.string().max(400).nullish(),
  }),
  z.object({ tentativo: z.literal(true) }),
]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());

    if ("tentativo" in corpo) {
      const tentativi = await segnaTentativo(ctx.venueId, params.id);
      return NextResponse.json({ tentativi });
    }

    await chiudiRichiamata(ctx.venueId, params.id, {
      come: corpo.come,
      nota: corpo.nota ?? null,
      attore: ctx.session.user?.email ?? ctx.userId,
    });
    return NextResponse.json({ chiusa: true });
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(
        403,
        "centralino_non_attivo",
        "Il telefono non è attivo su questo locale.",
      );
    }
    if (err instanceof Error && err.message === "not_found") {
      return apiError(
        404,
        "not_found",
        "Questa richiamata non esiste più: forse l'ha già chiusa qualcun altro.",
      );
    }
    return apiErrorResponse(err);
  }
}
