import { describe, expect, it } from "vitest";
import { tilby } from "@/server/integrations/adapters/tilby";
import { hostApi, ambienteDa } from "@/server/integrations/adapters/tilby/config";
import {
  corpoVendita,
  documentiDi,
  leggiNotifica,
  pagamentoTilby,
  prodotti,
  saleETavoli,
  uuidDa,
  venditaConAggiunta,
  statoVendita,
} from "@/server/integrations/adapters/tilby/traduzione";
import { creaClientFornitore } from "@/server/integrations/adapters/http";
import type { ContestoAdattatore } from "@/server/integrations/adapters/tipi";
import type { OrdineDaInviare } from "@/server/integrations/dominio";
import { ErroreIntegrazione } from "@/server/integrations/errori";
import { TILBY } from "./fixture-tilby";

/**
 * **L'adattatore Tilby, contro gli esempi e gli schemi della documentazione.**
 *
 * Nessuna chiamata esce da qui. Queste prove dicono che l'adattatore segue
 * il reference e la guida alla stampa automatica — **non** che funzioni con
 * Tilby. Livello: TESTED_WITH_FIXTURE.
 */

type Risposta = { status?: number; corpo: unknown; intestazioni?: Record<string, string> };
type Chiamata = { url: string; metodo: string; intestazioni: Record<string, string>; corpo: string | null };

