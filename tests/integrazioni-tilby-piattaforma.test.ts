import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
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
import { inviaOrdine, lavoroOrdine, statoInvio } from "@/server/integrations/ordini";
import { fornitoreIntegrazione } from "@/server/integrations/fornitore-integrazione";
import { dettaglioPerLocale, catalogoPerLocale } from "@/server/integrations/vista";
import { leggiSegreti } from "@/server/integrations/credenziali";
import { uuidVenditaDi } from "@/server/integrations/adapters/tilby";
import { TILBY } from "./fixture-tilby";

/**
 * **Tilby dentro la piattaforma, contro il database vero.**
 *
 * L'adattatore è quello vero; Tilby no: un server finto costruito sugli schemi
 * del reference, con **un token statico per negozio** (come documentato: il
 * token è legato a un solo shop), l'unicità dell'`uuid` delle vendite, i
 * webhook per coppia entità/evento e guasti comandabili. Tutto il resto è il
 * codice che girerà in produzione. Nessuna chiamata esce da qui.
 */

const db = new PrismaClient();
const PREFISSO = "test-tilby-";
const SLUG = "tilby";
const ORIGINE = "https://app.foodtech.test";
const CAPACITA = ["locations", "tables", "menu", "tax_rates", "payment_methods", "orders.read", "orders.write"];

if (!/dev|test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Queste prove scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/* -------------------------------------------------------------------------- */
/*  Il Tilby finto                                                            */
/* -------------------------------------------------------------------------- */

type Guasto = null | "503" | "429" | "timeout" | "token_revocato";
type Vendita = Record<string, unknown> & { id: number; uuid: string; shop: number; status: string; sale_items: Record<string, unknown>[] };
const tilbyFinto = {
  /** token → negozio */
  token: new Map<string, { id: number; name: string }>([
    ["tok-A", { id: 345, name: "Trattoria Tilby" }],
    ["tok-B", { id: 901, name: "Osteria Due" }],
  ]),
  vendite: new Map<number, Vendita>(),
  webhook: [] as { id: number; shop: number; entity_type: string; event_type: string; url: string }[],
  guasto: null as Guasto,
  guastoSoloVendite: false,
  chiamate: [] as { metodo: string; percorso: string; token: string | null }[],
  post: 0,
  put: 0,
  ritardoMs: 0,
};

function risposta(status: number, corpo: unknown, intestazioni: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...intestazioni } });
}

