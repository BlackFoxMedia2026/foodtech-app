import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { chiudiLeMieSessioni } from "@/server/team";

/**
 * «Esci da tutti i dispositivi», per sé.
 *
 * Nessuna abilità richiesta: chiudere le proprie sessioni è sempre lecito, ed
 * è la cosa da fare quando si è lasciato l'accesso aperto da qualche parte e
 * non si sa dove — un tablet in sala, il telefono di un collega.
 *
 * Chiude anche la sessione da cui arriva la richiesta: è il senso di «tutti»,
 * e chi la usa se lo aspetta.
 */
export async function DELETE(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  try {
    const quando = await chiudiLeMieSessioni(ctx.userId, auditActor(ctx, req));
    return NextResponse.json({ da: quando.toISOString() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
