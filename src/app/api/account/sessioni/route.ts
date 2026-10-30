import { NextResponse } from "next/server";
import { apiErrorResponse, requireUtenteApi } from "@/lib/api-auth";
import { auditAttoreDelProprioAccesso } from "@/server/audit";
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
 *
 * Guardia **dell'utente**, non del locale: l'amministratore di piattaforma non
 * appartiene a nessun locale, e con `requireVenueApi` riceveva 403 — cioè non
 * poteva chiudere le proprie sessioni, lui che vede tutti i ristoranti.
 */
export async function DELETE(req: Request) {
  const ctx = await requireUtenteApi();
  if (!ctx.ok) return ctx.response;
  try {
    const quando = await chiudiLeMieSessioni(ctx.userId, await auditAttoreDelProprioAccesso(ctx, req));
    return NextResponse.json({ da: quando.toISOString() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
