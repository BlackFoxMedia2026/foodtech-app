import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveActiveVenue, setActiveVenueCookie } from "@/lib/tenant";
import { logAttenzione } from "@/lib/observability";
import { origineDa } from "@/lib/origine";
import { apriConsegna } from "@/server/integrations/assistenza";

/**
 * **Il collegamento che Foodtech manda al ristoratore per inserire le
 * credenziali.** Non porta segreti e non ne mostra: se chi lo apre è entrato
 * in Foodtech ed è membro del locale con il permesso di collegare, lo porta
 * sul locale giusto al passo «Accesso» del wizard, dove le credenziali le
 * scrive lui. Altrimenti torna al catalogo con il motivo, senza dire di chi
 * è il collegamento.
 *
 * Chi non è entrato passa dall'accesso e torna qui.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { codice: string } }) {
  const qui = origineDa(headers());
  // Come ogni richiesta autenticata: anche una sessione revocata vale «non entrato».
  const chi = await resolveActiveVenue();
  if (chi.state === "unauthenticated") {
    const ritorno = encodeURIComponent(`/api/integrations/consegna/${params.codice}`);
    return NextResponse.redirect(`${qui}/sign-in?callbackUrl=${ritorno}`, 303);
  }
  const userId = chi.state === "ok" ? chi.context.userId : chi.userId;

  const esito = await apriConsegna(params.codice, { userId });
  if (!esito.ok) {
    logAttenzione("integrazione.consegna_rifiutata", { motivo: esito.motivo });
    return NextResponse.redirect(`${qui}/settings/integrations?consegna=${esito.motivo}`, 303);
  }
  // Il locale del collegamento diventa quello attivo: il wizard lavora lì.
  setActiveVenueCookie(esito.venueId);
  return NextResponse.redirect(`${qui}/settings/integrations/${esito.slug}?collega=1&passo=accesso&consegna=1`, 303);
}
