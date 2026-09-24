import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creaClientFornitore } from "@/server/integrations/adapters/http";
import { facebook, instagram, senzaToken, whatsappBusiness, erroreMeta } from "@/server/integrations/adapters/meta";
import { GRAPH } from "@/server/integrations/adapters/meta/config";
import { googleBusinessProfile, valoreScheda } from "@/server/integrations/adapters/google-business";
import type { ContestoAdattatore } from "@/server/integrations/adapters/tipi";
import { ErroreIntegrazione } from "@/server/integrations/errori";

/**
 * **Facebook, Instagram, WhatsApp Business e Google Business Profile: gli
 * adattatori contro fornitori finti.**
 *
 * Le risposte finte hanno la forma della documentazione ufficiale (Graph API
 * v26.0, Business Profile APIs v1). Nessuna chiamata va in rete: queste
 * prove dicono che l'adattatore chiede le cose giuste nel modo giusto, **non**
 * che il fornitore vero risponda così — quello lo dice solo una prova con
 * credenziali di test autorizzate, ed è per questo che le voci restano
 * IN_DEVELOPMENT.
 */

type Chiamata = { metodo: string; url: string; auth: string | null; corpo: string | null };
let chiamate: Chiamata[] = [];
let rispondi: (c: Chiamata) => Response;

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const fetchFinto = (async (url: string, init: RequestInit = {}) => {
  const h = (init.headers ?? {}) as Record<string, string>;
  const c = { metodo: init.method ?? "GET", url, auth: h.Authorization ?? null, corpo: init.body ? String(init.body) : null };
  chiamate.push(c);
  return rispondi(c);
}) as unknown as typeof fetch;

function http(token?: string) {
  return creaClientFornitore({
    slug: "prova",
    correlationId: "int_prova",
    fetchImpl: fetchFinto,
    intestazioni: () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
  });
}

function ctx(segreti: Record<string, string>, configuration: Record<string, unknown> = {}): ContestoAdattatore {
  return {
    installazione: { id: "inst", venueId: "v", configuration, enabledCapabilities: [], externalAccountId: null, externalLocationId: null, webhookKey: "k" },
    segreti,
    http: http(segreti.accessToken),
    correlationId: "int_prova",
    origine: "https://app.foodtech.test",
  };
}

const env = { ...process.env };
beforeEach(() => {
  chiamate = [];
  process.env.META_APP_ID = "app-123";
  process.env.META_APP_SECRET = "segreto-app";
  process.env.GOOGLE_BUSINESS_CLIENT_ID = "google-id";
  process.env.GOOGLE_BUSINESS_CLIENT_SECRET = "google-segreto";
});
afterEach(() => {
  for (const k of ["META_APP_ID", "META_APP_SECRET", "GOOGLE_BUSINESS_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_SECRET"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

const errore = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ErroreIntegrazione;
  }
  throw new Error("doveva fallire");
};

/* -------------------------------------------------------------------------- */

describe("WhatsApp Business", () => {
  const WABA = "102290129340398";
  const NUMERO = "106540352242922";

  beforeEach(() => {
    rispondi = (c) => {
      const u = new URL(c.url);
      if (c.auth !== "Bearer tok-sistema") return json(400, { error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } });
      if (u.pathname.endsWith(`/${WABA}`)) return json(200, { id: WABA, name: "Trattoria Da Mario" });
      if (u.pathname.endsWith(`/${WABA}/phone_numbers`)) {
        return json(200, { data: [{ id: NUMERO, display_phone_number: "+39 011 555 0101", verified_name: "Da Mario", quality_rating: "GREEN", code_verification_status: "VERIFIED" }] });
      }
      if (u.pathname.endsWith(`/${NUMERO}`)) {
        return json(200, { id: NUMERO, display_phone_number: "+39 011 555 0101", verified_name: "Da Mario", quality_rating: "RED", code_verification_status: "VERIFIED" });
      }
      return json(404, { error: { code: 803 } });
    };
  });

  it("verifica token e account con Meta prima di salvarli, e il token viaggia solo nell'intestazione", async () => {
    const c = await whatsappBusiness.connetti!({ campi: { tokenSistema: " tok-sistema ", wabaId: WABA }, http: http() });
    expect(c).toMatchObject({ kind: "TOKEN", segreti: { accessToken: "tok-sistema", wabaId: WABA } });
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]!.url).toBe(`${GRAPH}/${WABA}?fields=id,name`);
    expect(chiamate[0]!.auth).toBe("Bearer tok-sistema");
    for (const x of chiamate) expect(x.url).not.toContain("tok-sistema");
  });

  it("un token sbagliato: Meta risponde 400 con codice 190, e diventa «credenziali scadute», non «dati non validi»", async () => {
    const e = await errore(whatsappBusiness.connetti!({ campi: { tokenSistema: "sbagliato", wabaId: WABA }, http: http() }));
    expect(e.codice).toBe("AUTH_EXPIRED");
    expect(e.dettaglio.codiceFornitore).toBe("meta:190");
  });

  it("un ID d'account non numerico non arriva mai in un indirizzo", async () => {
    const e = await errore(whatsappBusiness.connetti!({ campi: { tokenSistema: "tok-sistema", wabaId: "../me" }, http: http() }));
    expect(e.codice).toBe("VALIDATION");
    expect(chiamate).toHaveLength(0);
  });

  it("la prova elenca i numeri e dice la qualità bassa del numero scelto", async () => {
    const e = await whatsappBusiness.provaConnessione(ctx({ accessToken: "tok-sistema", wabaId: WABA }, { phoneNumberId: NUMERO }));
    expect(e.account).toEqual({ externalId: WABA, nome: "Trattoria Da Mario" });
    expect(e.sedi).toEqual([{ externalId: NUMERO, nome: "Da Mario · +39 011 555 0101", account: e.account }]);
    expect(e.avvisi.join(" ")).toMatch(/RED/);
    const o = await whatsappBusiness.opzioniConfigurazione!(ctx({ accessToken: "tok-sistema", wabaId: WABA }));
    expect(o.locations).toEqual([{ value: NUMERO, label: "Da Mario · +39 011 555 0101" }]);
  });
});