const fetchFinto = (async (url: string, init: RequestInit) => {
  const u = new URL(url);
  const percorso = u.pathname.replace(/^\/v2/, "");
  const metodo = init.method ?? "GET";
  const h = (init.headers ?? {}) as Record<string, string>;
  const token = (h.Authorization ?? "").replace("Bearer ", "") || null;
  tilbyFinto.chiamate.push({ metodo, percorso, token });

  const guasto = tilbyFinto.guasto && (!tilbyFinto.guastoSoloVendite || percorso.startsWith("/sales"));
  if (guasto) {
    if (tilbyFinto.guasto === "503") return risposta(503, {});
    if (tilbyFinto.guasto === "429") return risposta(429, {}, { "retry-after": "30" });
    if (tilbyFinto.guasto === "timeout") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  }
  const shop = token ? tilbyFinto.token.get(token) : undefined;
  if (!shop || (tilbyFinto.guasto === "token_revocato" && token === "tok-A")) return risposta(401, "Unauthorized");
  const corpo = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  const venditaId = /^\/sales\/(\d+)$/.exec(percorso)?.[1];

  if (venditaId) {
    const v = tilbyFinto.vendite.get(Number(venditaId));
    if (!v || v.shop !== shop.id) return risposta(404, "Not found");
    if (metodo === "GET") return risposta(200, v);
    if (metodo === "PUT") {
      tilbyFinto.put++;
      Object.assign(v, corpo, { id: v.id, shop: v.shop });
      return risposta(200, v);
    }
    if (metodo === "DELETE") {
      v.deleted_at = new Date().toISOString();
      return risposta(200, {});
    }
  }

  switch (`${metodo} ${percorso}`) {
    case "GET /sessions/me": return risposta(200, { ...TILBY.sessione, shop: { ...TILBY.sessione.shop, id: shop.id, name: shop.name } });
    case "GET /rooms": return risposta(200, TILBY.rooms);
    case "GET /categories": return risposta(200, TILBY.categories);
    case "GET /items": return risposta(200, TILBY.items);
    case "GET /vat": return risposta(200, TILBY.vat);
    case "GET /payment_methods": return risposta(200, TILBY.payment_methods);
    case "GET /customers": return risposta(200, TILBY.customers);
    case "POST /sales": {
      tilbyFinto.post++;
      if (tilbyFinto.ritardoMs) await new Promise((r) => setTimeout(r, tilbyFinto.ritardoMs));
      // «uuid must be unique»
      if ([...tilbyFinto.vendite.values()].some((v) => v.uuid === corpo!.uuid)) return risposta(422, "Unprocessable Entity");
      const v = { ...(corpo as object), id: tilbyFinto.vendite.size + 100, shop: shop.id } as Vendita;
      tilbyFinto.vendite.set(v.id, v);
      return risposta(201, v);
    }
    case "GET /sales": {
      const filtri = [...u.searchParams].filter(([k]) => ["uuid", "external_id", "status"].includes(k));
      return risposta(200, [...tilbyFinto.vendite.values()].filter((v) => v.shop === shop.id && filtri.every(([k, x]) => String(v[k]) === x)));
    }
    case "GET /webhooks": return risposta(200, tilbyFinto.webhook.filter((w) => w.shop === shop.id));
    case "POST /webhooks": {
      const c = corpo as { entity_type: string; event_type: string; url: string };
      // Uno per coppia entità/evento per negozio.
      if (tilbyFinto.webhook.some((w) => w.shop === shop.id && w.entity_type === c.entity_type && w.event_type === c.event_type)) return risposta(409, "exists");
      const w = { ...c, id: tilbyFinto.webhook.length + 1 + Math.floor(Math.random() * 1e6), shop: shop.id };
      tilbyFinto.webhook.push(w);
      return risposta(200, { result: { id: w.id } });
    }
    case "DELETE /webhooks": {
      tilbyFinto.webhook = tilbyFinto.webhook.filter((w) => !(w.shop === shop.id && w.id === Number(corpo!.id)));
      return risposta(200, { result: "ok" });
    }
    default:
      return risposta(404, "Not found");
  }
}) as unknown as typeof fetch;

const venditaPer = (riferimento: string) => [...tilbyFinto.vendite.values()].find((v) => v.external_id === riferimento);

/* -------------------------------------------------------------------------- */
/*  Locali                                                                    */
/* -------------------------------------------------------------------------- */

type Locale = { orgId: string; venueId: string; attore: Attore; tavoloB2: string; antipasto: string; tiramisu: string; caffe: string };

async function creaLocale(nome: string): Promise<Locale> {
  const org = await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const venue = await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const tavolo = await db.table.create({ data: { venueId: venue.id, label: "B2" } });
  const cat = await db.menuCategory.create({ data: { venueId: venue.id, name: "Cucina" } });
  const piatto = (name: string, priceCents: number) => db.menuItem.create({ data: { venueId: venue.id, categoryId: cat.id, name, priceCents } });
  const [a, t, c] = await Promise.all([piatto("Antipasto della casa", 950), piatto("Tiramisù", 600), piatto("Caffè", 150)]);
  return { orgId: org.id, venueId: venue.id, attore: { venueId: venue.id, orgId: org.id, userId: `u-${nome}` }, tavoloB2: tavolo.id, antipasto: a.id, tiramisu: t.id, caffe: c.id };
}

let A: Locale;
let B: Locale;
const envPrima = { chiave: process.env.CHIAVE_CIFRATURA, segreto: process.env.NEXTAUTH_SECRET, email: process.env.TILBY_WEBHOOK_EMAIL };

async function pulisci() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: PREFISSO } }, select: { id: true } });
  const venues = await db.venue.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { id: true } });
  await db.webhookEvent.deleteMany({ where: { provider: `integration:${SLUG}`, venueId: { in: venues.map((v) => v.id) } } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
}

beforeAll(async () => {
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 7).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  process.env.TILBY_WEBHOOK_EMAIL = "integrazioni@foodtech.test";
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
  if (envPrima.email === undefined) delete process.env.TILBY_WEBHOOK_EMAIL;
  else process.env.TILBY_WEBHOOK_EMAIL = envPrima.email;
  await db.$disconnect();
});