function server(regole: (u: URL, metodo: string, corpo: string | null) => Risposta | Error) {
  const chiamate: Chiamata[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c: Chiamata = { url, metodo: init.method ?? "GET", intestazioni: { ...((init.headers ?? {}) as Record<string, string>) }, corpo: init.body ? String(init.body) : null };
    chiamate.push(c);
    const r = regole(new URL(url), c.metodo, c.corpo);
    if (r instanceof Error) throw r;
    return new Response(typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...(r.intestazioni ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { f, chiamate };
}

function documentato(extra: Record<string, Risposta | ((corpo: string | null) => Risposta)> = {}) {
  return server((u, metodo, corpo) => {
    const k = `${metodo} ${u.pathname.replace(/^\/v2/, "")}`;
    const e = extra[k];
    if (e) return typeof e === "function" ? e(corpo) : e;
    switch (k) {
      case "GET /sessions/me": return { corpo: TILBY.sessione };
      case "GET /rooms": return { corpo: TILBY.rooms };
      case "GET /categories": return { corpo: TILBY.categories };
      case "GET /items": return { corpo: TILBY.items };
      case "GET /vat": return { corpo: TILBY.vat };
      case "GET /payment_methods": return { corpo: TILBY.payment_methods };
      case "GET /customers": return { corpo: TILBY.customers };
      case "GET /sales/29": return { corpo: TILBY.vendita() };
      case "POST /sales": return { status: 201, corpo: TILBY.vendita() };
      case "PUT /sales/29": return { corpo: TILBY.vendita() };
      case "DELETE /sales/29": return { corpo: {} };
      case "GET /webhooks": return { corpo: [] };
      case "POST /webhooks": return { corpo: { result: { id: 77 } } };
      default: return { status: 404, corpo: "not found" };
    }
  });
}

function contesto(f: typeof fetch, conf: Record<string, unknown> = {}, extra: Partial<ContestoAdattatore["installazione"]> = {}): ContestoAdattatore {
  return {
    installazione: {
      id: "inst_t",
      venueId: "venue_A",
      configuration: { ambiente: "sandbox", shopId: "345", ...conf },
      enabledCapabilities: ["locations", "tables", "menu", "tax_rates", "payment_methods", "customers", "orders.read", "orders.write", "payments.read", "payments.write"],
      externalAccountId: null,
      externalLocationId: "345",
      webhookKey: "chiave-webhook-tilby",
      metadata: null,
      ...extra,
    },
    segreti: { accessToken: "tok-statico" },
    http: creaClientFornitore({ slug: "tilby", correlationId: "int_t", fetchImpl: f, intestazioni: () => ({ Authorization: "Bearer tok-statico" }) }),
    correlationId: "int_t",
    origine: "https://app.foodtech.test",
  };
}

const errore = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ErroreIntegrazione;

const riga = (codice: string, nome: string, q: number, dati: Record<string, unknown>) => ({
  codiceProdotto: codice,
  nome,
  quantita: q,
  prezzoUnitarioCents: null,
  note: null,
  datiProdotto: dati,
});
const ANTIPASTO = { repartoId: "10", repartoNome: "Cucina", aliquota: 10, prezzoCents: 900, nome: "Antipasto della casa" };
const TIRAMISU = { repartoId: "10", aliquota: 10, prezzoCents: 600 };
const CAFFE = { repartoId: "4", aliquota: 22, prezzoCents: 150 };

const primaComanda: OrdineDaInviare = {
  riferimento: "ft-comanda-1",
  tavolo: "B2",
  tavoloExternalId: "1",
  coperti: 2,
  cliente: null,
  righe: [riga("334", "Antipasto della casa", 2, ANTIPASTO)],
  nota: null,
};

/* -------------------------------------------------------------------------- */

describe("autenticazione e ambienti", () => {
  it("il token statico si verifica con GET /sessions/me e diventa un segreto di tipo TOKEN", async () => {
    const { f, chiamate } = documentato();
    const c = await tilby.connetti!({ campi: { token: "  tok-statico ", ambiente: "sandbox" }, http: creaClientFornitore({ slug: "tilby", correlationId: "c", fetchImpl: f }) });
    expect(chiamate[0]!.url).toBe("https://api.tilby.com/v2/sessions/me");
    expect(chiamate[0]!.intestazioni.Authorization).toBe("Bearer tok-statico");
    expect(c).toEqual({ kind: "TOKEN", segreti: { accessToken: "tok-statico" }, scopes: [], accessTokenExpiresAt: null, refreshTokenExpiresAt: null });
    // Nessun rinnovo: il token statico non scade (nulla di documentato).
    expect(tilby.rinnovaAutenticazione).toBeUndefined();
  });

  it("token rifiutato: «non valido», non «scaduto»", async () => {
    for (const status of [401, 403]) {
      const { f } = server(() => ({ status, corpo: "Unauthorized" }));
      const e = await errore(tilby.connetti!({ campi: { token: "x" }, http: creaClientFornitore({ slug: "tilby", correlationId: "c", fetchImpl: f }) }));
      expect(e.codice).toBe("AUTH_INVALID");
    }
  });

  it("sandbox e produzione dalla configurazione, mai un indirizzo arbitrario", () => {
    expect(ambienteDa("production")).toBe("production");
    expect(ambienteDa("qualunque")).toBe("sandbox");
    expect(hostApi("production", {} as NodeJS.ProcessEnv)).toBe("https://api.tilby.com/v2");
    expect(hostApi("sandbox", { TILBY_API_BASE: "http://localhost:4020/v2" } as unknown as NodeJS.ProcessEnv)).toBe("http://localhost:4020/v2");
    for (const altro of ["https://evil.example/v2", "http://10.0.0.1/v2", "https://localhost:4020"]) {
      expect(hostApi("sandbox", { TILBY_API_BASE: altro } as unknown as NodeJS.ProcessEnv), altro).toBe("https://api.tilby.com/v2");
    }
  });
});

describe("negozio (un token = un negozio)", () => {
  it("la prova legge il negozio del token; in sandbox lo dice", async () => {
    const { f } = documentato();
    const r = await tilby.provaConnessione(contesto(f));
    expect(r.account).toEqual({ externalId: "345", nome: "Trattoria Tilby" });
    expect(r.avvisi.join(" ")).toMatch(/sandbox/);
    expect((await tilby.provaConnessione(contesto(f, { ambiente: "production" }))).avvisi).toEqual([]);
  });

  it("un token di un altro negozio fa fallire la prova", async () => {
    const { f } = documentato();
    expect((await errore(tilby.provaConnessione(contesto(f, { shopId: "999" })))).codice).toBe("INVALID_CONFIGURATION");
  });

  it("sessione senza negozio: risposta malformata, ci si ferma", async () => {
    const { f } = documentato({ "GET /sessions/me": { corpo: { id: 1 } } });
    expect((await errore(tilby.provaConnessione(contesto(f)))).codice).toBe("UNKNOWN");
  });
});

describe("importazione (solo lettura)", () => {
  it("sale e tavoli, categorie, prodotti con reparto e listini, IVA, metodi, clienti", async () => {
    const { f, chiamate } = documentato();
    const r = await tilby.sincronizza!(contesto(f), "full");
    const per = (t: string) => r.entita.filter((e) => e.tipo === t);
    expect(per("FLOOR").map((e) => e.etichetta)).toEqual(["Sala1"]);
    expect(per("TABLE").map((e) => e.etichetta)).toEqual(["B2", "12"]);
    expect(per("PRODUCT")).toHaveLength(3);
    expect(per("PRODUCT")[0]!.metadata).toMatchObject({ prezzoCents: 900, aliquota: 10, repartoId: "10", repartoNome: "Cucina", listini: [{ listino: 1, prezzoCents: 900 }, { listino: 2, prezzoCents: 1100 }] });
    expect(per("PRICE_LIST").map((e) => e.externalId)).toEqual(["price1", "price2"]);
    expect(per("TAX_RATE").map((e) => e.metadata?.percentuale)).toEqual([22, 10]);
    expect(per("PAYMENT_METHOD")[1]!.metadata).toEqual({ tipoId: "3" });
    expect(per("CUSTOMER")[0]!.etichetta).toBe("Mario Rossi");
    expect(chiamate.every((c) => c.metodo === "GET")).toBe(true);
    const q = new URL(chiamate.find((c) => c.url.includes("/items"))!.url).searchParams;
    expect([q.get("pagination"), q.get("per_page"), q.get("page")]).toEqual(["true", "100", "0"]);
  });

  it("pagina fino all'ultima pagina dichiarata", async () => {
    const tutti = Array.from({ length: 150 }, (_, n) => ({ id: n + 1, name: `P${n}`, price1: 1 }));
    const { f, chiamate } = server((u) => {
      const p = Number(u.searchParams.get("page"));
      return { corpo: { page: p, pages: 2, per_page: 100, results: tutti.slice(p * 100, p * 100 + 100) } };
    });
    expect(await tilby.pos.getProducts!(contesto(f))).toHaveLength(150);
    expect(chiamate.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["0", "1"]);
  });

  it("una risposta che non è un elenco non diventa un catalogo vuoto", async () => {
    const { f } = documentato({ "GET /items": { corpo: { errore: "boh" } } });
    expect((await errore(tilby.pos.getProducts!(contesto(f)))).codice).toBe("UNKNOWN");
  });

  it("normalizzazione di tavoli e prodotti", () => {
    const { tavoli } = saleETavoli(TILBY.rooms);
    expect(tavoli[0]).toEqual({ externalId: "1", etichetta: "B2", salaExternalId: "1", salaNome: "Sala1", posti: 4, attivo: true });
    const [p] = prodotti(TILBY.items);
    expect(p).toMatchObject({ externalId: "334", codice: "ANT-1", prezzoCents: 900, aliquotaPercentuale: 10, repartoId: "10", inVendita: true });
  });
});

describe("la comanda: vendita aperta al tavolo con stampa automatica (Caso 1)", () => {
  it("POST /sales con auto_print_order, uscita 1, tavolo e sala, uuid v4 su testata e righe", async () => {
    const c = corpoVendita(primaComanda, {
      tavolo: { tableId: 1, tableName: "B2", roomId: 1, roomName: "Sala1" },
      adesso: new Date("2026-09-23T20:10:00Z"),
    });
    expect(c).toMatchObject({
      external_id: "ft-comanda-1",
      status: "open",
      auto_print_order: true,
      currency: "EUR",
      seller_id: 0,
      table_id: 1,
      table_name: "B2",
      room_id: 1,
      room_name: "Sala1",
      tables: [{ table_id: 1, table_name: "B2", room_id: 1, room_name: "Sala1" }],
      covers: 2,
      payments: [],
      amount: 18,
      final_amount: 18,
    });
    const r = (c.sale_items as Record<string, unknown>[])[0]!;
    expect(r).toMatchObject({ type: "sale", item_id: 334, price: 9, quantity: 2, vat_perc: 10, department_id: 10, final_price: 9, final_net_price: 8.18, exit: 1, seller_id: 0 });
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(c.uuid).toMatch(v4);
    expect(r.uuid).toMatch(v4);
    expect(r.uuid).not.toBe(c.uuid);
    // Stesso riferimento → stessi uuid: è l'idempotenza.
    expect(uuidDa("ft-comanda-1")).toBe(c.uuid);
  });

  it("senza reparto o aliquota nella mappatura la riga non parte", () => {
    expect(() => corpoVendita({ ...primaComanda, righe: [riga("334", "X", 1, { prezzoCents: 100 })] }, { tavolo: null })).toThrow(/reparto, aliquota o prezzo/);
  });

  it("crea la vendita e trova il tavolo nella pianta", async () => {
    const { f, chiamate } = documentato();
    const r = await tilby.pos.createOrder!(contesto(f), primaComanda);
    expect(r).toEqual({ accettato: true, externalId: "29" });
    expect(chiamate.map((c) => `${c.metodo} ${new URL(c.url).pathname}`)).toEqual(["GET /v2/rooms", "POST /v2/sales"]);
  });

  it("vendita già creata (risposta persa): la ritrova per uuid invece di duplicarla", async () => {
    let post = 0;
    const { f, chiamate } = documentato({
      "POST /sales": () => (post++, { status: 422, corpo: "Unprocessable Entity" }),
      "GET /sales": { corpo: [TILBY.vendita({ id: 55 })] },
    });
    expect(await tilby.pos.createOrder!(contesto(f), primaComanda)).toEqual({ accettato: true, externalId: "55" });
    expect(post).toBe(1);
    expect(new URL(chiamate.at(-1)!.url).searchParams.get("uuid")).toBe(uuidDa("ft-comanda-1"));
  });

  it("422 senza vendita esistente: l'errore resta, niente secondo tentativo alla cieca", async () => {
    const { f } = documentato({ "POST /sales": { status: 422, corpo: "no" }, "GET /sales": { corpo: [] } });
    expect((await errore(tilby.pos.createOrder!(contesto(f), primaComanda))).codice).toBe("VALIDATION");
  });

  it("tavolo sparito dalla pianta: non si manda niente", async () => {
    const { f, chiamate } = documentato();
    expect((await errore(tilby.pos.createOrder!(contesto(f), { ...primaComanda, tavoloExternalId: "99" }))).codice).toBe("INVALID_CONFIGURATION");
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false);
  });
});

describe("le aggiunte allo stesso conto (Caso 3 — tavolo aperto con riordino continuo)", () => {
  const aggiunta: OrdineDaInviare = {
    riferimento: "ft-comanda-2",
    tavolo: "B2",
    tavoloExternalId: "1",
    coperti: null,
    cliente: null,
    righe: [riga("335", "Tiramisù", 2, TIRAMISU), riga("336", "Caffè", 2, CAFFE)],
    nota: null,
  };

  it("20:35 B2 aggiunge 2 dessert e 2 caffè: stessa vendita, uscita 2, righe vecchie intatte", () => {
    const { corpo, uscita } = venditaConAggiunta(TILBY.vendita(), aggiunta);
    expect(uscita).toBe(2);
    const righe = corpo!.sale_items as Record<string, unknown>[];
    expect(righe).toHaveLength(3);
    expect(righe[0]).toMatchObject({ uuid: "u-1", exit: 1 });
    expect(righe.slice(1).map((r) => [r.item_id, r.quantity, r.exit])).toEqual([[335, 2, 2], [336, 2, 2]]);
    expect(corpo!.auto_print_order).toBe(true);
    expect(corpo!.final_amount).toBe(18 + 12 + 3);
  });

  it("la stessa aggiunta rimandata non raddoppia i piatti", () => {
    const { corpo } = venditaConAggiunta(TILBY.vendita(), aggiunta);
    expect(venditaConAggiunta(corpo!, aggiunta)).toEqual({ corpo: null, uscita: null });
  });

  it("un conto chiuso non accetta aggiunte; oltre la decima uscita ci si ferma", () => {
    expect(() => venditaConAggiunta(TILBY.vendita({ status: "closed" }), aggiunta)).toThrow(/non è più aperto/);
    const piena = TILBY.vendita({ sale_items: [{ uuid: "x", exit: 10, final_price: 1, final_net_price: 1, quantity: 1 }] });
    expect(() => venditaConAggiunta(piena, aggiunta)).toThrow(/al massimo 10 uscite/);
  });

  it("updateOrder: GET e poi PUT sulla stessa vendita", async () => {
    const { f, chiamate } = documentato();
    await tilby.pos.updateOrder!(contesto(f), "29", aggiunta);
    expect(chiamate.map((c) => `${c.metodo} ${new URL(c.url).pathname}`)).toEqual(["GET /v2/sales/29", "PUT /v2/sales/29"]);
    const corpo = JSON.parse(chiamate[1]!.corpo!);
    expect(corpo.sale_items).toHaveLength(3);
  });

  it("cancellazione: DELETE /sales/{id}", async () => {
    const { f, chiamate } = documentato();
    await tilby.pos.cancelOrder!(contesto(f), "29");
    expect(`${chiamate[0]!.metodo} ${new URL(chiamate[0]!.url).pathname}`).toBe("DELETE /v2/sales/29");
  });
});

describe("pagamenti e scontrino", () => {
  const carta = { externalId: "2", nome: "Carta", tipoId: "3", tipoNome: "Carta" };

  it("il pagamento ha paid:true e la coppia id/tipo del metodo, come vuole la guida", () => {
    expect(pagamentoTilby({ importoCents: 3000, metodo: carta, data: new Date("2026-09-23T21:00:00Z") })).toEqual({
      amount: 30,
      paid: true,
      payment_method_id: 2,
      payment_method_name: "Carta",
      payment_method_type_id: 3,
      payment_method_type_name: "Carta",
      date: "2026-09-23T21:00:00.000Z",
    });
    expect(() => pagamentoTilby({ importoCents: 100, metodo: { externalId: "1", nome: "X" } })).toThrow(/tipo del metodo/);
  });

  it("pagamento parziale: si accoda ai pagamenti esistenti della vendita aperta", async () => {
    const { f, chiamate } = documentato({
      "GET /sales/29": { corpo: TILBY.vendita({ final_amount: 120, payments: [{ id: 1, amount: 30, paid: true, payment_method_id: 2, payment_method_type_id: 3 }] }) },
    });
    await tilby.pos.createPayment!(contesto(f), { riferimentoOrdine: "29", importoCents: 3000, manciaCents: 0, metodo: { externalId: "1", nome: "Contanti", tipoId: "1" } });
    const corpo = JSON.parse(chiamate[1]!.corpo!);
    expect(corpo.payments.map((p: { amount: number }) => p.amount)).toEqual([30, 30]);
  });

  it("niente pagamenti su un conto chiuso", async () => {
    const { f } = documentato({ "GET /sales/29": { corpo: TILBY.vendita({ status: "closed" }) } });
    expect((await errore(tilby.pos.createPayment!(contesto(f), { riferimentoOrdine: "29", importoCents: 1, manciaCents: 0, metodo: carta }))).codice).toBe("CONFLICT");
  });

  it("i documenti emessi si leggono da sale_documents", async () => {
    const v = TILBY.vendita({
      status: "closed",
      sale_documents: [{ id: 5, document_type: "fiscal_receipt", sequential_number: 42, sequential_number_prefix: "0001-", date: "2026-09-23", document_url: "https://receipts.example/42" }],
    });
    expect(documentiDi(v)).toEqual([{ externalId: "5", tipo: "fiscal_receipt", numero: "0001-42", data: "2026-09-23", url: "https://receipts.example/42" }]);
    const { f } = documentato({ "GET /sales/29": { corpo: v } });
    expect(await tilby.pos.getReceipt!(contesto(f), "29")).toHaveLength(1);
  });

  it("chiudere il conto non è un'operazione a sé: nessun closeOrder", () => {
    expect(tilby.pos.closeOrder).toBeUndefined();
  });
});

describe("webhook", () => {
  it("registrazione all'attivazione, con l'indirizzo di questa installazione", async () => {
    process.env.TILBY_WEBHOOK_EMAIL = "integrazioni@foodtech.test";
    try {
      const { f, chiamate } = documentato();
      const r = await tilby.attiva!(contesto(f));
      const post = chiamate.filter((c) => c.metodo === "POST").map((c) => JSON.parse(c.corpo!));
      expect(post[0]).toEqual({
        entity_type: "sales",
        event_type: "CREATED",
        url: "https://app.foodtech.test/api/integrations/webhooks/tilby/chiave-webhook-tilby",
        email: "integrazioni@foodtech.test",
      });
      expect((r.metadata!.webhooks as unknown[]).length).toBe(post.length);
    } finally {
      delete process.env.TILBY_WEBHOOK_EMAIL;
    }
  });

  it("un webhook di un altro integratore sulla stessa coppia non si tocca", async () => {
    process.env.TILBY_WEBHOOK_EMAIL = "integrazioni@foodtech.test";
    try {
      const { f, chiamate } = documentato({ "GET /webhooks": { corpo: [{ id: 5, entity_type: "sales", event_type: "CREATED", url: "https://altro.example/hook" }] } });
      const r = await tilby.attiva!(contesto(f));
      expect(chiamate.some((c) => c.metodo === "DELETE")).toBe(false);
      expect(r.metadata!.webhookGiaDiAltri).toEqual(["sales/CREATED"]);
    } finally {
      delete process.env.TILBY_WEBHOOK_EMAIL;
    }
  });

  it("senza email per gli errori i webhook non si registrano, e lo si dice", async () => {
    const { f, chiamate } = documentato();
    const r = await tilby.attiva!(contesto(f));
    expect(chiamate).toHaveLength(0);
    expect(r.metadata!.avvisoWebhook).toMatch(/TILBY_WEBHOOK_EMAIL/);
  });

  it("disinstallare toglie i webhook registrati", async () => {
    const { f, chiamate } = documentato({ "DELETE /webhooks": { corpo: { result: "ok" } } });
    await tilby.disconnetti!(contesto(f, {}, { metadata: { webhooks: [{ id: "77" }, { id: "78" }] } }));
    expect(chiamate.map((c) => JSON.parse(c.corpo!))).toEqual([{ id: 77 }, { id: 78 }]);
  });

  it("sales/CLOSED diventa conto chiuso + pagamento riuscito; la chiave è il notification_uuid", () => {
    const n = leggiNotifica(TILBY.notifica());
    expect(n.idEvento).toBe("625bd8dc-f13c-4d43-9ca7-39c9a26c8f9c");
    expect(n.evento).toEqual({
      tipo: "multipli",
      eventi: [
        { tipo: "pos.order.status", riferimento: "ft-comanda-1", externalId: "29", stato: "CLOSED", motivo: null },
        { tipo: "pos.payment.status", riferimento: "ft-comanda-1", externalId: "29", riuscito: true, motivo: null },
      ],
    });
  });

  it("DELETED, UPDATED, catalogo, e la verifica di registrazione SUBSCRIBED", () => {
    expect(leggiNotifica(TILBY.notifica({ type: "DELETED" })).evento).toMatchObject({ stato: "CANCELLED" });
    expect(leggiNotifica(TILBY.notifica({ type: "UPDATED", entities: [{ id: 29, external_id: "x", status: "open" }] })).evento).toMatchObject({ stato: "IN_PROGRESS" });
    expect(leggiNotifica(TILBY.notifica({ entity_name: "items", type: "UPDATED", entities: [{ id: 334 }] })).evento).toEqual({ tipo: "catalogo.cambiato", risorsa: "menu", externalId: "334" });
    expect(leggiNotifica(TILBY.notifica({ entity_name: "rooms", type: "UPDATED" })).evento).toMatchObject({ risorsa: "tables" });
    expect(leggiNotifica({ type: "SUBSCRIBED", entity_name: "sales", time: "t", environment_id: "e", client_id: "c" }).evento.tipo).toBe("sconosciuto");
    expect(statoVendita({ status: "stored" })).toBe("IN_PROGRESS");
  });

  it("una notifica senza notification_uuid o non JSON si rifiuta", () => {
    const { f } = documentato();
    expect(() => leggiNotifica({ type: "CREATED", entity_name: "sales" })).toThrow(/notification_uuid/);
    expect(tilby.verificaWebhook!(contesto(f), { corpo: "non json", intestazioni: new Headers() })).toBe(false);
    expect(tilby.verificaWebhook!(contesto(f), { corpo: JSON.stringify(TILBY.notifica()), intestazioni: new Headers() })).toBe(true);
  });
});

describe("guasti del fornitore", () => {
  it("giù, lento, limiti: codici riprovabili; Retry-After rispettato se presente", async () => {
    const casi: [Risposta | Error, string][] = [
      [{ status: 503, corpo: {} }, "PROVIDER_UNAVAILABLE"],
      [{ status: 429, corpo: {}, intestazioni: { "retry-after": "45" } }, "RATE_LIMITED"],
      [Object.assign(new Error("t"), { name: "TimeoutError" }), "TIMEOUT"],
    ];
    for (const [r, codice] of casi) {
      const { f } = server(() => r);
      const e = await errore(tilby.pos.getTables!(contesto(f)));
      expect(e.codice, codice).toBe(codice);
      expect(e.riprovabile).toBe(true);
      if (codice === "RATE_LIMITED") expect(e.dettaglio.riprovaTraSecondi).toBe(45);
    }
  });

  it("401 durante il lavoro: token revocato, «non valido»", async () => {
    const { f } = server(() => ({ status: 401, corpo: "Unauthorized" }));
    expect((await errore(tilby.pos.getTables!(contesto(f)))).codice).toBe("AUTH_INVALID");
  });
});
