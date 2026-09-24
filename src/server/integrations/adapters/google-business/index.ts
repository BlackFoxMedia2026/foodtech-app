import type { ClientFornitore } from "../http";
import type { ContestoAdattatore, CredenzialiNuove, IntegrationAdapter } from "../tipi";
import type { SedeEsterna } from "../../dominio";
import { ErroreIntegrazione } from "../../errori";

/**
 * **Google Business Profile: il collegamento.**
 *
 * Letto nella documentazione ufficiale il 24 settembre 2026:
 *
 * - accesso e prerequisiti: https://developers.google.com/my-business/content/prereqs
 * - Account Management API: `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts`
 * - Business Information API: `GET https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations`
 * - OAuth 2.0 per server web: https://developers.google.com/identity/protocols/oauth2/web-server
 *
 * Fa una cosa sola, vera: collega l'account Google del ristorante, lo
 * verifica elencando i suoi account e le sue schede, e fa scegliere la
 * scheda del locale. Leggere e rispondere alle recensioni, pubblicare
 * aggiornamenti: l'API lo permette (v4 `reviews`, `localPosts`) ma il codice
 * non c'è, e il catalogo non lo dichiara.
 *
 * ## Il cancello di Google
 *
 * Le API di Business Profile non si aprono con un clic: il progetto Google
 * Cloud di Foodtech deve chiedere l'accesso con il modulo «Application for
 * Basic API Access». Finché Google non approva, la quota è 0 e ogni chiamata
 * risponde 429: il ristoratore vede «Troppe richieste», e la vista interna
 * spiega perché. Nessuna simulazione copre quel buco.
 */

export const VERSIONE = "0.1.0";

export const AUTORIZZAZIONE = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN = "https://oauth2.googleapis.com/token";
export const REVOCA = "https://oauth2.googleapis.com/revoke";
export const ACCOUNT = "https://mybusinessaccountmanagement.googleapis.com/v1";
export const INFORMAZIONI = "https://mybusinessbusinessinformation.googleapis.com/v1";
export const SCOPE = ["https://www.googleapis.com/auth/business.manage"] as const;

type Json = Record<string, unknown>;
const testo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function clientGoogle(env: NodeJS.ProcessEnv = process.env): { id: string; segreto: string } | null {
  const id = env.GOOGLE_BUSINESS_CLIENT_ID?.trim();
  const segreto = env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim();
  return id && segreto ? { id, segreto } : null;
}

function clientObbligatorio() {
  const c = clientGoogle();
  if (!c) throw new ErroreIntegrazione("PLATFORM_NOT_CONFIGURED", "Mancano GOOGLE_BUSINESS_CLIENT_ID e GOOGLE_BUSINESS_CLIENT_SECRET");
  return c;
}

async function scambia(http: ClientFornitore, parametri: Record<string, string>, adesso = Date.now()): Promise<CredenzialiNuove> {
  const c = clientObbligatorio();
  const r = await http.richiesta<Json>({
    metodo: "POST",
    url: TOKEN,
    corpo: new URLSearchParams({ ...parametri, client_id: c.id, client_secret: c.segreto }),
  });
  const accessToken = testo(r.access_token);
  if (!accessToken) throw new ErroreIntegrazione("AUTH_INVALID", "Google non ha restituito un token");
  const scade = typeof r.expires_in === "number" ? r.expires_in : null;
  return {
    kind: "OAUTH2",
    segreti: {
      accessToken,
      // Google manda il token di rinnovo solo al primo consenso (per questo `prompt=consent`).
      ...(testo(r.refresh_token) ? { refreshToken: testo(r.refresh_token)! } : parametri.refresh_token ? { refreshToken: parametri.refresh_token } : {}),
    },
    scopes: (testo(r.scope) ?? "").split(/\s+/).filter(Boolean),
    accessTokenExpiresAt: scade ? new Date(adesso + scade * 1000) : null,
    refreshTokenExpiresAt: null,
  };
}

type AccountGoogle = { name?: string; accountName?: string; type?: string };
type SchedaGoogle = { name?: string; title?: string; storefrontAddress?: { locality?: string; addressLines?: string[] } };