beforeEach(() => {
  tilbyFinto.guasto = null;
  tilbyFinto.guastoSoloVendite = false;
  tilbyFinto.ritardoMs = 0;
});

const inst = async (l: Locale) => (await trovaInstallazione(l.venueId, SLUG))!;
const sync = async (l: Locale) =>
  eseguiSincronizzazione({ installationId: (await inst(l)).id, venueId: l.venueId, operazione: "full", trigger: "MANUAL" });

async function finoAdAttiva(l: Locale, token: string, shopId: string) {
  await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, { token, ambiente: "sandbox" });
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { ambiente: "sandbox", shopId } });
  expect((await provaConnessione(l.attore, SLUG, ORIGINE)).ok).toBe(true);
  await salvaCapacita(l.attore, SLUG, CAPACITA, ORIGINE);
  await attiva(l.attore, SLUG, ORIGINE);
}

const comanda = (l: Locale, id: string, righe: { menuItemId: string; nome: string; quantita: number }[]) => ({
  comandaId: id,
  venueId: l.venueId,
  numero: 1,
  tavolo: "B2",
  coperti: 2,
  cameriere: "Luca",
  nota: null,
  invioKey: `k-${id}`,
  righe: righe.map((r) => ({ ...r, modifiche: [], ospite: null, note: null, allergeni: [], notaAllergia: null })),
});

/* -------------------------------------------------------------------------- */

describe("installazione con token statico", () => {
  it("un token non valido non si salva, e la frase è quella di Tilby", async () => {
    await installa(A.attore, SLUG);
    await expect(connettiConCampi(A.attore, SLUG, { token: "inventato", ambiente: "sandbox" })).rejects.toMatchObject({
      code: "integration_auth_invalid",
      message: expect.stringMatching(/Token Tilby non valido o revocato/),
    });
    expect(await db.integrationCredential.count({ where: { installationId: (await inst(A)).id } })).toBe(0);
  });

  it("token valido → negozio del token → ambiente → prova → attiva, con i webhook registrati", async () => {
    await connettiConCampi(A.attore, SLUG, { token: "tok-A", ambiente: "sandbox" });
    const i = await inst(A);
    expect(i.status).toBe("NEEDS_CONFIGURATION");
    const riga = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: i.id } });
    expect(riga.kind).toBe("TOKEN");
    expect(riga.secretCiphertext).not.toContain("tok-A");
    expect(riga.accessTokenExpiresAt).toBeNull();

    await salvaConfigurazione(A.attore, SLUG, { configurazione: { ambiente: "sandbox", shopId: "345" }, etichette: { shopId: "Trattoria Tilby" } });
    const p = await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(p).toMatchObject({ ok: true });
    await salvaCapacita(A.attore, SLUG, CAPACITA, ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
    const dopo = await inst(A);
    expect(dopo.status).toBe("ACTIVE");
    expect(dopo.externalLocationId).toBe("345");

    const miei = tilbyFinto.webhook.filter((w) => w.shop === 345);
    expect(miei.length).toBeGreaterThan(0);
    expect(new Set(miei.map((w) => w.url))).toEqual(new Set([`${ORIGINE}/api/integrations/webhooks/tilby/${dopo.webhookKey}`]));
    expect(((dopo.metadata as { webhooks: unknown[] }).webhooks).length).toBe(miei.length);
  });

  it("il token di un altro negozio: la prova fallisce con «configurazione da rivedere»", async () => {
    await installa(B.attore, SLUG);
    await connettiConCampi(B.attore, SLUG, { token: "tok-B", ambiente: "production" });
    await salvaConfigurazione(B.attore, SLUG, { configurazione: { ambiente: "production", shopId: "345" } });
    expect(await provaConnessione(B.attore, SLUG, ORIGINE)).toMatchObject({ ok: false, azione: "configura" });
    await salvaConfigurazione(B.attore, SLUG, { configurazione: { ambiente: "production", shopId: "901" } });
    expect(await provaConnessione(B.attore, SLUG, ORIGINE)).toMatchObject({ ok: true });
    await salvaCapacita(B.attore, SLUG, CAPACITA, ORIGINE);
    await attiva(B.attore, SLUG, ORIGINE);
  });
});