describe("Facebook e Instagram (Facebook Login for Business)", () => {
  beforeEach(() => {
    rispondi = (c) => {
      const u = new URL(c.url);
      if (u.pathname.endsWith("/oauth/access_token")) {
        if (u.searchParams.get("grant_type") === "fb_exchange_token") return json(200, { access_token: "tok-lungo", token_type: "bearer", expires_in: 5_184_000 });
        if (u.searchParams.get("code") !== "codice-ok") return json(400, { error: { message: "Invalid verification code format.", code: 100 } });
        return json(200, { access_token: "tok-breve", token_type: "bearer", expires_in: 3600 });
      }
      if (c.auth === "Bearer tok-scaduto") {
        return json(400, { error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190, error_subcode: 463 } });
      }
      if (u.pathname.endsWith("/me/permissions")) {
        return json(200, { data: [{ permission: "pages_show_list", status: "granted" }, { permission: "pages_read_engagement", status: "declined" }] });
      }
      if (u.pathname.endsWith("/me")) return json(200, { id: "u-1", name: "Mario Rossi" });
      if (u.pathname.endsWith("/me/accounts")) {
        if (u.searchParams.get("after")) return json(200, { data: [{ id: "p-2", name: "Da Mario Torino" }] });
        return json(200, {
          data: [{ id: "p-1", name: "Da Mario", instagram_business_account: { id: "ig-1", username: "damario" } }],
          paging: { next: `${GRAPH}/me/accounts?fields=id,name&limit=100&access_token=tok-lungo&after=XYZ` },
        });
      }
      if (u.pathname.endsWith("/ig-1")) return json(200, { id: "ig-1", username: "damario" });
      return json(404, { error: { code: 803 } });
    };
  });

  it("senza l'app Meta di Foodtech non si parte: «piattaforma non configurata»", () => {
    delete process.env.META_APP_ID;
    expect(() => facebook.iniziaAutorizzazione!({ state: "s", redirectUri: "https://x/cb" })).toThrow(ErroreIntegrazione);
    try {
      facebook.iniziaAutorizzazione!({ state: "s", redirectUri: "https://x/cb" });
    } catch (e) {
      expect((e as ErroreIntegrazione).codice).toBe("PLATFORM_NOT_CONFIGURED");
    }
  });

  it("l'indirizzo di autorizzazione chiede solo i permessi minimi, con lo state", () => {
    const u = new URL(facebook.iniziaAutorizzazione!({ state: "stato-firmato", redirectUri: "https://app/cb/facebook" }).url);
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(u.searchParams.get("scope")).toBe("pages_show_list,pages_read_engagement");
    expect(u.searchParams.get("state")).toBe("stato-firmato");
    expect(u.searchParams.get("client_id")).toBe("app-123");
    expect(u.searchParams.has("client_secret")).toBe(false);
    const ig = new URL(instagram.iniziaAutorizzazione!({ state: "s", redirectUri: "https://app/cb/instagram" }).url);
    expect(ig.searchParams.get("scope")).toBe("instagram_basic,pages_show_list,pages_read_engagement");
  });

  it("codice → token breve → token lungo; i permessi salvati sono quelli concessi davvero, con la scadenza", async () => {
    const adesso = Date.now();
    const c = await facebook.completaAutorizzazione!({ code: "codice-ok", redirectUri: "https://app/cb/facebook", http: http() });
    expect(c.segreti).toEqual({ accessToken: "tok-lungo" });
    expect(c.scopes).toEqual(["pages_show_list"]);
    expect(c.accessTokenExpiresAt!.getTime()).toBeGreaterThan(adesso + 59 * 86_400_000);
    expect(c.refreshTokenExpiresAt).toBeNull();
    // I permessi si leggono con il token nell'intestazione, non nell'indirizzo.
    const p = chiamate.find((x) => x.url.includes("/me/permissions"))!;
    expect(p.auth).toBe("Bearer tok-lungo");
    expect(p.url).not.toContain("tok-lungo");
  });

  it("un codice non valido non diventa un collegamento", async () => {
    const e = await errore(facebook.completaAutorizzazione!({ code: "falso", redirectUri: "https://app/cb", http: http() }));
    expect(e.codice).toBe("INVALID_CONFIGURATION");
  });

  it("la prova elenca le pagine, segue la paginazione togliendo il token dall'indirizzo", async () => {
    const e = await facebook.provaConnessione(ctx({ accessToken: "tok-lungo" }));
    expect(e.account).toEqual({ externalId: "u-1", nome: "Mario Rossi" });
    expect(e.sedi.map((s) => s.externalId)).toEqual(["p-1", "p-2"]);
    const seconda = chiamate.find((x) => x.url.includes("after=XYZ"))!;
    expect(seconda.url).not.toContain("access_token");
    expect(senzaToken(`${GRAPH}/x?a=1&access_token=t`)).toBe(`${GRAPH}/x?a=1`);
  });

  it("una pagina che l'account non gestisce più: configurazione da rivedere", async () => {
    const e = await errore(facebook.provaConnessione(ctx({ accessToken: "tok-lungo" }, { pageId: "p-99" })));
    expect(e.codice).toBe("INVALID_CONFIGURATION");
  });

  it("dopo 60 giorni il token è scaduto: la prova dice «credenziali scadute»", async () => {
    const e = await errore(facebook.provaConnessione(ctx({ accessToken: "tok-scaduto" })));
    expect(e.codice).toBe("AUTH_EXPIRED");
  });

  it("Instagram: i profili professionali collegati alle pagine, e la verifica del profilo scelto", async () => {
    const e = await instagram.provaConnessione(ctx({ accessToken: "tok-lungo" }, { igUserId: "ig-1" }));
    expect(e.sedi).toEqual([{ externalId: "ig-1", nome: "@damario", account: { externalId: "u-1", nome: "Mario Rossi" } }]);
    expect(chiamate.some((x) => x.url.includes("/ig-1?fields=id,username"))).toBe(true);
  });

  it("i codici di Meta: permesso e limiti", () => {
    const da = (code: number, status = 400) =>
      erroreMeta(new ErroreIntegrazione("VALIDATION", "x", { status, codiceFornitore: String(code) })).codice;
    expect(da(10, 403)).toBe("PERMISSION_DENIED");
    expect(da(200, 403)).toBe("PERMISSION_DENIED");
    expect(da(4)).toBe("RATE_LIMITED");
    expect(da(80004)).toBe("RATE_LIMITED");
    expect(da(190)).toBe("AUTH_EXPIRED");
  });
});

