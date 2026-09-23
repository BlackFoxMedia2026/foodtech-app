import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  aggiornaSegretoWebhook,
  attiva,
  connettiConCampi,
  disattiva,
  disinstalla,
  installa,
  provaConnessione,
  riattiva,
  salvaCapacita,
  salvaConfigurazione,
  trovaInstallazione,
  usaFetchPerProve,
  type Attore,
} from "@/server/integrations/installazioni";
import { eseguiSincronizzazione } from "@/server/integrations/sync";
import { riceviWebhook } from "@/server/integrations/webhooks";
import { inviaOrdine, lavoroOrdine, statoInvio, tentaInvio } from "@/server/integrations/ordini";
import { fornitoreIntegrazione, ordineDaComanda, riferimentoComanda } from "@/server/integrations/fornitore-integrazione";
import { dettaglioPerLocale, catalogoPerLocale } from "@/server/integrations/vista";
import { leggiSegreti } from "@/server/integrations/credenziali";
import { FIXTURE } from "./fixture-cassa-in-cloud";

/**
 * **Cassa in Cloud dentro la piattaforma, contro il database vero.**
 *
 * L'adattatore è quello vero; il fornitore no: un server finto, costruito
 * sulle forme della documentazione, con **una chiave per locale**, e guasti
 * comandabili (giù, lento, limiti, chiave revocata). Tutto il resto — servizio,
 * cifratura, mappature, sincronizzazione, webhook, coda, invio degli ordini —
 * è il codice che girerà in produzione.
 *
 * Quello che queste prove NON dicono: che Cassa in Cloud risponda davvero
 * così. Nessuna chiamata esce da qui.
 */

const db = new PrismaClient();
const PREFISSO = "test-cic-";
const SLUG = "cassa-in-cloud";
const ORIGINE = "https://app.foodtech.test";

if (!/dev|test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Queste prove scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/* -------------------------------------------------------------------------- */
/*  Il Cassa in Cloud finto                                                   */
/* -------------------------------------------------------------------------- */

type Guasto = null | "503" | "429" | "timeout" | "chiave_revocata";
const cassa = {
  /** chiave → punti vendita abilitati */
  chiavi: new Map<string, number[]>([
    ["chiave-A", [101, 102]],
    ["chiave-B", [201]],
  ]),
  token: new Map<string, string>(), // token → chiave
  ordini: new Map<string, { id: string; externalId: string; idTable: string; idSalesPoint: number }>(),
  guasto: null as Guasto,
  guastoSoloOrdini: false,
  chiamate: [] as { metodo: string; percorso: string; auth: string | null }[],
  postOrdini: 0,
  /** Ritardo della creazione, per far sovrapporre invii concorrenti. */
  ritardoOrdiniMs: 0,
};

function risposta(status: number, corpo: unknown, intestazioni: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...intestazioni } });
}