describe("importazione iniziale e mappature", () => {
  it("scrive solo mappature, abbina il certo, e non tocca i dati Foodtech", async () => {
    expect(await sync(A)).toMatchObject({ eseguita: true, riuscita: true });
    const mappe = await db.externalEntityMapping.findMany({ where: { installationId: (await inst(A)).id } });
    const per = (t: string) => mappe.filter((m) => m.entityType === t);
    expect(per("TABLE").find((m) => m.externalId === "1")!.internalId).toBe(A.tavoloB2);
    expect(per("TABLE").find((m) => m.externalId === "2")!.internalId).toBeNull();
    expect(per("PRODUCT").find((m) => m.externalId === "334")!.internalId).toBe(A.antipasto);
    expect(per("PRODUCT").find((m) => m.externalId === "334")!.metadata).toMatchObject({ repartoId: "10", aliquota: 10, prezzoCents: 900 });
    expect(per("PRICE_LIST").map((m) => m.externalId).sort()).toEqual(["price1", "price2"]);
    expect(per("PAYMENT_METHOD")).toHaveLength(2);
    // Il prezzo Foodtech (9,50) resta il suo, anche se Tilby dice 9,00.
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: A.antipasto } })).priceCents).toBe(950);
  });

  it("due sincronizzazioni insieme: ne parte una", async () => {
    const [x, y] = await Promise.all([sync(A), sync(A)]);
    expect([x, y].filter((r) => r.eseguita)).toHaveLength(1);
  });
});

describe("isolamento fra locali", () => {
  it("ogni locale parla con il suo token, e i segreti non attraversano i locali", async () => {
    await sync(B);
    tilbyFinto.chiamate = [];
    await sync(A);
    await sync(B);
    expect(new Set(tilbyFinto.chiamate.map((c) => c.token))).toEqual(new Set(["tok-A", "tok-B"]));
    expect(await leggiSegreti({ id: (await inst(A)).id, venueId: B.venueId })).toBeNull();
    const mappeB = await db.externalEntityMapping.findMany({ where: { venueId: B.venueId } });
    const idB = (await inst(B)).id;
    expect(mappeB.length).toBeGreaterThan(0);
    expect(mappeB.every((m) => m.installationId === idB)).toBe(true);
  });

  it("il token non arriva mai al browser", async () => {
    const d = await dettaglioPerLocale(A.venueId, SLUG, true, { origine: ORIGINE });
    const c = await catalogoPerLocale(A.venueId, { stripe: false });
    const tutto = JSON.stringify([d, c]);
    for (const s of ["tok-A", "secretCiphertext", "accessToken"]) expect(tutto, s).not.toContain(s);
  });
});

