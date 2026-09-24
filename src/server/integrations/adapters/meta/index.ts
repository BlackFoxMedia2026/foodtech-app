import type { ClientFornitore, RichiestaFornitore } from "../http";
import type { ContestoAdattatore, CredenzialiNuove, IntegrationAdapter } from "../tipi";
import type { SedeEsterna } from "../../dominio";
import { ErroreIntegrazione, normalizzaErrore } from "../../errori";
import { appMeta, CODICI_META, DIALOGO_OAUTH, GRAPH, SCOPE_FACEBOOK, SCOPE_INSTAGRAM } from "./config";

/**
 * **Facebook, Instagram e WhatsApp Business: il collegamento.**
 *
 * Tre adattatori sulla stessa Graph API, e tutti e tre fanno una cosa sola,
 * ma vera: collegano l'account del ristorante, lo **verificano con una
 * chiamata a Meta** e fanno scegliere la pagina, il profilo o il numero da
 * associare al locale. Nient'altro. Pubblicare, leggere le recensioni,
 * mandare messaggi WhatsApp: l'API lo permette (vedi la matrice delle
 * risorse nel catalogo) ma qui non c'è ancora il codice, e il catalogo non
 * lo dichiara.
 *
 * ## Due modi di entrare
 *
 * - **Facebook e Instagram**: Facebook Login for Business, con l'app Meta di
 *   Foodtech (`META_APP_ID`, `META_APP_SECRET`). Il token utente di breve
 *   durata si scambia subito con quello di lunga durata (circa 60 giorni):
 *   Meta non offre un token di rinnovo, e alla scadenza il ristoratore deve
 *   riaccedere. Lo stato «Credenziali scadute» nasce da qui, e non è un
 *   difetto: è come funziona Meta.
 * - **WhatsApp Business**: il token di un utente di sistema del Business
 *   Manager del ristorante, con l'ID dell'account WhatsApp Business (WABA).
 *   Non serve l'app di Foodtech. È il modo documentato per un'integrazione
 *   server a server; la registrazione guidata (Embedded Signup) richiede che
 *   Foodtech diventi Tech Provider presso Meta.
 *
 * Il token viaggia nell'intestazione `Authorization`, mai nell'indirizzo:
 * i registri scrivono l'indirizzo, e un token in un indirizzo è un token in
 * un registro.
 */

type Json = Record<string, unknown>;

export const VERSIONE = "0.1.0";

const testo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Meta risponde 400 anche a un token scaduto: il codice vero sta nel corpo
 * (`error.code`), che `erroreDaHttp` mette in `codiceFornitore`.
 */
export function erroreMeta(err: unknown): ErroreIntegrazione {
  const e = normalizzaErrore(err);
  const codiceMeta = /^\d+$/.test(e.dettaglio.codiceFornitore ?? "") ? Number(e.dettaglio.codiceFornitore) : null;
  if (codiceMeta === null) return e;
  const codice = CODICI_META.tokenScaduto.has(codiceMeta)
    ? "AUTH_EXPIRED"
    : CODICI_META.permesso.has(codiceMeta)
      ? "PERMISSION_DENIED"
      : CODICI_META.limiti.has(codiceMeta)
        ? "RATE_LIMITED"
        : codiceMeta === 100 && e.codice === "VALIDATION"
          ? "INVALID_CONFIGURATION"
          : e.codice;
  if (codice === e.codice) return e;
  return new ErroreIntegrazione(codice, e.message, { ...e.dettaglio, codiceFornitore: `meta:${codiceMeta}` }, e.correlationId);
}