const fetchFinto = (async (url: string, init: RequestInit) => {
  const u = new URL(url);
  const metodo = init.method ?? "GET";
  const h = (init.headers ?? {}) as Record<string, string>;
  cassa.chiamate.push({ metodo, percorso: u.pathname, auth: h.Authorization ?? null });

  if (u.pathname === "/apikey/token") {
    const { apiKey } = JSON.parse(String(init.body)) as { apiKey: string };
    if (!cassa.chiavi.has(apiKey)) return risposta(401, { error: "invalid api key" });
    const t = `tok-${apiKey}-${cassa.token.size}`;
    cassa.token.set(t, apiKey);
    return risposta(200, { access_token: t, expires_in: 3600, token_type: "Bearer" });
  }

  const guastoAttivo = cassa.guasto && (!cassa.guastoSoloOrdini || u.pathname.startsWith("/documents/orders"));
  if (guastoAttivo) {
    if (cassa.guasto === "503") return risposta(503, {});
    if (cassa.guasto === "429") return risposta(429, {}, { "retry-after": "30" });
    if (cassa.guasto === "timeout") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  }
  if (h["X-Version"] !== "1.0.0") return risposta(400, { error: "InvalidParams" });
  const chiave = cassa.token.get((h.Authorization ?? "").replace("Bearer ", ""));
  if (!chiave || (cassa.guasto === "chiave_revocata" && chiave === "chiave-A")) return risposta(401, {});
  const sedi = cassa.chiavi.get(chiave)!;
  const richieste = JSON.parse(u.searchParams.get("idsSalesPoint") ?? "[]") as number[];
  if (richieste.some((s) => !sedi.includes(s))) return risposta(403, { error: "InvalidIdSalesPoint" });

  switch (`${metodo} ${u.pathname}`) {
    case "GET /salespoint":
      return risposta(200, {
        salesPoint: FIXTURE.salespoint.salesPoint.filter((s) => sedi.includes(s.id)).concat(
          sedi.includes(201) ? [{ id: 201, name: "Roma EUR", city: "Roma", country: "IT" }] : [],
        ),
        totalCount: sedi.length,
      });
    case "GET /risto/rooms": return risposta(200, FIXTURE.rooms);
    case "GET /risto/tables": return risposta(200, FIXTURE.tables);
    case "GET /categories": return risposta(200, FIXTURE.categories);
    case "GET /products": return risposta(200, FIXTURE.products);
    case "GET /salesmodes": return risposta(200, FIXTURE.salesModes);
    case "GET /taxes": return risposta(200, FIXTURE.taxes);
    case "POST /documents/orders/batch": {
      cassa.postOrdini++;
      if (cassa.ritardoOrdiniMs) await new Promise((r) => setTimeout(r, cassa.ritardoOrdiniMs));
      const corpo = JSON.parse(String(init.body)) as { create: { externalId: string; idTable: string; document: { idSalesPoint: number } }[] };
      const o = corpo.create[0]!;
      // Il vincolo di unicità documentato su externalId.
      if (cassa.ordini.has(o.externalId)) return risposta(400, { error: "ConflictValue", msg: "externalId" });
      const id = `ord-${cassa.ordini.size + 1}`;
      cassa.ordini.set(o.externalId, { id, externalId: o.externalId, idTable: o.idTable, idSalesPoint: o.document.idSalesPoint });
      return risposta(200, { batchResponse: { createDetails: [{ index: 0, id, externalId: o.externalId }] } });
    }
    case "GET /documents/orders":
      return risposta(200, {
        orders: [...cassa.ordini.values()].map((o) => ({ ...FIXTURE.ordine(o.externalId, o.id), idTable: o.idTable })),
        totalCount: cassa.ordini.size,
      });
    default:
      return risposta(404, { error: "InvalidId" });
  }
}) as unknown as typeof fetch;

/* -------------------------------------------------------------------------- */
/*  Locali                                                                    */
/* -------------------------------------------------------------------------- */

type Locale = { orgId: string; venueId: string; attore: Attore; tavolo12: string; birra: string; nome: string };

async function creaLocale(nome: string, orgId?: string): Promise<Locale> {
  const org = orgId ?? (await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } })).id;
  const venue = await db.venue.create({ data: { orgId: org, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const tavolo = await db.table.create({ data: { venueId: venue.id, label: "12" } });
  const categoria = await db.menuCategory.create({ data: { venueId: venue.id, name: "Bevande" } });
  const birra = await db.menuItem.create({ data: { venueId: venue.id, categoryId: categoria.id, name: "Birra", priceCents: 500 } });
  return { orgId: org, venueId: venue.id, attore: { venueId: venue.id, orgId: org, userId: `u-${nome}` }, tavolo12: tavolo.id, birra: birra.id, nome: venue.name };
}

let A: Locale;
let B: Locale;
const envPrima = { chiave: process.env.CHIAVE_CIFRATURA, segreto: process.env.NEXTAUTH_SECRET };

async function pulisci() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: PREFISSO } }, select: { id: true } });
  const venues = await db.venue.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { id: true } });
  await db.webhookEvent.deleteMany({ where: { provider: `integration:${SLUG}`, venueId: { in: venues.map((v) => v.id) } } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
}

beforeAll(async () => {
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 9).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  usaFetchPerProve(fetchFinto);
  await pulisci();
  A = await creaLocale("a");
  B = await creaLocale("b");
  // Anteprime: si installano solo con l'accesso beta concesso da Foodtech (certificazione/accesso.ts).
  for (const l of [A, B]) await impostaAccessoBeta({ venueId: l.venueId, slug: SLUG, abilitato: true, email: "prove@foodtech.test" });
});

afterAll(async () => {
  await pulisci();
  usaFetchPerProve(undefined);
  process.env.CHIAVE_CIFRATURA = envPrima.chiave;
  process.env.NEXTAUTH_SECRET = envPrima.segreto;
  await db.$disconnect();
});

beforeEach(() => {
  cassa.guasto = null;
  cassa.guastoSoloOrdini = false;
  cassa.ritardoOrdiniMs = 0;
});