describe("la comanda e le aggiunte allo stesso conto", () => {
  it("20:10 prima comanda a B2 → una vendita aperta con stampa automatica; ripetuta, resta una", async () => {
    const i = await inst(A);
    const f = fornitoreIntegrazione({ ...i, nome: "Tilby" });
    const c1 = comanda(A, "cmd-1", [{ menuItemId: A.antipasto, nome: "Antipasto della casa", quantita: 2 }]);
    const e1 = await f.invia(c1);
    expect(e1).toMatchObject({ ok: true });
    expect(await f.invia(c1)).toEqual(e1);
    const v = venditaPer("ft-cmd-1")!;
    expect(v).toMatchObject({ status: "open", auto_print_order: true, table_id: 1, room_id: 1, uuid: uuidVenditaDi("ft-cmd-1") });
    expect(v.sale_items.map((r) => [r.item_id, r.quantity, r.exit])).toEqual([[334, 2, 1]]);
    expect([...tilbyFinto.vendite.values()].filter((x) => x.external_id === "ft-cmd-1")).toHaveLength(1);
  });

  it("20:35 B2 aggiunge 2 dessert e 2 caffè → PUT sulla stessa vendita, uscita 2, righe vecchie intatte", async () => {
    const i = await inst(A);
    const f = fornitoreIntegrazione({ ...i, nome: "Tilby" });
    const post = tilbyFinto.post;
    const c2 = comanda(A, "cmd-2", [
      { menuItemId: A.tiramisu, nome: "Tiramisù", quantita: 2 },
      { menuItemId: A.caffe, nome: "Caffè", quantita: 2 },
    ]);
    expect(await f.invia(c2)).toMatchObject({ ok: true });
    // Ripetuta: niente piatti doppi.
    await f.invia(c2);
    expect(tilbyFinto.post).toBe(post);
    const v = venditaPer("ft-cmd-1")!;
    expect(v.sale_items.map((r) => [r.item_id, r.quantity, r.exit])).toEqual([[334, 2, 1], [335, 2, 2], [336, 2, 2]]);
    const m = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-2" } });
    expect(m.metadata).toMatchObject({ aggiuntaA: "ft-cmd-1", invio: { stato: "SYNCED" } });
  });

  it("il conto chiuso in cassa (webhook sales/CLOSED): la comanda dopo apre una vendita nuova", async () => {
    const i = await inst(A);
    const v = venditaPer("ft-cmd-1")!;
    v.status = "closed";
    const r = await riceviWebhook({
      slug: SLUG,
      chiave: i.webhookKey,
      corpo: JSON.stringify(TILBY.notifica({ notification_uuid: "n-chiusura-1", entities: [{ id: v.id, external_id: "ft-cmd-1", status: "closed" }] })),
      intestazioni: new Headers({ "content-type": "application/json" }),
    });
    expect(r.status).toBe(200);
    const base = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-1" } });
    expect(base.metadata).toMatchObject({ stato: "CLOSED" });

    const f = fornitoreIntegrazione({ ...i, nome: "Tilby" });
    expect(await f.invia(comanda(A, "cmd-3", [{ menuItemId: A.caffe, nome: "Caffè", quantita: 1 }]))).toMatchObject({ ok: true });
    expect(venditaPer("ft-cmd-3")).toMatchObject({ status: "open" });
  });

  it("aggiunta mentre la prima comanda è ancora in attesa: aspetta, e non apre un secondo conto", async () => {
    const i = await inst(A);
    tilbyFinto.guasto = "503";
    tilbyFinto.guastoSoloVendite = true;
    // Il tavolo 2 non è abbinato a un tavolo Foodtech: si manda direttamente.
    const base = { riferimento: "ft-base-t2", tavolo: "12", tavoloExternalId: "2", coperti: 2, cliente: null, nota: null,
      righe: [{ codiceProdotto: "335", nome: "Tiramisù", quantita: 1, prezzoUnitarioCents: null, note: null, datiProdotto: { repartoId: "10", aliquota: 10, prezzoCents: 600 } }] };
    expect(await inviaOrdine(i, "base-t2", base)).toMatchObject({ stato: "PENDING_SYNC" });
    tilbyFinto.guasto = null;
    const r = await inviaOrdine(i, "agg-t2", { ...base, riferimento: "ft-agg-t2" }, { aggiuntaA: "ft-base-t2" });
    expect(r).toMatchObject({ stato: "PENDING_SYNC", codiceErrore: "ORDINE_BASE_IN_ATTESA" });
    expect(venditaPer("ft-agg-t2")).toBeUndefined();
  });
});

