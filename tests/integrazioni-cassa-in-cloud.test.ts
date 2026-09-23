import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cassaInCloud } from "@/server/integrations/adapters/cassa-in-cloud";
import {
  corpoOrdine,
  leggiEvento,
  ordine,
  prodotti,
  puntiVendita,
  statoOrdine,
  tavoli,
} from "@/server/integrations/adapters/cassa-in-cloud/traduzione";
import { creaClientFornitore } from "@/server/integrations/adapters/http";
import type { ContestoAdattatore } from "@/server/integrations/adapters/tipi";
import { ErroreIntegrazione } from "@/server/integrations/errori";
import { FIXTURE } from "./fixture-cassa-in-cloud";

/**
 * **L'adattatore Cassa in Cloud, contro le forme della documentazione.**
 *
 * Le fixture usano solo i nomi di campo dei modelli di api-doc.cassanova.com
 * (SalesPoint, Room, Table, Category, Product, Price, Department, Tax,
 * SalesMode, Order, Receipt, Payment, BatchCreateResponse). Nessuna risposta
 * vera è mai stata letta: queste prove dicono che l'adattatore segue la
 * documentazione, **non** che funzioni con Cassa in Cloud.
 */

/* -------------------------------------------------------------------------- */
/*  Fixture                                                                   */
/* -------------------------------------------------------------------------- */

/* Le fixture stanno in un modulo loro: vedi `fixture-cassa-in-cloud.ts`. */

type Risposta = { status?: number; corpo: unknown; intestazioni?: Record<string, string> };
type Chiamata = { url: string; metodo: string; intestazioni: Record<string, string>; corpo: string | null };