const inst = async (l: Locale) => (await trovaInstallazione(l.venueId, SLUG))!;
const sync = async (l: Locale) =>
  eseguiSincronizzazione({ installationId: (await inst(l)).id, venueId: l.venueId, operazione: "full", trigger: "MANUAL" });

async function finoAdAttiva(l: Locale, chiave: string, sede: string) {
  await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, { apiKey: chiave });
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { idSalesPoint: sede } });
  const p = await provaConnessione(l.attore, SLUG, ORIGINE);
  expect(p.ok).toBe(true);
  await salvaCapacita(l.attore, SLUG, ["locations", "tables", "menu", "tax_rates", "orders.write"], ORIGINE);
  await attiva(l.attore, SLUG, ORIGINE);
}

/* -------------------------------------------------------------------------- */

describe("installazione con chiave API", () => {
  it("una chiave non valida non si salva, e la frase è quella di Cassa in Cloud", async () => {
    await installa(A.attore, SLUG);
    await expect(connettiConCampi(A.attore, SLUG, { apiKey: "chiave-inventata" })).rejects.toMatchObject({
      code: "integration_auth_invalid",
      message: expect.stringMatching(/API Key non valida o non autorizzata/),
    });
    expect(await db.integrationCredential.count({ where: { installationId: (await inst(A)).id } })).toBe(0);
    expect((await inst(A)).status).toBe("INSTALLING");
  });

  it("chiave valida → punti vendita reali della chiave → prova → attiva", async () => {
    await connettiConCampi(A.attore, SLUG, { apiKey: "chiave-A" });
    const i = await inst(A);
    expect(i.status).toBe("NEEDS_CONFIGURATION");
    // Chiave e token cifrati, legati all'installazione.
    const riga = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: i.id } });
    expect(riga.secretCiphertext).not.toContain("chiave-A");
    expect(riga.kind).toBe("API_KEY");
    expect(riga.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3500_000);

    await salvaConfigurazione(A.attore, SLUG, { configurazione: { idSalesPoint: "101" }, etichette: { idSalesPoint: "Torino Centro" } });
    const p = await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(p).toMatchObject({ ok: true, sede: "Torino Centro" });
    await salvaCapacita(A.attore, SLUG, ["locations", "tables", "menu", "tax_rates", "orders.write"], ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
    expect((await inst(A)).status).toBe("ACTIVE");
    expect((await inst(A)).externalLocationId).toBe("101");
  });

  it("un punto vendita non abilitato per la chiave: la prova fallisce con «configurazione da rivedere»", async () => {
    await installa(B.attore, SLUG);
    await connettiConCampi(B.attore, SLUG, { apiKey: "chiave-B" });
    await salvaConfigurazione(B.attore, SLUG, { configurazione: { idSalesPoint: "101" } });
    const p = await provaConnessione(B.attore, SLUG, ORIGINE);
    expect(p).toMatchObject({ ok: false, azione: "configura" });
    await salvaConfigurazione(B.attore, SLUG, { configurazione: { idSalesPoint: "201" } });
    expect(await provaConnessione(B.attore, SLUG, ORIGINE)).toMatchObject({ ok: true });
    await salvaCapacita(B.attore, SLUG, ["locations", "tables", "menu", "tax_rates", "orders.write"], ORIGINE);
    await attiva(B.attore, SLUG, ORIGINE);
  });
});

describe("sincronizzazione e mappature", () => {
  it("l'importazione iniziale scrive solo mappature, e abbina il certo", async () => {
    const e = await sync(A);
    expect(e).toMatchObject({ eseguita: true, riuscita: true });
    const i = await inst(A);
    const mappe = await db.externalEntityMapping.findMany({ where: { installationId: i.id } });
    const per = (t: string) => mappe.filter((m) => m.entityType === t);
    expect(per("TABLE").find((m) => m.externalId === "tab-12")!.internalId).toBe(A.tavolo12);
    expect(per("TABLE").find((m) => m.externalId === "tab-99")!.internalId).toBeNull();
    expect(per("PRODUCT").find((m) => m.externalId === "prod-2")!.internalId).toBe(A.birra);
    expect(per("PRICE_LIST")).toHaveLength(1);
    expect(per("TAX_RATE")).toHaveLength(1);
    // Nessun dato Foodtech toccato: il piatto resta com'era.
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: A.birra } })).priceCents).toBe(500);
  });

  it("due sincronizzazioni insieme: ne parte una", async () => {
    const [x, y] = await Promise.all([sync(A), sync(A)]);
    expect([x, y].filter((r) => r.eseguita)).toHaveLength(1);
  });
});

