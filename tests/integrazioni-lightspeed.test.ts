import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lightspeedK, endpointIdDi } from "@/server/integrations/adapters/lightspeed-k";
import {
  aliquote,
  corpoOrdineLocale,
  leggiNotifica,
  leggiToken,
  menuDaLightspeed,
  metodiDiPagamento,
  saleETavoli,
  sediDaBusinesses,
} from "@/server/integrations/adapters/lightspeed-k/traduzione";
import { creaClientFornitore } from "@/server/integrations/adapters/http";
import type { ContestoAdattatore } from "@/server/integrations/adapters/tipi";
import { ErroreIntegrazione } from "@/server/integrations/errori";

/**
 * **L'adattatore Lightspeed K-Series, contro le risposte della documentazione.**
 *
 * Nessuna chiamata esce da qui: il `fetch` è finto, e risponde con gli
 * esempi di api-docs.lsk.lightspeed.app. Queste prove dicono che la
 * traduzione e le chiamate seguono la documentazione — **non** che
 * l'integrazione funzioni con Lightspeed. Quello lo dirà solo la prima prova
 * con un account vero, ed è il motivo per cui la voce resta IN_DEVELOPMENT.
 */

type Chiamata = { url: string; metodo: string; intestazioni: Record<string, string>; corpo: string | null };