describe("Google Business Profile", () => {
  beforeEach(() => {
    rispondi = (c) => {
      const u = new URL(c.url);
      if (c.url === "https://oauth2.googleapis.com/token") {
        const p = new URLSearchParams(c.corpo ?? "");
        if (p.get("grant_type") === "refresh_token") return json(200, { access_token: "g-nuovo", expires_in: 3599, scope: "https://www.googleapis.com/auth/business.manage" });
        if (p.get("code") !== "codice-ok") return json(400, { error: "invalid_grant" });
        return json(200, { access_token: "g-acc", refresh_token: "g-rin", expires_in: 3599, scope: "https://www.googleapis.com/auth/business.manage" });
      }
      if (c.url === "https://oauth2.googleapis.com/revoke") return json(200, {});
      if (c.auth === "Bearer g-quota0") return json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded … requests per minute" } });
      if (c.auth === "Bearer g-nopermesso") return json(403, { error: { code: 403, status: "PERMISSION_DENIED" } });
      if (u.hostname === "mybusinessaccountmanagement.googleapis.com" && u.pathname === "/v1/accounts") {
        return json(200, { accounts: [{ name: "accounts/111", accountName: "Gruppo Da Mario", type: "LOCATION_GROUP" }] });
      }
      if (u.hostname === "mybusinessbusinessinformation.googleapis.com" && u.pathname === "/v1/accounts/111/locations") {
        expect(u.searchParams.get("readMask")).toBe("name,title,storefrontAddress");
        return json(200, { locations: [{ name: "locations/222", title: "Da Mario", storefrontAddress: { locality: "Torino" } }] });
      }
      return json(404, { error: { code: 404 } });
    };
  });

  it("l'autorizzazione chiede l'accesso offline con consenso, per avere il token di rinnovo", () => {
    const u = new URL(googleBusinessProfile.iniziaAutorizzazione!({ state: "s", redirectUri: "https://app/cb" }).url);
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/business.manage");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });

  it("codice → token con rinnovo; il rinnovo tiene il token di rinnovo di prima", async () => {
    const c = await googleBusinessProfile.completaAutorizzazione!({ code: "codice-ok", redirectUri: "https://app/cb", http: http() });
    expect(c.segreti).toEqual({ accessToken: "g-acc", refreshToken: "g-rin" });
    const r = await googleBusinessProfile.rinnovaAutenticazione!(ctx({ accessToken: "g-acc", refreshToken: "g-rin" }));
    expect(r.segreti).toEqual({ accessToken: "g-nuovo", refreshToken: "g-rin" });
    // Il segreto del client va nel corpo della richiesta, mai nell'indirizzo.
    for (const x of chiamate) expect(x.url).not.toContain("google-segreto");
  });

  it("un codice rifiutato è un accesso da rifare", async () => {
    const e = await errore(googleBusinessProfile.completaAutorizzazione!({ code: "no", redirectUri: "https://app/cb", http: http() }));
    expect(e.codice).toBe("AUTH_EXPIRED");
  });

  it("la prova legge account e schede; la scheda porta con sé il suo account", async () => {
    const e = await googleBusinessProfile.provaConnessione(ctx({ accessToken: "g-acc" }, { locationName: "accounts/111/locations/222" }));
    expect(e.account).toEqual({ externalId: "accounts/111", nome: "Gruppo Da Mario" });
    expect(e.sedi).toEqual([{ externalId: "accounts/111/locations/222", nome: "Da Mario · Torino", account: e.account }]);
    expect(valoreScheda({ name: "accounts/1" }, { name: "locations/../x" })).toBeNull();
  });

  it("senza l'approvazione di Google la quota è 0: «troppe richieste», non un falso successo", async () => {
    const e = await errore(googleBusinessProfile.provaConnessione(ctx({ accessToken: "g-quota0" })));
    expect(e.codice).toBe("RATE_LIMITED");
    const p = await errore(googleBusinessProfile.provaConnessione(ctx({ accessToken: "g-nopermesso" })));
    expect(p.codice).toBe("PERMISSION_DENIED");
  });

  it("disconnettere revoca il token presso Google", async () => {
    await googleBusinessProfile.disconnetti!(ctx({ accessToken: "g-acc", refreshToken: "g-rin" }));
    const r = chiamate.find((x) => x.url === "https://oauth2.googleapis.com/revoke")!;
    expect(new URLSearchParams(r.corpo!).get("token")).toBe("g-rin");
  });
});