describe("isolamento fra locali", () => {
  it("ogni locale parla con la sua chiave, e vede solo i suoi punti vendita", async () => {
    cassa.chiamate = [];
    await sync(A);
    await sync(B);
    const chiavi = new Set(cassa.chiamate.filter((c) => c.auth).map((c) => cassa.token.get(c.auth!.replace("Bearer ", ""))));
    expect(chiavi).toEqual(new Set(["chiave-A", "chiave-B"]));
    expect((await inst(A)).externalLocationId).toBe("101");
    expect((await inst(B)).externalLocationId).toBe("201");
    expect(await leggiSegreti({ id: (await inst(A)).id, venueId: B.venueId })).toBeNull();
  });

  it("chiave e segreto del webhook non arrivano mai al browser", async () => {
    await aggiornaSegretoWebhook(A.attore, SLUG, "segreto-webhook-A");
    const d = await dettaglioPerLocale(A.venueId, SLUG, true, { origine: ORIGINE });
    const c = await catalogoPerLocale(A.venueId, { stripe: false });
    const tutto = JSON.stringify([d, c]);
    for (const s of ["chiave-A", "segreto-webhook-A", "tok-chiave-A", "secretCiphertext"]) expect(tutto, s).not.toContain(s);
    // L'indirizzo del webhook sì (va incollato nel pannello), e dice se il segreto c'è.
    expect(d!.webhook).toEqual({
      indirizzo: `${ORIGINE}/api/integrations/webhooks/${SLUG}/${(await inst(A)).webhookKey}`,
      segretoPresente: true,
    });
    // Senza il permesso di configurare, niente indirizzo.
    expect((await dettaglioPerLocale(A.venueId, SLUG, false))!.webhook).toBeNull();
  });
});

describe("webhook firmati", () => {
  async function manda(l: Locale, operazione: string, corpo: object, segreto: string) {
    const testo = JSON.stringify(corpo);
    return riceviWebhook({
      slug: SLUG,
      chiave: (await inst(l)).webhookKey,
      corpo: testo,
      intestazioni: new Headers({
        "x-cn-operation": operazione,
        "x-cn-signature": createHmac("sha1", segreto).update(testo).digest("hex"),
      }),
    });
  }

  it("lo stesso evento ritentato tre volte si lavora una volta", async () => {
    const corpo = { ...FIXTURE.ordine("ft-da-cassa", "ord-z"), document: { idSalesPoint: 101 } };
    const esiti = await Promise.all([1, 2, 3].map(() => manda(A, "ORDER/EDIT", corpo, "segreto-webhook-A")));
    expect(esiti.filter((e) => "ripetuto" in e.corpo && e.corpo.ripetuto)).toHaveLength(2);
    const i = await inst(A);
    expect(await db.webhookEvent.count({ where: { installationId: i.id, eventType: "ORDER/EDIT" } })).toBe(1);
  });

  it("firma con un altro segreto: 401; evento di un altro punto vendita: conservato e ignorato", async () => {
    expect((await manda(A, "ORDER/EDIT", FIXTURE.ordine("x"), "segreto-sbagliato")).status).toBe(401);
    const r = await manda(A, "ORDER/EDIT", { ...FIXTURE.ordine("y"), document: { idSalesPoint: 102 } }, "segreto-webhook-A");
    expect(r.corpo).toMatchObject({ ignorato: "sede_diversa" });
  });

  it("un prodotto cambiato in cassa chiede una sincronizzazione del menu, sulla coda di sempre", async () => {
    const r = await manda(A, "PRODUCT/EDIT", { id: "prod-1", idSalesPoint: null }, "segreto-webhook-A");
    expect(r.status).toBe(200);
    const i = await inst(A);
    const lavoro = await db.backgroundJob.findFirst({ where: { dedupeKey: `integration.sync:${i.id}:menu` } });
    expect(lavoro).not.toBeNull();
    expect((lavoro!.payload as { trigger: string }).trigger).toBe("WEBHOOK");
  });
});