async function account(ctx: ContestoAdattatore): Promise<AccountGoogle[]> {
  const r = await ctx.http.richiesta<{ accounts?: AccountGoogle[] }>({ url: `${ACCOUNT}/accounts?pageSize=20` });
  return r.accounts ?? [];
}

async function schede(ctx: ContestoAdattatore, acc: AccountGoogle): Promise<SchedaGoogle[]> {
  if (!acc.name || !/^accounts\/\d+$/.test(acc.name)) return [];
  const r = await ctx.http.richiesta<{ locations?: SchedaGoogle[] }>({
    url: `${INFORMAZIONI}/${acc.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`,
  });
  return r.locations ?? [];
}

/** «accounts/1/locations/2»: la scheda con il suo account, perché le API delle recensioni li vogliono entrambi. */
export function valoreScheda(acc: AccountGoogle, s: SchedaGoogle): string | null {
  const id = s.name?.match(/^locations\/(\d+)$/)?.[1];
  return acc.name && id ? `${acc.name}/locations/${id}` : null;
}

function etichettaScheda(s: SchedaGoogle) {
  const citta = s.storefrontAddress?.locality;
  return [s.title ?? "Scheda senza nome", citta].filter(Boolean).join(" · ");
}

async function tutteLeSchede(ctx: ContestoAdattatore) {
  const accs = await account(ctx);
  const out: { valore: string; etichetta: string; account: AccountGoogle }[] = [];
  // Un account alla volta: la quota di Google è per minuto, e un gruppo ha pochi account.
  for (const a of accs.slice(0, 10)) {
    for (const s of await schede(ctx, a)) {
      const v = valoreScheda(a, s);
      if (v) out.push({ valore: v, etichetta: etichettaScheda(s), account: a });
    }
  }
  return { accs, out };
}

export const googleBusinessProfile: IntegrationAdapter = {
  slug: "google-business-profile",
  versione: VERSIONE,

  iniziaAutorizzazione({ state, redirectUri }) {
    const c = clientObbligatorio();
    const u = new URL(AUTORIZZAZIONE);
    u.searchParams.set("client_id", c.id);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPE.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("include_granted_scopes", "true");
    u.searchParams.set("state", state);
    return { url: u.toString() };
  },

  completaAutorizzazione({ code, redirectUri, http }) {
    return scambia(http, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  },

  async rinnovaAutenticazione(ctx) {
    const r = ctx.segreti.refreshToken;
    if (!r) throw new ErroreIntegrazione("AUTH_EXPIRED", "Nessun token di rinnovo salvato");
    return scambia(ctx.http, { grant_type: "refresh_token", refresh_token: r });
  },

  /** La revoca presso Google, alla disconnessione. Se non riesce, i token si cancellano comunque. */
  async disconnetti(ctx) {
    const t = ctx.segreti.refreshToken ?? ctx.segreti.accessToken;
    if (!t) return;
    await ctx.http.richiesta({ metodo: "POST", url: REVOCA, corpo: new URLSearchParams({ token: t }) });
  },

  async provaConnessione(ctx) {
    const { accs, out } = await tutteLeSchede(ctx);
    const primo = accs[0];
    const acc = primo?.name ? { externalId: primo.name, nome: primo.accountName ?? primo.name } : null;
    const sedi: SedeEsterna[] = out.map((s) => ({
      externalId: s.valore,
      nome: s.etichetta,
      account: s.account.name ? { externalId: s.account.name, nome: s.account.accountName ?? s.account.name } : null,
    }));
    const avvisi: string[] = [];
    if (accs.length === 0) avvisi.push("L'account Google non gestisce nessun profilo dell'attività.");
    else if (sedi.length === 0) avvisi.push("Nessuna scheda trovata negli account di questo utente Google.");
    const scelta = (ctx.installazione.configuration.locationName as string | undefined) ?? null;
    if (scelta && !sedi.some((s) => s.externalId === scelta)) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", `La scheda ${scelta} non è più gestita da questo account`);
    }
    return { account: acc, sedi, avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const { out } = await tutteLeSchede(ctx);
    return { locations: out.map((s) => ({ value: s.valore, label: s.etichetta })) };
  },
};