async function graph<T = Json>(http: ClientFornitore, r: RichiestaFornitore, token?: string): Promise<T> {
  try {
    return await http.richiesta<T>({
      ...r,
      intestazioni: { ...(r.intestazioni ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (err) {
    throw erroreMeta(err);
  }
}

function appObbligatoria() {
  const a = appMeta();
  if (!a) throw new ErroreIntegrazione("PLATFORM_NOT_CONFIGURED", "Mancano META_APP_ID e META_APP_SECRET");
  return a;
}

/* -------------------------------------------------------------------------- */
/*  Facebook Login for Business (Facebook e Instagram)                        */
/* -------------------------------------------------------------------------- */

function urlAutorizzazione(scope: readonly string[], state: string, redirectUri: string) {
  const u = new URL(DIALOGO_OAUTH);
  u.searchParams.set("client_id", appObbligatoria().id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", scope.join(","));
  return { url: u.toString() };
}

/**
 * Dal codice al token di lunga durata, in due chiamate documentate:
 * `oauth/access_token` con il codice, poi `grant_type=fb_exchange_token`.
 * Le due chiamate portano il segreto dell'app nei parametri, come vuole
 * Meta: i registri scrivono l'indirizzo senza la query.
 */
export async function tokenLungo(http: ClientFornitore, code: string, redirectUri: string, adesso = Date.now()): Promise<CredenzialiNuove> {
  const app = appObbligatoria();
  const breve = new URL(`${GRAPH}/oauth/access_token`);
  breve.searchParams.set("client_id", app.id);
  breve.searchParams.set("client_secret", app.segreto);
  breve.searchParams.set("redirect_uri", redirectUri);
  breve.searchParams.set("code", code);
  const r1 = await graph(http, { url: breve.toString() });
  const tokenBreve = testo(r1.access_token);
  if (!tokenBreve) throw new ErroreIntegrazione("AUTH_INVALID", "Meta non ha restituito un token");

  const lungo = new URL(`${GRAPH}/oauth/access_token`);
  lungo.searchParams.set("grant_type", "fb_exchange_token");
  lungo.searchParams.set("client_id", app.id);
  lungo.searchParams.set("client_secret", app.segreto);
  lungo.searchParams.set("fb_exchange_token", tokenBreve);
  const r2 = await graph(http, { url: lungo.toString() });
  const token = testo(r2.access_token) ?? tokenBreve;
  const scade = typeof r2.expires_in === "number" ? r2.expires_in : typeof r1.expires_in === "number" ? r1.expires_in : null;

  // I permessi concessi davvero: il ristoratore può toglierne alcuni nella finestra di Meta.
  const permessi = await graph<{ data?: { permission?: string; status?: string }[] }>(http, { url: `${GRAPH}/me/permissions` }, token);
  const concessi = (permessi.data ?? []).filter((p) => p.status === "granted" && p.permission).map((p) => p.permission!);

  return {
    kind: "OAUTH2",
    segreti: { accessToken: token },
    scopes: concessi,
    accessTokenExpiresAt: scade ? new Date(adesso + scade * 1000) : null,
    refreshTokenExpiresAt: null,
  };
}

/** Meta mette il token nell'indirizzo della pagina successiva: lo si toglie, viaggia già nell'intestazione. */
export function senzaToken(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("access_token");
  return u.toString();
}

type PaginaMeta = { id?: string; name?: string; tasks?: string[]; instagram_business_account?: { id?: string; username?: string; name?: string } };

async function pagine(ctx: ContestoAdattatore, campi: string): Promise<PaginaMeta[]> {
  const out: PaginaMeta[] = [];
  let url: string | null = `${GRAPH}/me/accounts?fields=${encodeURIComponent(campi)}&limit=100`;
  // Al massimo cinque pagine di risultati: 500 pagine Facebook bastano a qualunque gruppo.
  for (let giro = 0; url && giro < 5; giro++) {
    const r: { data?: PaginaMeta[]; paging?: { next?: string } } = await graph(ctx.http, { url });
    out.push(...(r.data ?? []));
    url = r.paging?.next && r.paging.next.startsWith(GRAPH) ? senzaToken(r.paging.next) : null;
  }
  return out;
}

async function chiDiMe(ctx: ContestoAdattatore) {
  const me = await graph<{ id?: string; name?: string }>(ctx.http, { url: `${GRAPH}/me?fields=id,name` });
  return me.id ? { externalId: me.id, nome: me.name ?? "Account Meta" } : null;
}

function sceltaDi(ctx: ContestoAdattatore, chiave: string) {
  return (ctx.installazione.configuration[chiave] as string | undefined) ?? null;
}

const oauthMeta = (scope: readonly string[]) => ({
  iniziaAutorizzazione({ state, redirectUri }: { state: string; redirectUri: string }) {
    return urlAutorizzazione(scope, state, redirectUri);
  },
  completaAutorizzazione({ code, redirectUri, http }: { code: string; redirectUri: string; http: ClientFornitore }) {
    return tokenLungo(http, code, redirectUri);
  },
});

export const facebook: IntegrationAdapter = {
  slug: "facebook",
  versione: VERSIONE,
  ...oauthMeta(SCOPE_FACEBOOK),

  /** `GET /me/accounts`: le pagine che l'account gestisce. È la verifica. */
  async provaConnessione(ctx) {
    const [account, elenco] = await Promise.all([chiDiMe(ctx), pagine(ctx, "id,name,tasks")]);
    const sedi: SedeEsterna[] = elenco.filter((p) => p.id).map((p) => ({ externalId: p.id!, nome: p.name ?? p.id!, account }));
    const avvisi: string[] = [];
    if (sedi.length === 0) avvisi.push("L'account non gestisce nessuna pagina Facebook, o non ne ha concessa nessuna a Foodtech.");
    const scelta = sceltaDi(ctx, "pageId");
    if (scelta && !sedi.some((s) => s.externalId === scelta)) {
      throw new ErroreIntegrazione("INVALID_CONFIGURATION", `La pagina ${scelta} non è più accessibile con questo account`);
    }
    return { account, sedi, avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const elenco = await pagine(ctx, "id,name");
    return { locations: elenco.filter((p) => p.id).map((p) => ({ value: p.id!, label: p.name ?? p.id! })) };
  },
};

export const instagram: IntegrationAdapter = {
  slug: "instagram",
  versione: VERSIONE,
  ...oauthMeta(SCOPE_INSTAGRAM),

  /**
   * I profili Instagram professionali collegati alle pagine dell'account
   * (`instagram_business_account`). Un profilo senza pagina collegata con
   * questo accesso non si vede: lo si dice.
   */
  async provaConnessione(ctx) {
    const [account, elenco] = await Promise.all([chiDiMe(ctx), pagine(ctx, "id,name,instagram_business_account{id,username,name}")]);
    const sedi: SedeEsterna[] = elenco
      .filter((p) => p.instagram_business_account?.id)
      .map((p) => ({
        externalId: p.instagram_business_account!.id!,
        nome: p.instagram_business_account!.username ? `@${p.instagram_business_account!.username}` : p.instagram_business_account!.name ?? p.name ?? "Profilo Instagram",
        account,
      }));
    const avvisi: string[] = [];
    if (sedi.length === 0) {
      avvisi.push("Nessun profilo Instagram professionale collegato alle pagine di questo account.");
    }
    const scelta = sceltaDi(ctx, "igUserId");
    if (scelta) {
      // La verifica del profilo scelto: la chiamata fallisce se non è più accessibile.
      await graph(ctx.http, { url: `${GRAPH}/${encodeURIComponent(scelta)}?fields=id,username` });
    }
    return { account, sedi, avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const elenco = await pagine(ctx, "id,name,instagram_business_account{id,username}");
    return {
      locations: elenco
        .filter((p) => p.instagram_business_account?.id)
        .map((p) => ({
          value: p.instagram_business_account!.id!,
          label: p.instagram_business_account!.username ? `@${p.instagram_business_account!.username} · ${p.name ?? ""}`.trim() : p.name ?? "",
        })),
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  WhatsApp Business (Cloud API)                                             */
/* -------------------------------------------------------------------------- */

type NumeroWhatsApp = { id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string };

function nomeNumero(n: NumeroWhatsApp) {
  return [n.verified_name, n.display_phone_number].filter(Boolean).join(" · ") || n.id || "Numero WhatsApp";
}

async function numeri(http: ClientFornitore, waba: string, token?: string): Promise<NumeroWhatsApp[]> {
  const r = await graph<{ data?: NumeroWhatsApp[] }>(
    http,
    { url: `${GRAPH}/${encodeURIComponent(waba)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status` },
    token,
  );
  return r.data ?? [];
}

/** L'ID di un account WhatsApp Business è un numero: niente altro va in un indirizzo della Graph API. */
function idWaba(v: string | undefined) {
  const s = v?.trim() ?? "";
  if (!/^\d{5,25}$/.test(s)) throw new ErroreIntegrazione("VALIDATION", "L'ID dell'account WhatsApp Business deve essere numerico");
  return s;
}

export const whatsappBusiness: IntegrationAdapter = {
  slug: "whatsapp-business",
  versione: VERSIONE,

  /**
   * Il token e l'account si verificano **prima** di salvarli: `GET
   * /{waba-id}` con il token. Un token che non apre quell'account non entra.
   */
  async connetti({ campi, http }) {
    const token = campi.tokenSistema?.trim();
    if (!token) throw new ErroreIntegrazione("VALIDATION", "Manca il token di accesso");
    const waba = idWaba(campi.wabaId);
    await graph(http, { url: `${GRAPH}/${waba}?fields=id,name` }, token);
    return {
      kind: "TOKEN",
      segreti: { accessToken: token, wabaId: waba },
      scopes: [],
      // Il token di un utente di sistema può non scadere; se scade, Meta risponde 190 e si ricollega.
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    };
  },

  async provaConnessione(ctx) {
    const waba = idWaba(ctx.segreti.wabaId);
    const conto = await graph<{ id?: string; name?: string }>(ctx.http, { url: `${GRAPH}/${waba}?fields=id,name` });
    const account = { externalId: waba, nome: conto.name ?? "Account WhatsApp Business" };
    const elenco = await numeri(ctx.http, waba);
    const sedi: SedeEsterna[] = elenco.filter((n) => n.id).map((n) => ({ externalId: n.id!, nome: nomeNumero(n), account }));
    const avvisi: string[] = [];
    if (sedi.length === 0) avvisi.push("L'account WhatsApp Business non ha numeri registrati.");
    const scelta = sceltaDi(ctx, "phoneNumberId");
    if (scelta) {
      const n = await graph<NumeroWhatsApp>(ctx.http, {
        url: `${GRAPH}/${encodeURIComponent(scelta)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
      });
      if (n.quality_rating === "RED") avvisi.push("Meta segnala una qualità bassa per questo numero (quality_rating RED).");
      if (n.code_verification_status && n.code_verification_status !== "VERIFIED") {
        avvisi.push(`Il numero non risulta verificato presso Meta (${n.code_verification_status}).`);
      }
    }
    return { account, sedi, avvisi };
  },

  async opzioniConfigurazione(ctx) {
    const elenco = await numeri(ctx.http, idWaba(ctx.segreti.wabaId));
    return { locations: elenco.filter((n) => n.id).map((n) => ({ value: n.id!, label: nomeNumero(n) })) };
  },
};