describe("ordini: idempotenza, cassa giù, riprova", () => {
  const ordineDi = (riferimento: string) => ({
    riferimento,
    tavolo: "12",
    tavoloExternalId: "tab-12",
    coperti: 2,
    cliente: null,
    righe: [{ codiceProdotto: "var-media", nome: "Birra", quantita: 2, prezzoUnitarioCents: 500, note: null }],
    nota: null,
  });

  it("inviato due volte, nasce un ordine solo", async () => {
    const i = await inst(A);
    const prima = cassa.postOrdini;
    const r1 = await inviaOrdine(i, "comanda-1", ordineDi("ft-comanda-1"));
    const r2 = await inviaOrdine(i, "comanda-1", ordineDi("ft-comanda-1"));
    expect(r1).toMatchObject({ stato: "SYNCED", giaInviato: false });
    expect(r2).toMatchObject({ stato: "SYNCED", giaInviato: true, idEsterno: (r1 as { idEsterno: string }).idEsterno });
    expect(cassa.postOrdini - prima).toBe(1);
  });

  it("tre invii contemporanei della stessa comanda: una sola chiamata alla cassa", async () => {
    const i = await inst(A);
    cassa.ritardoOrdiniMs = 150;
    const prima = cassa.postOrdini;
    await Promise.all([1, 2, 3].map(() => inviaOrdine(i, "comanda-2", ordineDi("ft-comanda-2"))));
    expect(cassa.postOrdini - prima).toBe(1);
    expect([...cassa.ordini.keys()].filter((k) => k === "ft-comanda-2")).toHaveLength(1);
  });

  it("cassa giù: la comanda resta in attesa, la coda riprova, e poi arriva — una volta", async () => {
    const i = await inst(A);
    cassa.guasto = "503";
    cassa.guastoSoloOrdini = true;
    const r = await inviaOrdine(i, "comanda-3", ordineDi("ft-comanda-3"));
    expect(r).toEqual({ stato: "PENDING_SYNC", codiceErrore: "PROVIDER_UNAVAILABLE" });
    const riga = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-comanda-3" } });
    const lavoro = await db.backgroundJob.findUniqueOrThrow({ where: { dedupeKey: `integration.order:${riga.id}` } });
    expect(lavoro.runAt.getTime()).toBeGreaterThan(Date.now());

    // La coda riprova mentre è ancora giù: solleva, per riprovare ancora.
    const job = { id: lavoro.id, kind: lavoro.kind, attempts: 1, maxAttempts: 8, yields: 0, venueId: A.venueId };
    await expect(lavoroOrdine(lavoro.payload, job)).rejects.toThrow(/ordine_in_attesa/);

    // La cassa torna: il tentativo successivo la manda.
    cassa.guasto = null;
    await lavoroOrdine(lavoro.payload, { ...job, attempts: 2 });
    expect(await statoInvio(i, "ft-comanda-3")).toMatchObject({ stato: "SYNCED", tentativi: 3 });
    expect([...cassa.ordini.keys()].filter((k) => k === "ft-comanda-3")).toHaveLength(1);
  });

  it("processo morto dopo l'invio: il tentativo successivo ritrova l'ordine invece di duplicarlo", async () => {
    const i = await inst(A);
    // L'ordine è arrivato alla cassa…
    await inviaOrdine(i, "comanda-4", ordineDi("ft-comanda-4"));
    const riga = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-comanda-4" } });
    // …ma Foodtech è rimasto a «SENDING» da più di due minuti (processo morto).
    const m = riga.metadata as { invio: Record<string, unknown> };
    await db.$executeRaw`UPDATE "ExternalEntityMapping" SET metadata = ${JSON.stringify({ ...m, invio: { ...m.invio, stato: "SENDING", idEsterno: null } })}::jsonb, "updatedAt" = now() - interval '5 minutes' WHERE id = ${riga.id}`;
    const prima = cassa.ordini.size;
    const r = await tentaInvio(A.venueId, riga.id);
    expect(r).toMatchObject({ stato: "SYNCED", idEsterno: cassa.ordini.get("ft-comanda-4")!.id });
    expect(cassa.ordini.size).toBe(prima);
  });

  it("un errore definitivo non si riprova all'infinito", async () => {
    const i = await inst(A);
    const r = await inviaOrdine(i, "comanda-5", { ...ordineDi("ft-comanda-5"), tavoloExternalId: null });
    expect(r).toMatchObject({ stato: "FAILED", codiceErrore: "INVALID_CONFIGURATION" });
  });

  it("dalla comanda Foodtech all'ordine: tavolo e piatto dalle mappature, riferimento stabile", async () => {
    const i = await inst(A);
    const comanda = {
      comandaId: "cmd-99",
      venueId: A.venueId,
      numero: 1,
      tavolo: "12",
      coperti: 2,
      cameriere: "Luca",
      nota: null,
      invioKey: "k1",
      righe: [{ menuItemId: A.birra, nome: "Birra", quantita: 1, modifiche: [{ kind: "SENZA", label: "Senza schiuma" }], ospite: null, note: null, allergeni: [], notaAllergia: null }],
    };
    const o = await ordineDaComanda(i, comanda);
    expect(o).toMatchObject({
      riferimento: riferimentoComanda("cmd-99"),
      tavoloExternalId: "tab-12",
      righe: [{ codiceProdotto: "var-media", quantita: 1, note: "Senza schiuma" }],
    });

    const f = fornitoreIntegrazione({ ...i, nome: "Cassa in Cloud" });
    const e1 = await f.invia(comanda);
    const e2 = await f.invia(comanda);
    expect(e1).toMatchObject({ ok: true });
    expect(e2).toEqual(e1);
    expect([...cassa.ordini.keys()].filter((k) => k === "ft-cmd-99")).toHaveLength(1);

    // Un piatto non multivariante non parte: la riga documentata chiede una variante.
    const semplice = { ...comanda, comandaId: "cmd-100", righe: [{ ...comanda.righe[0]!, menuItemId: "non-abbinato" }] };
    expect(await f.invia(semplice)).toMatchObject({ ok: false, errore: "INVALID_CONFIGURATION" });
  });
});

