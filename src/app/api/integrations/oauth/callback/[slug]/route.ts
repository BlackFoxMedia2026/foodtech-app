import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { requireVenueApi } from "@/lib/api-auth";
import { logAttenzione } from "@/lib/observability";
import { auditActor } from "@/server/audit";
import { completaOAuth } from "@/server/integrations/installazioni";
import { COOKIE_NONCE, verificaState } from "@/server/integrations/oauth-state";
import { origineDellaPiattaforma } from "@/server/integrations/sync";
import { origineDa } from "@/lib/origine";

/**
 * **Il ritorno dal fornitore dopo l'accesso.**
 *
 * Qui arriva il browser del ristoratore con `?code=…&state=…`. Prima di
 * scambiare il codice si controlla, nell'ordine:
 *
 * 1. che lo `state` sia nostro, recente e chiesto **da questo browser**
 *    (firma, scadenza, nonce nel cookie) — `oauth-state.ts`;
 * 2. che chi torna sia **la stessa persona**, dentro **lo stesso locale**, e
 *    abbia ancora il permesso di installare;
 * 3. che l'installazione indicata sia quella di questo locale
 *    (`completaOAuth`).
 *
 * Qualunque cosa vada storta, si torna alla pagina dell'integrazione con un
 * codice d'errore leggibile nell'indirizzo — mai il messaggio del fornitore,
 * mai il codice di autorizzazione.
 */

export const dynamic = "force-dynamic";

/**
 * Il ritorno alla pagina dell'integrazione, **sull'indirizzo da cui è
 * arrivata la richiesta** (`origineDa`). Non su `origineDellaPiattaforma`:
 * quella serve al fornitore — deve essere identica all'indirizzo registrato —
 * mentre il browser va rimandato dove sta, che può essere un altro dominio
 * dello stesso prodotto.
 */
function torna(richiesta: string, slug: string, esito: string) {
  const r = NextResponse.redirect(`${richiesta}/settings/integrations/${slug}?installa=1&esito=${esito}`, 303);
  r.cookies.set(COOKIE_NONCE, "", { path: "/api/integrations/oauth", maxAge: 0 });
  return r;
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const origine = origineDellaPiattaforma(headers());
  const qui = origineDa(headers());
  const url = new URL(req.url);
  const slug = params.slug;

  /* Il ristoratore ha detto no dalla pagina del fornitore, o il fornitore
     ha rifiutato: non è un guasto, è una risposta. */
  if (url.searchParams.get("error")) return torna(qui, slug, "rifiutato");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return torna(qui, slug, "incompleto");

  const verifica = verificaState(state, cookies().get(COOKIE_NONCE)?.value);
  if (!verifica.ok) {
    logAttenzione("integrazione.oauth_state_rifiutato", { slug, motivo: verifica.motivo });
    return torna(qui, slug, verifica.motivo === "scaduto" ? "scaduto" : "non_valido");
  }
  const s = verifica.contenuto;

  const ctx = await requireVenueApi("integration:install");
  if (!ctx.ok) return torna(qui, slug, "sessione");
  if (s.slug !== slug || s.userId !== ctx.userId || s.venueId !== ctx.venueId) {
    /* Lo `state` è valido ma parla di un altro locale o di un'altra persona:
       per esempio il locale attivo è cambiato in un'altra scheda. Non si
       scambia il codice — i token finirebbero nel posto sbagliato. */
    logAttenzione("integrazione.oauth_contesto_diverso", { slug });
    return torna(qui, slug, "contesto");
  }

  try {
    await completaOAuth(
      { venueId: ctx.venueId, orgId: ctx.orgId, userId: ctx.userId, audit: auditActor(ctx, req) },
      slug,
      { code, origine, installationId: s.installationId },
    );
  } catch {
    return torna(qui, slug, "scambio");
  }
  return torna(qui, slug, "collegato");
}