function server(regole: (url: URL, metodo: string, corpo: string | null, n: number) => Risposta | Error) {
  const chiamate: Chiamata[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const intestazioni = { ...((init.headers ?? {}) as Record<string, string>) };
    const c: Chiamata = { url, metodo: init.method ?? "GET", intestazioni, corpo: init.body ? String(init.body) : null };
    chiamate.push(c);
    const r = regole(new URL(url), c.metodo, c.corpo, chiamate.length);
    if (r instanceof Error) throw r;
    return new Response(typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...(r.intestazioni ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { f, chiamate };
}

/** Un server che risponde come la documentazione, per percorso. */
function serverDocumentato(extra: Record<string, Risposta> = {}) {
  return server((u, metodo) => {
    const chiave = `${metodo} ${u.pathname}`;
    if (extra[chiave]) return extra[chiave]!;
    switch (chiave) {
      case "POST /apikey/token": return { corpo: FIXTURE.token };
      case "GET /salespoint": return { corpo: FIXTURE.salespoint };
      case "GET /risto/rooms": return { corpo: FIXTURE.rooms };
      case "GET /risto/tables": return { corpo: FIXTURE.tables };
      case "GET /categories": return { corpo: FIXTURE.categories };
      case "GET /products": return { corpo: FIXTURE.products };
      case "GET /salesmodes": return { corpo: FIXTURE.salesModes };
      case "GET /taxes": return { corpo: FIXTURE.taxes };
      case "GET /documents/receipts": return { corpo: FIXTURE.receipts };
      default: return { status: 404, corpo: { error: "InvalidId" } };
    }
  });
}

function contesto(f: typeof fetch, extra: Partial<ContestoAdattatore["installazione"]> = {}, segreti: Record<string, string> = {}): ContestoAdattatore {
  return {
    installazione: {
      id: "inst_cic",
      venueId: "venue_A",
      configuration: { idSalesPoint: "101" },
      enabledCapabilities: ["locations", "tables", "menu", "tax_rates", "orders.read", "orders.write", "payments.read"],
      externalAccountId: null,
      externalLocationId: "101",
      webhookKey: "chiave-webhook",
      ...extra,
    },
    segreti: { apiKey: "api-key-A", accessToken: "tok-A", ...segreti },
    http: creaClientFornitore({ slug: "cassa-in-cloud", correlationId: "int_t", fetchImpl: f }),
    correlationId: "int_t",
    origine: "https://app.foodtech.test",
  };
}

const client = (f: typeof fetch) => creaClientFornitore({ slug: "cassa-in-cloud", correlationId: "c", fetchImpl: f });
const errore = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ErroreIntegrazione;

/* -------------------------------------------------------------------------- */

describe("autenticazione: chiave API → token di un'ora", () => {
  it("genera il token con la chiave, e salva chiave e token come segreti", async () => {
    const { f, chiamate } = serverDocumentato();
    const c = await cassaInCloud.connetti!({ campi: { apiKey: "  api-key-A " }, http: client(f) });
    expect(chiamate[0]!.url).toBe("https://api.cassanova.com/apikey/token");
    expect(chiamate[0]!.metodo).toBe("POST");
    expect(JSON.parse(chiamate[0]!.corpo!)).toEqual({ apiKey: "api-key-A" });
    expect(chiamate[0]!.intestazioni["X-Requested-With"]).toBe("*");
    expect(c.kind).toBe("API_KEY");
    expect(c.segreti).toEqual({ apiKey: "api-key-A", accessToken: FIXTURE.token.access_token });
    expect(c.scopes).toEqual([]);
    const durata = c.accessTokenExpiresAt!.getTime() - Date.now();
    expect(durata).toBeGreaterThan(3590_000);
    expect(durata).toBeLessThanOrEqual(3600_000);
    expect(c.refreshTokenExpiresAt).toBeNull();
  });

  it("una chiave rifiutata è «non valida», non «scaduta»", async () => {
    for (const status of [400, 401, 403]) {
      const { f } = server(() => ({ status, corpo: { error: "no" } }));
      const e = await errore(cassaInCloud.connetti!({ campi: { apiKey: "sbagliata" }, http: client(f) }));
      expect(e.codice, String(status)).toBe("AUTH_INVALID");
    }
  });

  it("senza chiave non chiama nessuno", async () => {
    const { f, chiamate } = serverDocumentato();
    expect((await errore(cassaInCloud.connetti!({ campi: { apiKey: " " }, http: client(f) }))).codice).toBe("VALIDATION");
    expect(chiamate).toHaveLength(0);
  });

  it("il rinnovo chiede un token nuovo con la stessa chiave e conserva il segreto del webhook", async () => {
    const { f, chiamate } = serverDocumentato();
    const c = await cassaInCloud.rinnovaAutenticazione!(contesto(f, {}, { webhookSecret: "ws" }));
    expect(JSON.parse(chiamate[0]!.corpo!)).toEqual({ apiKey: "api-key-A" });
    expect(c.segreti).toEqual({ apiKey: "api-key-A", accessToken: FIXTURE.token.access_token, webhookSecret: "ws" });
  });

  it("token scaduto prima del previsto: un token nuovo e un secondo tentativo, una volta sola", async () => {
    let risorse = 0;
    const { f, chiamate } = server((u, metodo) => {
      if (u.pathname === "/apikey/token") return { corpo: { ...FIXTURE.token, access_token: "tok-nuovo" } };
      risorse++;
      return risorse === 1 ? { status: 401, corpo: {} } : { corpo: FIXTURE.salespoint };
    });
    const ctx = contesto(f);
    const r = await cassaInCloud.provaConnessione(ctx);
    expect(r.sedi).toHaveLength(2);
    expect(chiamate.map((c) => new URL(c.url).pathname)).toEqual(["/salespoint", "/apikey/token", "/salespoint"]);
    expect(chiamate[2]!.intestazioni.Authorization).toBe("Bearer tok-nuovo");
  });

  it("se anche il token nuovo è rifiutato, la chiave non va più: «non valida»", async () => {
    const { f } = server((u) => (u.pathname === "/apikey/token" ? { status: 403, corpo: {} } : { status: 401, corpo: {} }));
    expect((await errore(cassaInCloud.provaConnessione(contesto(f)))).codice).toBe("AUTH_INVALID");
  });
});

describe("ogni chiamata porta le intestazioni documentate", () => {
  it("X-Version 1.0.0, X-Requested-With, Bearer", async () => {
    const { f, chiamate } = serverDocumentato();
    await cassaInCloud.provaConnessione(contesto(f));
    expect(chiamate[0]!.url).toBe("https://api.cassanova.com/salespoint");
    expect(chiamate[0]!.intestazioni).toMatchObject({
      "X-Version": "1.0.0",
      "X-Requested-With": "*",
      Authorization: "Bearer tok-A",
    });
  });
});

describe("punti vendita (multi-sede)", () => {
  it("elenca i punti vendita della chiave, con la città", async () => {
    const { f } = serverDocumentato();
    const r = await cassaInCloud.opzioniConfigurazione!(contesto(f));
    expect(r.locations).toEqual([
      // «Torino Centro» contiene già la città: non si ripete.
      { value: "101", label: "Torino Centro" },
      { value: "102", label: "Milano Navigli" },
    ]);
  });

  it("un punto vendita non abilitato per la chiave fa fallire la prova", async () => {
    const { f } = serverDocumentato();
    const e = await errore(cassaInCloud.provaConnessione(contesto(f, { configuration: { idSalesPoint: "999" } })));
    expect(e.codice).toBe("INVALID_CONFIGURATION");
  });

  it("nessun punto vendita: prova riuscita, con un avviso", async () => {
    const { f } = serverDocumentato({ "GET /salespoint": { corpo: { salesPoint: [], totalCount: 0 } } });
    const r = await cassaInCloud.provaConnessione(contesto(f, { configuration: {} }));
    expect(r.avvisi.join(" ")).toMatch(/nessun punto vendita/);
  });
});

describe("risposte che non vanno", () => {
  it("una risposta senza l'elenco documentato si ferma, non scrive un catalogo vuoto", async () => {
    const { f } = serverDocumentato({ "GET /salespoint": { corpo: { qualcosa: "altro" } } });
    const e = await errore(cassaInCloud.provaConnessione(contesto(f)));
    expect(e.codice).toBe("UNKNOWN");
    expect(e.message).toMatch(/Risposta inattesa/);
    const { f: f2 } = serverDocumentato({ "GET /salespoint": { corpo: "<html>errore</html>" } });
    expect((await errore(cassaInCloud.provaConnessione(contesto(f2)))).codice).toBe("UNKNOWN");
  });

  it("fornitore giù, troppe richieste, tempo scaduto: tre codici, tutti riprovabili", async () => {
    const casi: [Risposta | Error, string][] = [
      [{ status: 503, corpo: {} }, "PROVIDER_UNAVAILABLE"],
      [{ status: 429, corpo: {}, intestazioni: { "retry-after": "120" } }, "RATE_LIMITED"],
      [Object.assign(new Error("scaduto"), { name: "TimeoutError" }), "TIMEOUT"],
    ];
    for (const [r, codice] of casi) {
      const { f } = server(() => r);
      const e = await errore(cassaInCloud.provaConnessione(contesto(f)));
      expect(e.codice, codice).toBe(codice);
      expect(e.riprovabile).toBe(true);
      if (codice === "RATE_LIMITED") expect(e.dettaglio.riprovaTraSecondi).toBe(120);
    }
  });

  it("403 su una risorsa è «operazione non consentita», non «ricollega»", async () => {
    const { f } = server(() => ({ status: 403, corpo: {} }));
    expect((await errore(cassaInCloud.provaConnessione(contesto(f)))).codice).toBe("PERMISSION_DENIED");
  });
});

describe("sincronizzazione (solo lettura)", () => {
  it("legge sale, tavoli, categorie, prodotti, listini e aliquote del punto vendita scelto", async () => {
    const { f, chiamate } = serverDocumentato();
    const r = await cassaInCloud.sincronizza!(contesto(f), "full");
    expect(r.entita.map((e) => e.tipo)).toEqual([
      "FLOOR", "TABLE", "TABLE", "CATEGORY", "PRODUCT", "PRODUCT", "PRICE_LIST", "TAX_RATE",
    ]);
    const tavoli = new URL(chiamate.find((c) => c.url.includes("/risto/tables"))!.url);
    expect(tavoli.searchParams.get("idsSalesPoint")).toBe("[101]");
    expect(tavoli.searchParams.get("start")).toBe("0");
    expect(tavoli.searchParams.get("limit")).toBe("100");
    expect(chiamate.every((c) => c.metodo === "GET")).toBe(true);
  });

  it("solo ciò che è acceso", async () => {
    const { f, chiamate } = serverDocumentato();
    await cassaInCloud.sincronizza!(contesto(f, { enabledCapabilities: ["tax_rates"] }), "full");
    expect(chiamate.map((c) => new URL(c.url).pathname)).toEqual(["/taxes"]);
  });

  it("pagina fino al totale, a pagine da cento", async () => {
    const tutti = Array.from({ length: 150 }, (_, n) => ({ id: `p${n}`, description: `P${n}`, prices: [{ value: 1 }] }));
    const { f, chiamate } = server((u) => {
      const start = Number(u.searchParams.get("start"));
      return { corpo: { products: tutti.slice(start, start + 100), totalCount: 150 } };
    });
    const p = await cassaInCloud.pos.getProducts!(contesto(f));
    expect(p).toHaveLength(150);
    expect(chiamate.map((c) => new URL(c.url).searchParams.get("start"))).toEqual(["0", "100"]);
  });

  it("senza punto vendita scelto non chiama niente", async () => {
    const { f, chiamate } = serverDocumentato();
    const e = await errore(cassaInCloud.sincronizza!(contesto(f, { configuration: {}, externalLocationId: null }), "full"));
    expect(e.codice).toBe("INVALID_CONFIGURATION");
    expect(chiamate).toHaveLength(0);
  });
});

describe("normalizzazione", () => {
  it("punti vendita e tavoli", () => {
    expect(puntiVendita(FIXTURE.salespoint)[0]).toEqual({ externalId: "101", nome: "Torino Centro", account: null });
    expect(puntiVendita({ salesPoint: [{ id: 7, name: "Centro", city: "Roma" }] })[0]!.nome).toBe("Centro · Roma");
    expect(tavoli(FIXTURE.tables)[0]).toEqual({ externalId: "tab-12", etichetta: "12", salaExternalId: "room-1", posti: 4, attivo: true });
  });

  it("prodotti: prezzo base senza listino, aliquota dal reparto, varianti", () => {
    const [m, b] = prodotti(FIXTURE.products);
    expect(m).toMatchObject({
      externalId: "prod-1",
      nome: "Margherita",
      prezzoCents: 850,
      aliquotaPercentuale: 10,
      ivaInclusa: null,
      multivariante: false,
      prezziPerListino: [{ listino: "sm-asporto", prezzoCents: 750 }],
    });
    expect(b).toMatchObject({ multivariante: true, varianti: [{ externalId: "var-media", nome: "Media 0,4" }] });
  });

  it("ordini: stato dal flusso esterno, poi da OrderStatus", () => {
    const o = ordine(FIXTURE.ordine("ft-1"));
    expect(o).toMatchObject({ externalId: "ord-cic-1", riferimento: "ft-1", stato: "ACCEPTED", tavolo: "tab-12", totaleCents: 1000 });
    expect(o.righe[0]).toMatchObject({ codiceProdotto: "var-media", quantita: 2, prezzoUnitarioCents: 500 });
    expect(statoOrdine({ status: "PROCESSED" })).toBe("CLOSED");
    expect(statoOrdine({ status: "UNCONFIRMED" })).toBe("UNKNOWN");
    expect(statoOrdine({ externalWorkflowStatus: "CANCELED", status: "PROCESSED" })).toBe("CANCELLED");
  });
});

describe("ordini", () => {
  const ordineFoodtech = {
    riferimento: "ft-comanda-1",
    tavolo: "12",
    tavoloExternalId: "tab-12",
    coperti: 2,
    cliente: null,
    righe: [{ codiceProdotto: "var-media", nome: "Birra", quantita: 2, prezzoUnitarioCents: 500, note: "senza schiuma" }],
    nota: "tavolo vicino alla finestra",
  };

  it("il corpo della creazione usa solo campi documentati", () => {
    const c = corpoOrdine(ordineFoodtech, { idSalesPoint: "101", adesso: 1_000_000 });
    expect(c).toEqual({
      create: [
        {
          externalId: "ft-comanda-1",
          isExternalOrder: true,
          deliveryMode: "TABLE",
          idTable: "tab-12",
          dueDate: 1_000_000 + 5 * 60_000,
          document: {
            idSalesPoint: 101,
            note: "tavolo vicino alla finestra",
            rows: [{ rowNumber: 1, idProductVariant: "var-media", quantity: 2, price: 5, note: "senza schiuma" }],
          },
        },
      ],
    });
  });

  it("senza tavolo abbinato, o senza righe, non parte", () => {
    expect(() => corpoOrdine({ ...ordineFoodtech, tavoloExternalId: null }, { idSalesPoint: "101" })).toThrow(/Tavolo non abbinato/);
    expect(() => corpoOrdine({ ...ordineFoodtech, righe: [] }, { idSalesPoint: "101" })).toThrow(/senza righe/);
  });

  it("crea l'ordine e restituisce l'id della cassa", async () => {
    const { f, chiamate } = serverDocumentato({ "POST /documents/orders/batch": { corpo: FIXTURE.batchCreato("ft-comanda-1") } });
    const r = await cassaInCloud.pos.createOrder!(contesto(f), ordineFoodtech);
    expect(r).toEqual({ accettato: true, externalId: "ord-cic-1" });
    expect(chiamate[0]!.intestazioni["Content-Type"]).toBe("application/json");
  });

  it("un secondo invio con lo stesso riferimento non crea un doppione: ritrova quello che c'è", async () => {
    let batch = 0;
    const { f, chiamate } = server((u, metodo) => {
      if (metodo === "POST") {
        batch++;
        return { status: 400, corpo: { error: "ConflictValue", msg: "externalId" } };
      }
      if (u.pathname === "/documents/orders") return { corpo: { orders: [FIXTURE.ordine("altro", "ord-x"), FIXTURE.ordine("ft-comanda-1", "ord-cic-1")], totalCount: 2 } };
      return { status: 404, corpo: {} };
    });
    const r = await cassaInCloud.pos.createOrder!(contesto(f), ordineFoodtech);
    expect(r).toEqual({ accettato: true, externalId: "ord-cic-1" });
    expect(batch).toBe(1);
    const ricerca = new URL(chiamate[1]!.url);
    expect(ricerca.searchParams.get("idTables")).toBe('["tab-12"]');
    expect(ricerca.searchParams.get("datetimeFrom")).toMatch(/^"\d{4}-\d{2}-\d{2}"$/);
  });

  it("conflitto ma l'ordine non si trova: CONFLICT, niente riprove alla cieca", async () => {
    const { f } = server((u, metodo) =>
      metodo === "POST" ? { status: 400, corpo: { error: "ConflictValue" } } : { corpo: { orders: [], totalCount: 0 } },
    );
    expect((await errore(cassaInCloud.pos.createOrder!(contesto(f), ordineFoodtech))).codice).toBe("CONFLICT");
  });

  it("aggiornare e chiudere un ordine non sono dichiarati: l'API documentata non li offre", () => {
    expect(cassaInCloud.pos.updateOrder).toBeUndefined();
    expect(cassaInCloud.pos.closeOrder).toBeUndefined();
    expect(cassaInCloud.pos.createPayment).toBeUndefined();
    expect(cassaInCloud.pos.getPaymentMethods).toBeUndefined();
  });

  it("la riga d'ordine chiede una variante: prodotto semplice rifiutato (DA VERIFICARE), multivariante con una variante sì", () => {
    expect(cassaInCloud.codiceProdottoPerOrdine!({ externalId: "prod-2", metadata: { multivariante: true, varianti: [{ externalId: "var-media" }] } })).toBe("var-media");
    for (const metadata of [{ multivariante: false }, { multivariante: true, varianti: [{ externalId: "a" }, { externalId: "b" }] }, null]) {
      try {
        cassaInCloud.codiceProdottoPerOrdine!({ externalId: "prod-1", metadata });
        expect.unreachable();
      } catch (e) {
        expect((e as ErroreIntegrazione).codice).toBe("NOT_SUPPORTED");
      }
    }
  });

  it("le ricerche per data si spezzano in finestre di al massimo due giorni", async () => {
    const { f, chiamate } = server(() => ({ corpo: { orders: [], totalCount: 0 } }));
    await cassaInCloud.pos.getOrders!(contesto(f), { da: new Date("2026-09-01"), a: new Date("2026-09-05") });
    const finestre = chiamate.map((c) => {
      const u = new URL(c.url);
      return [u.searchParams.get("datetimeFrom"), u.searchParams.get("datetimeTo")];
    });
    expect(finestre).toEqual([
      ['"2026-09-01"', '"2026-09-02"'],
      ['"2026-09-03"', '"2026-09-04"'],
      ['"2026-09-05"', '"2026-09-05"'],
    ]);
  });

  it("i pagamenti si leggono dagli scontrini, con l'ordine Foodtech collegato", async () => {
    const { f } = serverDocumentato();
    const p = await cassaInCloud.pos.getPayments!(contesto(f), { da: new Date(), a: new Date() });
    expect(p).toEqual([{ externalId: "rec-1", riferimento: "ft-comanda-1", importoCents: 1000, mancia: null, metodo: "CREDITCARD", riuscito: true }]);
  });
});

describe("webhook", () => {
  const corpo = JSON.stringify(FIXTURE.ordine("ft-comanda-1"));
  const firma = (segreto: string, testo: string, cod: "hex" | "base64" = "hex") =>
    createHmac("sha1", segreto).update(testo).digest(cod);
  const w = (intestazioni: Record<string, string>, testo = corpo) => ({ corpo: testo, intestazioni: new Headers(intestazioni) });

  it("accetta solo la firma HMAC-SHA1 con il segreto di questa installazione", () => {
    const { f } = serverDocumentato();
    const ctx = contesto(f, {}, { webhookSecret: "segreto-A" });
    expect(cassaInCloud.verificaWebhook!(ctx, w({ "x-cn-signature": firma("segreto-A", corpo) }))).toBe(true);
    expect(cassaInCloud.verificaWebhook!(ctx, w({ "x-cn-signature": firma("segreto-A", corpo, "base64") }))).toBe(true);
    expect(cassaInCloud.verificaWebhook!(ctx, w({ "x-cn-signature": firma("segreto-B", corpo) }))).toBe(false);
    expect(cassaInCloud.verificaWebhook!(ctx, w({ "x-cn-signature": firma("segreto-A", corpo + " ") }))).toBe(false);
    expect(cassaInCloud.verificaWebhook!(ctx, w({}))).toBe(false);
    // Senza segreto salvato, niente passa.
    expect(cassaInCloud.verificaWebhook!(contesto(f), w({ "x-cn-signature": firma("", corpo) }))).toBe(false);
  });

  it("ORDER/EDIT diventa lo stato dell'ordine, con il riferimento Foodtech e la sede", () => {
    const { f } = serverDocumentato();
    const l = cassaInCloud.riceviWebhook!(contesto(f), w({ "x-cn-operation": "ORDER/EDIT" }));
    expect(l).toMatchObject({
      tipo: "ORDER/EDIT",
      sedeExternalId: "101",
      evento: { tipo: "pos.order.status", riferimento: "ft-comanda-1", externalId: "ord-cic-1", stato: "ACCEPTED" },
    });
    expect(l.idEvento).toMatch(/^[0-9a-f]{40}$/);
    // Lo stesso corpo ritentato ha la stessa chiave; un'altra operazione no.
    expect(cassaInCloud.riceviWebhook!(contesto(f), w({ "x-cn-operation": "ORDER/EDIT" })).idEvento).toBe(l.idEvento);
    expect(cassaInCloud.riceviWebhook!(contesto(f), w({ "x-cn-operation": "ORDER/DELETE" })).idEvento).not.toBe(l.idEvento);
  });

  it("RECEIPT/CREATE diventa un pagamento riuscito, collegato all'ordine Foodtech", () => {
    const e = leggiEvento("RECEIPT/CREATE", FIXTURE.receipts.receipts[0]);
    expect(e.evento).toEqual({ tipo: "pos.payment.status", riferimento: "ft-comanda-1", externalId: "rec-1", riuscito: true, motivo: null });
  });

  it("prodotti, categorie e aliquote chiedono una sincronizzazione; il resto si ignora", () => {
    expect(leggiEvento("PRODUCT/EDIT", { id: "prod-1" }).evento).toEqual({ tipo: "catalogo.cambiato", risorsa: "menu", externalId: "prod-1" });
    expect(leggiEvento("TAX/CREATE", { id: "tax-4" }).evento).toMatchObject({ tipo: "catalogo.cambiato", risorsa: "tax_rates" });
    expect(leggiEvento("CUSTOMER/CREATE", { id: "c" }).evento.tipo).toBe("sconosciuto");
  });

  it("intestazione dell'operazione mancante o corpo non JSON: rifiutato", () => {
    const { f } = serverDocumentato();
    expect(() => cassaInCloud.riceviWebhook!(contesto(f), w({}))).toThrow(/x-cn-operation/);
    expect(() => cassaInCloud.riceviWebhook!(contesto(f), w({ "x-cn-operation": "ORDER/EDIT" }, "non json"))).toThrow(/JSON/);
  });
});

describe("host", () => {
  it("sempre quello ufficiale, tranne un server finto su questa macchina", async () => {
    const { hostApi } = await import("@/server/integrations/adapters/cassa-in-cloud/config");
    expect(hostApi({} as NodeJS.ProcessEnv)).toBe("https://api.cassanova.com");
    expect(hostApi({ CASSA_IN_CLOUD_API_BASE: "http://localhost:4010" } as unknown as NodeJS.ProcessEnv)).toBe("http://localhost:4010");
    for (const altro of ["https://evil.example", "http://localhost.evil.example", "http://10.0.0.1:80", "https://localhost:4010"]) {
      expect(hostApi({ CASSA_IN_CLOUD_API_BASE: altro } as unknown as NodeJS.ProcessEnv), altro).toBe("https://api.cassanova.com");
    }
  });
});