function fetchFinto(risposte: Record<string, { status?: number; corpo: unknown; intestazioni?: Record<string, string> }>) {
  const chiamate: Chiamata[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const intestazioni = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    chiamate.push({ url, metodo: init.method ?? "GET", intestazioni, corpo: init.body ? String(init.body) : null });
    const chiave = Object.keys(risposte).find((k) => url.includes(k));
    if (!chiave) return new Response("non previsto", { status: 599 });
    const r = risposte[chiave]!;
    const testo = typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo);
    return new Response(testo, {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...(r.intestazioni ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { f, chiamate };
}

function contesto(f: typeof fetch, extra: Partial<ContestoAdattatore["installazione"]> = {}, segreti = {}): ContestoAdattatore {
  return {
    installazione: {
      id: "inst_1",
      venueId: "venue_A",
      configuration: { businessLocationId: "247158188015618" },
      enabledCapabilities: ["locations", "tables", "menu", "tax_rates", "payment_methods", "orders.write"],
      externalAccountId: null,
      externalLocationId: "247158188015618",
      webhookKey: "chiave-webhook-di-prova-123456",
      ...extra,
    },
    segreti: { accessToken: "tok", ambiente: "trial", ...segreti },
    http: creaClientFornitore({ slug: "lightspeed-k", correlationId: "int_test", fetchImpl: f, intestazioni: () => ({ Authorization: "Bearer tok" }) }),
    correlationId: "int_test",
    origine: "https://app.foodtech.test",
  };
}

const BUSINESSES = [
  {
    name: "My Awesome Business",
    id: 45454565682155,
    businessLocations: [
      { id: 247158188015618, name: "Torino Centro" },
      { id: 247158188015619, name: "Milano Brera" },
    ],
  },
];

let env: Record<string, string | undefined>;
beforeEach(() => {
  env = {
    id: process.env.LIGHTSPEED_K_CLIENT_ID,
    s: process.env.LIGHTSPEED_K_CLIENT_SECRET,
    e: process.env.LIGHTSPEED_K_ENVIRONMENT,
  };
  process.env.LIGHTSPEED_K_CLIENT_ID = "client-di-prova";
  process.env.LIGHTSPEED_K_CLIENT_SECRET = "segreto-client";
  delete process.env.LIGHTSPEED_K_ENVIRONMENT;
});
afterEach(() => {
  process.env.LIGHTSPEED_K_CLIENT_ID = env.id;
  process.env.LIGHTSPEED_K_CLIENT_SECRET = env.s;
  process.env.LIGHTSPEED_K_ENVIRONMENT = env.e;
});

describe("traduzione Lightspeed → Foodtech", () => {
  it("sedi: una per business location, con l'account", () => {
    const s = sediDaBusinesses(BUSINESSES);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({
      externalId: "247158188015618",
      nome: "Torino Centro",
      account: { externalId: "45454565682155", nome: "My Awesome Business" },
    });
  });

  it("tavoli: etichetta da reference, poi dal numero; posti da defaultClientCount", () => {
    const { sale, tavoli } = saleETavoli([
      {
        id: 1,
        name: "Sala",
        tables: [
          { id: "t1", number: 12, reference: "B1", active: true, defaultClientCount: 4 },
          { id: "t2", number: 7, active: false },
        ],
      },
    ]);
    expect(sale).toEqual([{ externalId: "1", nome: "Sala" }]);
    expect(tavoli[0]).toMatchObject({ externalId: "t1", etichetta: "B1", posti: 4, attivo: true, salaExternalId: "1" });
    expect(tavoli[1]).toMatchObject({ etichetta: "7", attivo: false, posti: null });
  });

  it("menu: schermate e gruppi diventano categorie, i prodotti hanno lo sku e il prezzo in centesimi", () => {
    const m = menuDaLightspeed("99", {
      menuName: "Carta",
      ikentooMenuId: 99,
      menuEntryGroups: [
        {
          name: "Primi",
          menuEntry: [
            { "@type": "menuItem", productName: "Carbonara", productPrice: 12.5, sku: "PR1", defaultTaxPercentage: 10, taxIncludedInPrice: true },
            { "@type": "group", name: "Paste fresche", menuEntry: [{ "@type": "menuItem", productName: "Tajarin", productPrice: "14.00", sku: "PR2" }] },
            { "@type": "menuItem", productName: "Carbonara (doppione)", productPrice: 12.5, sku: "PR1" },
          ],
        },
      ],
    });
    expect(m.nome).toBe("Carta");
    expect(m.categorie.map((c) => c.nome)).toEqual(["Primi", "Paste fresche"]);
    expect(m.prodotti).toHaveLength(2); // lo sku doppio si legge una volta
    expect(m.prodotti[0]).toMatchObject({ externalId: "PR1", nome: "Carbonara", prezzoCents: 1250, aliquotaPercentuale: 10, ivaInclusa: true });
    expect(m.prodotti[1]).toMatchObject({ externalId: "PR2", prezzoCents: 1400, categoriaExternalId: m.categorie[1]!.externalId });
  });

  it("aliquote: la percentuale solo se il valore è una frazione leggibile", () => {
    const a = aliquote({ taxRateList: [{ code: "IVA10", description: "IVA 10%", rate: 0.1, taxIncluded: true }, { code: "X", rate: 1.1 }] });
    expect(a[0]).toMatchObject({ externalId: "IVA10", percentuale: 10, inclusa: true });
    expect(a[1]).toMatchObject({ externalId: "X", percentuale: null, rateOriginale: 1.1 });
  });

  it("metodi di pagamento da _embedded.paymentMethodList", () => {
    expect(metodiDiPagamento({ _embedded: { paymentMethodList: [{ name: "Contanti", code: "CASH", pmId: 3 }] } })).toEqual([
      { externalId: "3", nome: "Contanti", codice: "CASH" },
    ]);
  });

  it("token: scadenze calcolate, refresh_expires_in 0 vuol dire «nessuna scadenza fissa»", () => {
    const t = leggiToken({ access_token: "a", expires_in: 1500, refresh_token: "r", refresh_expires_in: 0, scope: "orders-api offline_access" }, 0);
    expect(t).toMatchObject({ accessToken: "a", refreshToken: "r", scopes: ["orders-api", "offline_access"], refreshTokenExpiresAt: null });
    expect(t!.accessTokenExpiresAt!.getTime()).toBe(1_500_000);
    expect(leggiToken({})).toBeNull();
  });
});

describe("ordini e notifiche", () => {
  it("il corpo di Create Local Order ha i campi obbligatori, e il riferimento al massimo di 48", () => {
    const c = corpoOrdineLocale(
      { riferimento: "x".repeat(60), tavolo: "12", coperti: 4, cliente: null, righe: [{ codiceProdotto: "PR1", nome: "Carbonara", quantita: 2, prezzoUnitarioCents: 1250, note: null }], nota: "senza pepe" },
      { businessLocationId: "247158188015618", endpointId: "foodtech-x" },
    );
    expect(c).toMatchObject({
      businessLocationId: 247158188015618,
      endpointId: "foodtech-x",
      tableNumber: "12",
      customerInfo: { firstName: "Tavolo 12" },
      items: [{ sku: "PR1", quantity: 2 }],
      orderNote: "senza pepe",
    });
    expect(String(c.thirdPartyReference)).toHaveLength(48);
  });

  it("la stessa notifica ritentata dà la stessa chiave; uno stato nuovo ne dà un'altra", () => {
    const n = { thirdPartyReference: "REF11", businessLocationId: 247158188015618, status: "SUCCESS", ikentooAccountIdentifier: "A1.1", type: "PAYMENT" };
    expect(leggiNotifica(n).chiave).toEqual(leggiNotifica({ ...n }).chiave);
    expect(leggiNotifica(n).chiave).not.toEqual(leggiNotifica({ ...n, status: "FAILURE" }).chiave);
    expect(leggiNotifica(n).evento).toMatchObject({ tipo: "pos.payment.status", riuscito: true, riferimento: "REF11" });
    expect(leggiNotifica({ thirdPartyReference: "R", status: "CLOSED" }).evento).toMatchObject({ tipo: "pos.order.status", stato: "CLOSED" });
    expect(leggiNotifica({ status: "BOH", type: "ALTRO" }).evento.tipo).toBe("sconosciuto");
  });
});

describe("adattatore Lightspeed", () => {
  it("l'indirizzo di autorizzazione è quello di Keycloak, con gli scope minimi", () => {
    const { url } = lightspeedK.iniziaAutorizzazione!({ state: "S", redirectUri: "https://app.foodtech.test/cb" });
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe("https://auth.lsk-demo.app/realms/k-series/protocol/openid-connect/auth");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("client-di-prova");
    expect(u.searchParams.get("scope")).toBe("orders-api financial-api offline_access");
    expect(u.searchParams.get("state")).toBe("S");
  });

  it("in produzione solo se dichiarato", () => {
    process.env.LIGHTSPEED_K_ENVIRONMENT = "production";
    const { url } = lightspeedK.iniziaAutorizzazione!({ state: "S", redirectUri: "https://x/cb" });
    expect(url.startsWith("https://auth.lsk-prod.app/")).toBe(true);
  });

  it("senza il client OAuth della piattaforma non parte, e lo dice", () => {
    delete process.env.LIGHTSPEED_K_CLIENT_ID;
    try {
      lightspeedK.iniziaAutorizzazione!({ state: "S", redirectUri: "https://x/cb" });
      expect.unreachable();
    } catch (e) {
      expect((e as ErroreIntegrazione).codice).toBe("PLATFORM_NOT_CONFIGURED");
    }
  });

  it("lo scambio del codice è un POST form al token endpoint, e salva l'ambiente", async () => {
    const { f, chiamate } = fetchFinto({ "/token": { corpo: { access_token: "A", refresh_token: "R", expires_in: 1500, scope: "orders-api" } } });
    const c = await lightspeedK.completaAutorizzazione!({
      code: "CODICE",
      redirectUri: "https://x/cb",
      http: creaClientFornitore({ slug: "lightspeed-k", correlationId: "c", fetchImpl: f }),
    });
    expect(chiamate[0]!.url).toBe("https://auth.lsk-demo.app/realms/k-series/protocol/openid-connect/token");
    expect(chiamate[0]!.metodo).toBe("POST");
    const form = new URLSearchParams(chiamate[0]!.corpo!);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("CODICE");
    expect(c.segreti).toMatchObject({ accessToken: "A", refreshToken: "R", ambiente: "trial" });
  });

  it("il rinnovo porta avanti i segreti del webhook", async () => {
    const { f } = fetchFinto({ "/token": { corpo: { access_token: "A2", refresh_token: "R2", expires_in: 1500 } } });
    const c = await lightspeedK.rinnovaAutenticazione!(
      contesto(f, {}, { refreshToken: "R1", webhookUsername: "u", webhookPassword: "p" }),
    );
    expect(c.segreti).toMatchObject({ accessToken: "A2", refreshToken: "R2", webhookUsername: "u", webhookPassword: "p" });
  });

  it("un token di rinnovo morto è «ricollega», non «riprova»", async () => {
    const { f } = fetchFinto({ "/token": { status: 400, corpo: { error: "invalid_grant" } } });
    await expect(lightspeedK.rinnovaAutenticazione!(contesto(f, {}, { refreshToken: "R1" }))).rejects.toMatchObject({
      codice: "AUTH_EXPIRED",
    });
  });

  it("la prova di connessione legge i business e controlla la sede scelta", async () => {
    const { f, chiamate } = fetchFinto({ "/o/op/data/businesses": { corpo: BUSINESSES } });
    const esito = await lightspeedK.provaConnessione(contesto(f));
    expect(chiamate[0]!.url).toBe("https://api.trial.lsk.lightspeed.app/o/op/data/businesses");
    expect(chiamate[0]!.intestazioni.Authorization).toBe("Bearer tok");
    expect(esito.account).toEqual({ externalId: "45454565682155", nome: "My Awesome Business" });
    expect(esito.sedi).toHaveLength(2);

    await expect(
      lightspeedK.provaConnessione(contesto(f, { configuration: { businessLocationId: "1" } })),
    ).rejects.toMatchObject({ codice: "INVALID_CONFIGURATION" });
  });

  it("fornitore giù, troppe richieste, accesso scaduto: tre codici diversi", async () => {
    for (const [status, codice] of [
      [503, "PROVIDER_UNAVAILABLE"],
      [429, "RATE_LIMITED"],
      [401, "AUTH_EXPIRED"],
    ] as const) {
      const { f } = fetchFinto({ "/o/op/data/businesses": { status, corpo: {}, intestazioni: { "retry-after": "12" } } });
      const err = (await lightspeedK.provaConnessione(contesto(f)).catch((e) => e)) as ErroreIntegrazione;
      expect(err.codice).toBe(codice);
      if (status === 429) expect(err.dettaglio.riprovaTraSecondi).toBe(12);
    }
  });

  it("la sincronizzazione chiama solo ciò che è acceso", async () => {
    const { f, chiamate } = fetchFinto({
      "/floorplans": { corpo: [{ id: 1, name: "Sala", tables: [{ id: "t1", number: 1 }] }] },
      "/tax-rates": { corpo: { taxRateList: [{ code: "IVA10", rate: 0.1 }] } },
    });
    const r = await lightspeedK.sincronizza!(contesto(f, { enabledCapabilities: ["tables", "tax_rates"] }), "full");
    expect(chiamate.map((c) => new URL(c.url).pathname)).toEqual([
      "/o/op/data/247158188015618/floorplans",
      "/f/finance/247158188015618/tax-rates",
    ]);
    expect(r.entita.map((e) => e.tipo)).toEqual(["FLOOR", "TABLE", "TAX_RATE"]);
  });

  it("senza sede scelta non chiama niente", async () => {
    const { f, chiamate } = fetchFinto({});
    await expect(
      lightspeedK.sincronizza!(contesto(f, { configuration: {}, externalLocationId: null, enabledCapabilities: ["tables"] }), "full"),
    ).rejects.toMatchObject({ codice: "INVALID_CONFIGURATION" });
    expect(chiamate).toHaveLength(0);
  });

  it("all'attivazione con «Invio ordini» registra il webhook con Basic Auth", async () => {
    const { f, chiamate } = fetchFinto({ "/o/wh/1/webhook": { corpo: "" } });
    const r = await lightspeedK.attiva!(contesto(f));
    expect(chiamate[0]!.metodo).toBe("PUT");
    const corpo = JSON.parse(chiamate[0]!.corpo!);
    expect(corpo).toMatchObject({
      endpointId: endpointIdDi("chiave-webhook-di-prova-123456"),
      url: "https://app.foodtech.test/api/integrations/webhooks/lightspeed-k/chiave-webhook-di-prova-123456",
      withBasicAuth: true,
    });
    expect(corpo.endpointId.length).toBeLessThanOrEqual(50);
    expect(r.segretiAggiunti?.webhookPassword).toBe(corpo.password);
    expect(corpo.password.length).toBeGreaterThanOrEqual(24);
  });

  it("senza «Invio ordini» non registra niente", async () => {
    const { f, chiamate } = fetchFinto({});
    expect(await lightspeedK.attiva!(contesto(f, { enabledCapabilities: ["tables"] }))).toEqual({});
    expect(chiamate).toHaveLength(0);
  });

  it("un ordine non parte senza il webhook degli esiti", async () => {
    const { f, chiamate } = fetchFinto({ "/order/local": { corpo: { status: "ok" } } });
    const ordine = { riferimento: "R1", tavolo: "1", coperti: 2, cliente: null, righe: [], nota: null };
    await expect(lightspeedK.pos.createOrder!(contesto(f), ordine)).rejects.toMatchObject({ codice: "INVALID_CONFIGURATION" });
    expect(chiamate).toHaveLength(0);
    const r = await lightspeedK.pos.createOrder!(contesto(f, {}, { webhookUsername: "u", webhookPassword: "p" }), ordine);
    expect(r).toEqual({ accettato: true, externalId: null });
    expect(new URL(chiamate[0]!.url).pathname).toBe("/o/op/1/order/local");
  });

  it("il webhook si accetta solo con le credenziali Basic di questa installazione", () => {
    const { f } = fetchFinto({});
    const ctx = contesto(f, {}, { webhookUsername: "ft_u", webhookPassword: "pw" });
    const con = (h: string | null) =>
      lightspeedK.verificaWebhook!(ctx, { corpo: "{}", intestazioni: new Headers(h ? { authorization: h } : {}) });
    expect(con(`Basic ${Buffer.from("ft_u:pw").toString("base64")}`)).toBe(true);
    expect(con(`Basic ${Buffer.from("ft_u:sbagliata").toString("base64")}`)).toBe(false);
    expect(con("Bearer qualcosa")).toBe(false);
    expect(con(null)).toBe(false);
    // Un'installazione senza segreti del webhook non accetta niente.
    expect(lightspeedK.verificaWebhook!(contesto(f), { corpo: "{}", intestazioni: new Headers({ authorization: `Basic ${Buffer.from(":").toString("base64")}` }) })).toBe(false);
  });

  it("la notifica letta porta la sede, per il controllo dell'isolamento", () => {
    const { f } = fetchFinto({});
    const l = lightspeedK.riceviWebhook!(contesto(f), {
      corpo: '{"thirdPartyReference":"REF1","businessLocationId":247158188015618,"status":"SUCCESS","type":"ORDER"}',
      intestazioni: new Headers(),
    });
    expect(l.sedeExternalId).toBe("247158188015618");
    expect(l.idEvento).toMatch(/^[0-9a-f]{40}$/);
    expect(l.evento).toMatchObject({ tipo: "pos.order.status", stato: "ACCEPTED" });
  });
});