describe("quando Cassa in Cloud non collabora", () => {
  it("giù o lenta: la sincronizzazione fallisce, l'integrazione resta attiva e «da controllare»", async () => {
    for (const g of ["503", "timeout", "429"] as const) {
      cassa.guasto = g;
      const e = await sync(A);
      expect(e).toMatchObject({ eseguita: true, riuscita: false });
      const i = await inst(A);
      expect(i.status, g).toBe("ACTIVE");
      expect(i.healthStatus, g).toBe("DEGRADED");
    }
    cassa.guasto = null;
    await sync(A);
    expect((await inst(A)).healthStatus).toBe("HEALTHY");
  });

  it("chiave revocata: «richiede attenzione», con la frase di Cassa in Cloud; poi si reinserisce", async () => {
    cassa.guasto = "chiave_revocata";
    cassa.chiavi.set("chiave-A-vecchia", [101]);
    const e = await sync(A);
    expect(e).toMatchObject({ eseguita: true, riuscita: false });
    const i = await inst(A);
    expect(i.status).toBe("REAUTH_REQUIRED");
    expect(i.healthMessage).toMatch(/chiave API non è più autorizzata|non riconosce la chiave/);

    cassa.guasto = null;
    await connettiConCampi(A.attore, SLUG, { apiKey: "chiave-A" });
    await provaConnessione(A.attore, SLUG, ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
    expect((await inst(A)).status).toBe("ACTIVE");
  });
});

describe("disattivare, disinstallare, reinstallare", () => {
  it("disattivata non sincronizza e non riceve ordini; riattivata passa da una prova", async () => {
    await disattiva(A.attore, SLUG);
    expect(await sync(A)).toEqual({ eseguita: false, motivo: "non_attiva" });
    await expect(inviaOrdine(await inst(A), "c", { riferimento: "ft-x", tavolo: null, coperti: null, cliente: null, righe: [], nota: null })).rejects.toMatchObject({ codice: "INVALID_CONFIGURATION" });
    await riattiva(A.attore, SLUG, ORIGINE);
    expect((await inst(A)).status).toBe("ACTIVE");
  });

  it("disinstallata: via chiave, segreto e mappature; reinstallata da zero con un'altra chiave", async () => {
    const prima = await inst(A);
    await disinstalla(A.attore, SLUG, ORIGINE);
    expect(await db.integrationCredential.count({ where: { installationId: prima.id } })).toBe(0);
    expect(await db.externalEntityMapping.count({ where: { installationId: prima.id } })).toBe(0);
    expect((await inst(B)).status).toBe("ACTIVE");

    cassa.chiavi.set("chiave-A2", [102]);
    await finoAdAttiva(A, "chiave-A2", "102");
    const dopo = await inst(A);
    expect(dopo.id).toBe(prima.id);
    expect(dopo.externalLocationId).toBe("102");
    expect(dopo.webhookKey).not.toBe(prima.webhookKey);
  });
});