describe("ordini: idempotenza, Tilby giù, riprova", () => {
  const ordine = (riferimento: string) => ({
    riferimento,
    tavolo: "B2",
    tavoloExternalId: "1",
    coperti: 2,
    cliente: null,
    nota: null,
    righe: [{ codiceProdotto: "336", nome: "Caffè", quantita: 1, prezzoUnitarioCents: null, note: null, datiProdotto: { repartoId: "4", aliquota: 22, prezzoCents: 150 } }],
  });

  it("tre invii contemporanei della stessa comanda: una sola vendita", async () => {
    const i = await inst(A);
    tilbyFinto.ritardoMs = 150;
    const prima = tilbyFinto.post;
    await Promise.all([1, 2, 3].map(() => inviaOrdine(i, "conc-1", ordine("ft-conc-1"))));
    expect(tilbyFinto.post - prima).toBe(1);
    expect([...tilbyFinto.vendite.values()].filter((v) => v.external_id === "ft-conc-1")).toHaveLength(1);
  });

  it("Tilby giù: la comanda resta in attesa, la coda riprova, e poi arriva — una volta", async () => {
    const i = await inst(A);
    tilbyFinto.guasto = "503";
    tilbyFinto.guastoSoloVendite = true;
    expect(await inviaOrdine(i, "giu-1", ordine("ft-giu-1"))).toEqual({ stato: "PENDING_SYNC", codiceErrore: "PROVIDER_UNAVAILABLE" });
    const riga = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-giu-1" } });
    const lavoro = await db.backgroundJob.findUniqueOrThrow({ where: { dedupeKey: `integration.order:${riga.id}` } });
    const job = { id: lavoro.id, kind: lavoro.kind, attempts: 1, maxAttempts: 8, yields: 0, venueId: A.venueId };
    await expect(lavoroOrdine(lavoro.payload, job)).rejects.toThrow(/ordine_in_attesa/);
    tilbyFinto.guasto = null;
    await lavoroOrdine(lavoro.payload, { ...job, attempts: 2 });
    expect(await statoInvio(i, "ft-giu-1")).toMatchObject({ stato: "SYNCED" });
    expect([...tilbyFinto.vendite.values()].filter((v) => v.external_id === "ft-giu-1")).toHaveLength(1);
  });

  it("risposta persa dopo la creazione: il secondo tentativo ritrova la vendita per uuid", async () => {
    const i = await inst(A);
    // La vendita c'è già presso Tilby (creata, risposta mai arrivata).
    tilbyFinto.vendite.set(999, { id: 999, shop: 345, uuid: uuidVenditaDi("ft-persa-1"), external_id: "ft-persa-1", status: "open", sale_items: [] });
    const r = await inviaOrdine(i, "persa-1", ordine("ft-persa-1"));
    expect(r).toMatchObject({ stato: "SYNCED", idEsterno: "999" });
    expect([...tilbyFinto.vendite.values()].filter((v) => v.external_id === "ft-persa-1")).toHaveLength(1);
  });

  it("limiti (429): in attesa, riprovabile — mai perso", async () => {
    const i = await inst(A);
    tilbyFinto.guasto = "429";
    tilbyFinto.guastoSoloVendite = true;
    expect(await inviaOrdine(i, "lim-1", ordine("ft-lim-1"))).toEqual({ stato: "PENDING_SYNC", codiceErrore: "RATE_LIMITED" });
  });
});

describe("webhook", () => {
  const manda = async (l: Locale, corpo: unknown) =>
    riceviWebhook({ slug: SLUG, chiave: (await inst(l)).webhookKey, corpo: JSON.stringify(corpo), intestazioni: new Headers() });

  it("la verifica SUBSCRIBED alla registrazione risponde 200", async () => {
    const r = await manda(A, { type: "SUBSCRIBED", entity_name: "sales", time: "2026-09-23T10:00:00Z", environment_id: "345", client_id: "foodtech" });
    expect(r.status).toBe(200);
  });

  it("la stessa notifica ritentata (nRetry) si lavora una volta", async () => {
    const n = (nRetry: number) => TILBY.notifica({ type: "UPDATED", notification_uuid: "n-dup-1", nRetry, entities: [{ id: 1, external_id: "ft-conc-1", status: "open" }] });
    const esiti = await Promise.all([0, 1, 2].map((k) => manda(A, n(k))));
    expect(esiti.filter((e) => "ripetuto" in e.corpo && e.corpo.ripetuto)).toHaveLength(2);
    expect(await db.webhookEvent.count({ where: { installationId: (await inst(A)).id, providerEventId: { endsWith: "n-dup-1" } } })).toBe(1);
  });

  it("un indirizzo sconosciuto non arriva a nessun locale; un prodotto cambiato accoda il menu", async () => {
    expect((await riceviWebhook({ slug: SLUG, chiave: "chiave-inventata", corpo: "{}", intestazioni: new Headers() })).status).toBe(404);
    const r = await manda(A, TILBY.notifica({ entity_name: "items", type: "UPDATED", notification_uuid: "n-item-1", entities: [{ id: 334 }] }));
    expect(r.status).toBe(200);
    const lavoro = await db.backgroundJob.findFirst({ where: { dedupeKey: `integration.sync:${(await inst(A)).id}:menu` } });
    expect(lavoro).not.toBeNull();
  });

  it("una notifica malformata si rifiuta senza toccare niente", async () => {
    expect((await manda(A, { type: "CREATED", entity_name: "sales" })).status).toBeGreaterThanOrEqual(400);
  });
});

describe("quando Tilby non collabora", () => {
  it("giù, lento, limiti: sincronizzazione fallita, integrazione attiva e «da controllare»", async () => {
    for (const g of ["503", "timeout", "429"] as const) {
      tilbyFinto.guasto = g;
      expect(await sync(A)).toMatchObject({ eseguita: true, riuscita: false });
      const i = await inst(A);
      expect(i.status, g).toBe("ACTIVE");
      expect(i.healthStatus, g).toBe("DEGRADED");
    }
    tilbyFinto.guasto = null;
    await sync(A);
    expect((await inst(A)).healthStatus).toBe("HEALTHY");
  });

  it("token revocato: «richiede attenzione», poi si reinserisce", async () => {
    tilbyFinto.guasto = "token_revocato";
    expect(await sync(A)).toMatchObject({ eseguita: true, riuscita: false });
    expect((await inst(A)).status).toBe("REAUTH_REQUIRED");
    tilbyFinto.guasto = null;
    await connettiConCampi(A.attore, SLUG, { token: "tok-A", ambiente: "sandbox" });
    await provaConnessione(A.attore, SLUG, ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
    expect((await inst(A)).status).toBe("ACTIVE");
  });
});

describe("disattivare, disinstallare, reinstallare", () => {
  it("disattivata non sincronizza e non manda comande; riattivata passa da una prova", async () => {
    await disattiva(A.attore, SLUG);
    expect(await sync(A)).toEqual({ eseguita: false, motivo: "non_attiva" });
    await expect(inviaOrdine(await inst(A), "x", { riferimento: "ft-x", tavolo: null, coperti: null, cliente: null, righe: [], nota: null })).rejects.toMatchObject({ codice: "INVALID_CONFIGURATION" });
    await riattiva(A.attore, SLUG, ORIGINE);
    expect((await inst(A)).status).toBe("ACTIVE");
  });

  it("disinstallata: via token, mappature e webhook presso Tilby; B non se ne accorge", async () => {
    const prima = await inst(A);
    const webhookB = tilbyFinto.webhook.filter((w) => w.shop === 901).length;
    await disinstalla(A.attore, SLUG, ORIGINE);
    expect(await db.integrationCredential.count({ where: { installationId: prima.id } })).toBe(0);
    expect(await db.externalEntityMapping.count({ where: { installationId: prima.id } })).toBe(0);
    expect(tilbyFinto.webhook.filter((w) => w.shop === 345)).toHaveLength(0);
    expect(tilbyFinto.webhook.filter((w) => w.shop === 901)).toHaveLength(webhookB);
    expect((await inst(B)).status).toBe("ACTIVE");
    // Il vecchio indirizzo non porta più da nessuna parte.
    expect((await riceviWebhook({ slug: SLUG, chiave: prima.webhookKey, corpo: "{}", intestazioni: new Headers() })).status).toBe(404);
  });

  it("reinstallata da zero: indirizzo nuovo, webhook nuovi, niente metadati vecchi", async () => {
    const prima = await inst(A);
    await finoAdAttiva(A, "tok-A", "345");
    const dopo = await inst(A);
    expect(dopo.id).toBe(prima.id);
    expect(dopo.webhookKey).not.toBe(prima.webhookKey);
    const miei = tilbyFinto.webhook.filter((w) => w.shop === 345);
    expect(miei.length).toBeGreaterThan(0);
    expect(miei.every((w) => w.url.endsWith(`/${dopo.webhookKey}`))).toBe(true);
    const registrati = (dopo.metadata as { webhooks: { id: string }[] }).webhooks.map((w) => Number(w.id)).sort();
    expect(registrati).toEqual(miei.map((w) => w.id).sort());
  });
});
