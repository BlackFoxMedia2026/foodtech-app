import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/* Le rotte leggono la sessione: qui si decide chi è l'utente. */
const sessione = vi.hoisted(() => ({ superAdmin: null as string | null, venueId: "", orgId: "" }));
vi.mock("@/lib/super-admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/super-admin")>()),
  superAdminCorrente: async () => (sessione.superAdmin ? { ok: true, email: sessione.superAdmin } : { ok: false }),
}));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  const apiError = (status: number, code: string, message: string) => NextResponse.json({ error: code, message }, { status });
  return {
    apiError,
    apiErrorResponse: (err: { httpStatus?: number; code?: string; message?: string; name?: string }) =>
      err.name === "ZodError" ? apiError(422, "validation_failed", "") : apiError(err.httpStatus ?? 500, err.code ?? "errore", err.message ?? ""),
    requireVenueApi: async () => ({
      ok: true,
      venueId: sessione.venueId,
      orgId: sessione.orgId,
      userId: "utente",
      role: "OWNER",
      session: { user: { email: sessione.superAdmin ?? "ristoratore@locale.it" } },
    }),
  };
});
vi.mock("next/headers", () => ({ headers: () => new Headers({ host: "app.foodtech.test", "x-forwarded-proto": "https" }), cookies: () => ({ set() {} }) }));

import { registraVocePerProve, type VoceCatalogo } from "@/server/integrations/registry";
import { registraAdattatorePerProve } from "@/server/integrations/adapters";
import type { IntegrationAdapter, PosIntegrationAdapter } from "@/server/integrations/adapters/tipi";
import {
  attiva,
  connettiConCampi,
  disattiva,
  disinstalla,
  installa,
  provaConnessione,
  revocaSospensione,
  riattiva,
  salvaCapacita,
  salvaConfigurazione,
  sospendi,
  trovaInstallazione,
  usaFetchPerProve,
} from "@/server/integrations/installazioni";
import { eseguiSincronizzazione } from "@/server/integrations/sync";
import { riceviWebhook } from "@/server/integrations/webhooks";
import { inviaOrdine, tentaInvio } from "@/server/integrations/ordini";
import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { registraEvidenza } from "@/server/integrations/certificazione/evidenze";
import {
  anteprimaOrdine,
  anteprimaSecondaComanda,
  confermaManuale,
  creaOrdineDiProva,
  FRASE_ORDINE,
  FRASE_PAGAMENTO,
  leggi,
  motivoAmbienteFinto,
  pagamentoDiProva,
  secondaComanda,
  traccia,
  trattaFetchDiProvaComeReale,
  type Chiamante,
} from "@/server/integrations/certificazione/console";
import { transizioneStato, transizionePreparazione } from "@/server/integrations/stato-mappature";

/**
 * **Hardening della certificazione, prima della prima cassa vera.**
 *
 * Correlazione, webhook vecchi, duplicati e fuori ordine, reinstallazione,
 * revoca dell'accesso beta, sospensione, guardie fiscali, audit prima
 * dell'effetto, evidenze solo dalle prove giuste, ripetizioni sotto carico.
 * Il fornitore è finto e conta le chiamate: dove una regola dice «nessuna
 * chiamata», la prova lo verifica sul contatore.
 */

const db = new PrismaClient();
const SLUG = `prova-hard-${randomBytes(4).toString("hex")}`;
const PREFISSO = "test-hard-";
const ORIGINE = "https://app.foodtech.test";
const ADMIN = "capo@foodtech.test";
const BASE = "https://cassa-hard.example.com";

/* --------------------------- il fornitore finto --------------------------- */

const cassa = {
  ordini: new Map<string, { id: string; righe: { codice: string; q: number }[]; pagato: number }>(),
  prossimo: 1,
  chiamate: [] as { metodo: string; percorso: string; corr: string | null; il: number }[],
  rifiutaOrdini: false,
  rifiutaPagamenti: false,
  ritardoMs: 0,
};
const conta = () => cassa.chiamate.length;

const fetchFinto = (async (url: string, init: RequestInit = {}) => {
  const u = new URL(url);
  const h = (init.headers ?? {}) as Record<string, string>;
  cassa.chiamate.push({ metodo: init.method ?? "GET", percorso: u.pathname, corr: h["X-Correlation-Id"] ?? null, il: Date.now() });
  const corpo = init.body ? JSON.parse(String(init.body)) : null;
  const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (cassa.ritardoMs) await new Promise((r) => setTimeout(r, cassa.ritardoMs));
  if (u.pathname === "/sessione") return json(200, { account: "Cassa demo" });
  if (u.pathname === "/tavoli") return json(200, [{ id: "T2", nome: "B2" }, { id: "T3", nome: "B3" }]);
  if (u.pathname === "/prodotti") return json(200, [{ id: "P1", nome: "Antipasto", prezzo: 900 }, { id: "P2", nome: "Caffè", prezzo: 150 }]);
  if (u.pathname === "/ordini" && init.method === "POST") {
    if (cassa.rifiutaOrdini) return json(422, { errore: "rifiutato" });
    const id = `O${cassa.prossimo++}`;
    cassa.ordini.set(id, { id, righe: corpo.righe, pagato: 0 });
    return json(201, { id });
  }
  const m = /^\/ordini\/(\w+)(\/righe|\/pagamenti)?$/.exec(u.pathname);
  if (m) {
    const o = cassa.ordini.get(m[1]!);
    if (!o) return json(404, {});
    if (m[2] === "/righe") o.righe.push(...corpo.righe);
    if (m[2] === "/pagamenti") {
      if (cassa.rifiutaPagamenti) return json(422, { errore: "pagamento rifiutato" });
      o.pagato += corpo.importo;
    }
    return json(200, { ...o, totale: o.righe.reduce((s, r) => s + (r.codice === "P1" ? 900 : 150) * r.q, 0) });
  }
  return json(404, {});
}) as unknown as typeof fetch;

/** Webhook firmati: HMAC-SHA256 del corpo con il segreto registrato all'attivazione. */
const adattatore: PosIntegrationAdapter = {
  slug: SLUG,
  versione: "0.0.1",
  async connetti() {
    return { kind: "API_KEY", segreti: { apiKey: "k" }, scopes: [], accessTokenExpiresAt: null, refreshTokenExpiresAt: null };
  },
  async provaConnessione(ctx) {
    const s = await ctx.http.richiesta<{ account: string }>({ url: `${BASE}/sessione` });
    return { account: { externalId: "acc", nome: s.account }, sedi: [{ externalId: "sede-1", nome: "Torino Test", account: null }], avvisi: [] };
  },
  async opzioniConfigurazione() {
    return { locations: [{ value: "sede-1", label: "Torino Test" }] };
  },
  async attiva() {
    return { segretiAggiunti: { webhookSecret: randomBytes(16).toString("hex") } };
  },
  async sincronizza(ctx) {
    const t = await ctx.http.richiesta<{ id: string; nome: string }[]>({ url: `${BASE}/tavoli` });
    const p = await ctx.http.richiesta<{ id: string; nome: string; prezzo: number }[]>({ url: `${BASE}/prodotti` });
    return {
      entita: [
        ...t.map((x) => ({ tipo: "TABLE" as const, externalId: x.id, etichetta: x.nome })),
        ...p.map((x) => ({ tipo: "PRODUCT" as const, externalId: x.id, etichetta: x.nome, metadata: { prezzoCents: x.prezzo } })),
      ],
      scartati: [],
    };
  },
  verificaWebhook(ctx, w) {
    const segreto = ctx.segreti.webhookSecret;
    if (!segreto) return false;
    return w.intestazioni.get("x-firma") === createHmac("sha256", segreto).update(w.corpo).digest("hex");
  },
  riceviWebhook(_ctx, w) {
    const b = JSON.parse(w.corpo) as { id: string; rif?: string | null; idEsterno?: string | null; stato: string };
    return {
      idEvento: b.id,
      tipo: `order.${b.stato}`,
      sedeExternalId: null,
      evento: { tipo: "pos.order.status", riferimento: b.rif ?? null, externalId: b.idEsterno ?? null, stato: b.stato as never, motivo: null },
    };
  },
  pos: {
    async getTables(ctx) {
      const t = await ctx.http.richiesta<{ id: string; nome: string }[]>({ url: `${BASE}/tavoli` });
      return t.map((x) => ({ externalId: x.id, etichetta: x.nome, salaExternalId: null, posti: 4, attivo: true }));
    },
    async getMenu() {
      return [];
    },
    async createOrder(ctx, o) {
      const r = await ctx.http.richiesta<{ id: string }>({ metodo: "POST", url: `${BASE}/ordini`, corpo: { righe: o.righe.map((x) => ({ codice: x.codiceProdotto, q: x.quantita })) } });
      return { accettato: true, externalId: r.id };
    },
    async updateOrder(ctx, id, o) {
      await ctx.http.richiesta({ metodo: "POST", url: `${BASE}/ordini/${id}/righe`, corpo: { righe: o.righe.map((x) => ({ codice: x.codiceProdotto, q: x.quantita })) } });
    },
    async getOrder(ctx, id) {
      const r = await ctx.http.richiesta<{ id: string; totale: number }>({ url: `${BASE}/ordini/${id}` });
      return { externalId: r.id, riferimento: null, stato: "IN_PROGRESS", tavolo: null, totaleCents: r.totale, righe: [] };
    },
    async createPayment(ctx, p) {
      await ctx.http.richiesta({ metodo: "POST", url: `${BASE}/ordini/${p.riferimentoOrdine}/pagamenti`, corpo: { importo: p.importoCents } });
    },
  },
};

const voce: VoceCatalogo = {
  id: "int_prova_hard",
  slug: SLUG,
  nome: "Cassa da indurire",
  fornitore: "Prova",
  categoria: "POS",
  descrizione: "Solo per le prove.",
  logo: { monogramma: "Ph", marchio: "voce di prova" },
  implementazione: "IN_DEVELOPMENT",
  disponibilita: "PREVIEW",
  autenticazione: { modalita: "API_KEY", verificata: true },
  capacita: ["tables", "menu", "orders.read", "orders.write", "payments.write"],
  webhook: { eventi: ["order.*"], autenticazione: "HMAC-SHA256" },
  configurazione: [
    { chiave: "apiKey", etichetta: "Chiave", tipo: "segreto", obbligatorio: true },
    { chiave: "sede", etichetta: "Sede", tipo: "scelta", obbligatorio: true, opzioniDa: "locations" },
  ],
  dati: { legge: [], scrive: [], permessi: [] },
  documentazione: null,
  versioneAdattatore: "0.0.1",
  requisitiPiattaforma: [],
  mancaPerOperare: [],
};

/* -------------------------------- i locali -------------------------------- */

type Locale = { venueId: string; orgId: string; c: Chiamante; attore: { venueId: string; orgId: string; userId: string } };
async function creaLocale(nome: string): Promise<Locale> {
  const org = await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}-${randomBytes(2).toString("hex")}` } });
  const venue = await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}-${randomBytes(2).toString("hex")}` } });
  return {
    venueId: venue.id,
    orgId: org.id,
    attore: { venueId: venue.id, orgId: org.id, userId: "u" },
    c: { venueId: venue.id, email: ADMIN, origine: ORIGINE, audit: { userId: "admin", email: ADMIN, orgId: org.id, venueId: venue.id } },
  };
}

async function finoAdAttiva(l: Locale) {
  await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, { apiKey: "k" });
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { sede: "sede-1" } });
  await provaConnessione(l.attore, SLUG, ORIGINE);
  await salvaCapacita(l.attore, SLUG, ["tables", "menu", "orders.read", "orders.write", "payments.write"], ORIGINE);
  await attiva(l.attore, SLUG, ORIGINE);
  const i = (await trovaInstallazione(l.venueId, SLUG))!;
  await eseguiSincronizzazione({ installationId: i.id, venueId: l.venueId, operazione: "full", trigger: "MANUAL" });
  return (await trovaInstallazione(l.venueId, SLUG))!;
}

async function segreto(installationId: string) {
  const { leggiSegreti } = await import("@/server/integrations/credenziali");
  const i = await db.integrationInstallation.findUniqueOrThrow({ where: { id: installationId } });
  return (await leggiSegreti(i))!.segreti.webhookSecret!;
}

async function manda(chiave: string, segretoFirma: string, corpo: object) {
  const testo = JSON.stringify(corpo);
  return riceviWebhook({ slug: SLUG, chiave, corpo: testo, intestazioni: new Headers({ "x-firma": createHmac("sha256", segretoFirma).update(testo).digest("hex") }) });
}

async function ordineDiProva(l: Locale, righe = [{ externalId: "P1", quantita: 1 }], tavolo = "T2") {
  const scelta = { tavoloExternalId: tavolo, righe };
  const a = await anteprimaOrdine(l.c, SLUG, scelta);
  return creaOrdineDiProva(l.c, SLUG, scelta, { frase: FRASE_ORDINE, impronta: a.impronta });
}

const mappaOrdine = (installationId: string, riferimento: string) =>
  db.externalEntityMapping.findUniqueOrThrow({ where: { installationId_entityType_externalId: { installationId, entityType: "ORDER", externalId: riferimento } } });
const storico = (m: { metadata: unknown }) => ((m.metadata as { eventi?: { eventoId: string | null; stato: string; applicato: boolean; motivo: string | null }[] }).eventi ?? []);

let A: Locale;
let B: Locale;
const annulla: (() => void)[] = [];
const envPrima = { chiave: process.env.CHIAVE_CIFRATURA, segreto: process.env.NEXTAUTH_SECRET };

async function pulisci() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: PREFISSO } }, select: { id: true } });
  const venues = await db.venue.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { id: true } });
  await db.webhookEvent.deleteMany({ where: { provider: `integration:${SLUG}` } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
}

beforeAll(async () => {
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 6).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  annulla.push(registraVocePerProve(voce), registraAdattatorePerProve(adattatore as IntegrationAdapter));
  usaFetchPerProve(fetchFinto);
  trattaFetchDiProvaComeReale(true);
  await pulisci();
  A = await creaLocale("a");
  B = await creaLocale("b");
  for (const l of [A, B]) await impostaAccessoBeta({ venueId: l.venueId, slug: SLUG, abilitato: true, email: ADMIN });
  await finoAdAttiva(A);
  await finoAdAttiva(B);
});

afterAll(async () => {
  trattaFetchDiProvaComeReale(false);
  usaFetchPerProve(undefined);
  await pulisci();
  annulla.forEach((f) => f());
  process.env.CHIAVE_CIFRATURA = envPrima.chiave;
  process.env.NEXTAUTH_SECRET = envPrima.segreto;
  await db.$disconnect();
});

beforeEach(() => {
  cassa.rifiutaOrdini = false;
  cassa.rifiutaPagamenti = false;
  cassa.ritardoMs = 0;
  sessione.superAdmin = ADMIN;
  sessione.venueId = A.venueId;
  sessione.orgId = A.orgId;
});

const errore = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { codice?: string; code?: string; httpStatus?: number; message: string } | null;

/* -------------------------------------------------------------------------- */
/*  1. La causa dell'intermittenza Tilby: una query ambigua                    */
/* -------------------------------------------------------------------------- */

describe("la query ambigua del test Tilby (causa dell'intermittenza)", () => {
  it("ORDER e PAYMENT con lo stesso externalId: senza entityType la riga restituita dipende dal piano", async () => {
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const rif = `ft-ambiguo-${randomBytes(3).toString("hex")}`;
    const ordine = await db.externalEntityMapping.create({ data: { venueId: A.venueId, installationId: i.id, entityType: "ORDER", externalId: rif, metadata: { invio: { stato: "SYNCED" } } } });
    await db.externalEntityMapping.create({ data: { venueId: A.venueId, installationId: i.id, entityType: "PAYMENT", externalId: rif, metadata: { riuscito: true } } });
    await db.externalEntityMapping.update({ where: { id: ordine.id }, data: { metadata: { invio: { stato: "SYNCED" }, stato: "CLOSED" } } });
    const ambigua = (c: typeof db) => c.externalEntityMapping.findFirst({ where: { installationId: i.id, externalId: rif } });
    const precisa = (c: typeof db) => c.externalEntityMapping.findFirst({ where: { installationId: i.id, entityType: "ORDER", externalId: rif } });
    const [conScansione, precisaScansione] = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL enable_indexscan = off");
      await tx.$executeRawUnsafe("SET LOCAL enable_bitmapscan = off");
      return [await ambigua(tx as typeof db), await precisa(tx as typeof db)];
    });
    // Con una scansione sequenziale la query del vecchio test prende la riga PAYMENT: niente «stato».
    expect(conScansione!.entityType).toBe("PAYMENT");
    expect((conScansione!.metadata as Record<string, unknown>).stato).toBeUndefined();
    // Con entityType la risposta è una sola, qualunque sia il piano.
    expect(precisaScansione!.entityType).toBe("ORDER");
    expect((await precisa(db))!.entityType).toBe("ORDER");
  });

  it("nessuna query per externalId senza entityType, né nel codice né nelle prove", () => {
    const radice = join(__dirname, "..");
    const file = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? file(join(dir, d.name)) : d.name.endsWith(".ts") ? [join(dir, d.name)] : []));
    const colpevoli: string[] = [];
    for (const f of [...file(join(radice, "src")), ...file(join(radice, "tests"))]) {
      const testo = readFileSync(f, "utf8");
      for (const m of testo.matchAll(/externalEntityMapping\.(findFirst|findFirstOrThrow|findMany)\(\{\s*where:\s*\{([^}]*)\}/g)) {
        if (/\bexternalId\b/.test(m[2]!) && !/\bentityType\b/.test(m[2]!) && !f.endsWith("certificazione-hardening.test.ts")) colpevoli.push(`${f}: ${m[0].slice(0, 90)}`);
      }
    }
    expect(colpevoli).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  2–3. Correlazione ed evidenze attribuibili                                 */
/* -------------------------------------------------------------------------- */

describe("correlazione: ordine → richiesta → id esterno → webhook → aggiornamento → evidenza", () => {
  it("lo stesso correlationId su prova, richiesta al fornitore, mappatura ed evidenza; il webhook legato per id", async () => {
    const r = await ordineDiProva(A);
    const run = await db.integrationCertificationRun.findUniqueOrThrow({ where: { id: r.run } });
    const post = cassa.chiamate.filter((c) => c.metodo === "POST" && c.percorso === "/ordini").at(-1)!;
    expect(post.corr).toBe(run.correlationId);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const m = await mappaOrdine(i.id, r.riferimento);
    expect((m.metadata as { invio: { correlationId: string; idEsterno: string } }).invio).toMatchObject({ correlationId: run.correlationId, idEsterno: run.externalEntityId });
    const evidenze = await db.integrationCertificationEvidence.findMany({ where: { integrationSlug: SLUG, runId: run.id } });
    expect(evidenze.length).toBeGreaterThan(0);
    expect(evidenze.every((e) => e.correlationId === run.correlationId && e.externalEntityId === run.externalEntityId)).toBe(true);

    const w = await manda(i.webhookKey, await segreto(i.id), { id: `w-${r.riferimento}`, rif: r.riferimento, stato: "IN_PROGRESS" });
    expect(w.status).toBe(200);
    const evento = await db.webhookEvent.findFirstOrThrow({ where: { installationId: i.id, providerEventId: `${i.id}:w-${r.riferimento}` } });
    const dopo = await mappaOrdine(i.id, r.riferimento);
    expect(storico(dopo)).toEqual([expect.objectContaining({ eventoId: evento.id, stato: "IN_PROGRESS", applicato: true })]);
    const t = await traccia(A.c, SLUG, r.run);
    expect(t.passi.filter((p) => p.fase === "webhook").map((p) => (p.dati as { eventoId: string }).eventoId)).toEqual([evento.id]);
  });

  it("creo TEST-A, arriva il webhook di TEST-B: TEST-A non si certifica e la sua traccia resta pulita", async () => {
    const a = await ordineDiProva(A);
    const b = await ordineDiProva(A);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const evidenzePrima = await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } });
    await manda(i.webhookKey, await segreto(i.id), { id: `solo-b-${b.riferimento}`, rif: b.riferimento, stato: "READY" });
    expect(storico(await mappaOrdine(i.id, a.riferimento))).toEqual([]);
    expect(storico(await mappaOrdine(i.id, b.riferimento))).toHaveLength(1);
    expect((await traccia(A.c, SLUG, a.run)).passi.some((p) => p.fase === "webhook")).toBe(false);
    // I webhook non creano evidenze: le crea solo una prova, o una persona che conferma una prova precisa.
    expect(await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } })).toBe(evidenzePrima);
    const e = await confermaManuale(A.c, SLUG, { runId: a.run, capacita: "kitchen", livello: "REAL_POS", risposta: "SI" });
    expect([e.runId, e.externalEntityId]).toEqual([a.run, (await db.integrationCertificationRun.findUniqueOrThrow({ where: { id: a.run } })).externalEntityId]);
  });

  it("un ordine rifiutato: «Crea ordine» FAILED, e nessun FAILED su «Ordine sul tavolo giusto»", async () => {
    cassa.rifiutaOrdini = true;
    const r = await ordineDiProva(A);
    const ev = await db.integrationCertificationEvidence.findMany({ where: { integrationSlug: SLUG, runId: r.run } });
    expect(ev.map((e) => [e.capability, e.result])).toEqual([["create_order", "FAILED"]]);
  });
});

/* -------------------------------------------------------------------------- */
/*  4–6. Webhook vecchi, duplicati, fuori ordine                              */
/* -------------------------------------------------------------------------- */

describe("webhook vecchi, duplicati e fuori ordine", () => {
  it("vecchio ordine, nuovo ordine, webhook del vecchio in ritardo: ognuno sul suo, nessuno scambio", async () => {
    const vecchio = await ordineDiProva(A);
    const nuovo = await ordineDiProva(A);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const s = await segreto(i.id);
    await manda(i.webhookKey, s, { id: `n-${nuovo.riferimento}`, rif: nuovo.riferimento, stato: "IN_PROGRESS" });
    await manda(i.webhookKey, s, { id: `v-${vecchio.riferimento}`, rif: vecchio.riferimento, stato: "CLOSED" });
    expect((await mappaOrdine(i.id, nuovo.riferimento)).metadata).toMatchObject({ stato: "IN_PROGRESS" });
    expect((await mappaOrdine(i.id, vecchio.riferimento)).metadata).toMatchObject({ stato: "CLOSED" });
    // Anche per id esterno (le casse che notificano solo il loro id): stessa attribuzione.
    const runNuovo = await db.integrationCertificationRun.findUniqueOrThrow({ where: { id: nuovo.run } });
    await manda(i.webhookKey, s, { id: `n2-${nuovo.riferimento}`, idEsterno: runNuovo.externalEntityId, stato: "READY" });
    expect((await mappaOrdine(i.id, nuovo.riferimento)).metadata).toMatchObject({ stato: "READY" });
    expect((await mappaOrdine(i.id, vecchio.riferimento)).metadata).toMatchObject({ stato: "CLOSED" });
    const pNuovo = (await traccia(A.c, SLUG, nuovo.run)).passi.filter((p) => p.fase === "webhook");
    expect(pNuovo).toHaveLength(2);
  });

  it("lo stesso evento cinque volte in parallelo: una riga, una transizione, nessuna evidenza", async () => {
    const r = await ordineDiProva(A);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const s = await segreto(i.id);
    const evidenzePrima = await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } });
    const esiti = await Promise.all([1, 2, 3, 4, 5].map(() => manda(i.webhookKey, s, { id: `dup-${r.riferimento}`, rif: r.riferimento, stato: "READY" })));
    expect(esiti.every((e) => e.status === 200)).toBe(true);
    expect(esiti.filter((e) => "ripetuto" in e.corpo && e.corpo.ripetuto)).toHaveLength(4);
    expect(await db.webhookEvent.count({ where: { installationId: i.id, providerEventId: `${i.id}:dup-${r.riferimento}` } })).toBe(1);
    expect(storico(await mappaOrdine(i.id, r.riferimento))).toHaveLength(1);
    expect(await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } })).toBe(evidenzePrima);
  });

  it("CLOSED prima di UPDATED, READY prima di IN_PROGRESS: lo stato non torna indietro, e lo scarto si ricorda", async () => {
    const r = await ordineDiProva(A);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const s = await segreto(i.id);
    await manda(i.webhookKey, s, { id: `o1-${r.riferimento}`, rif: r.riferimento, stato: "READY" });
    await manda(i.webhookKey, s, { id: `o2-${r.riferimento}`, rif: r.riferimento, stato: "IN_PROGRESS" });
    expect((await mappaOrdine(i.id, r.riferimento)).metadata).toMatchObject({ stato: "READY" });
    await manda(i.webhookKey, s, { id: `o3-${r.riferimento}`, rif: r.riferimento, stato: "CLOSED" });
    await manda(i.webhookKey, s, { id: `o4-${r.riferimento}`, rif: r.riferimento, stato: "IN_PROGRESS" });
    await manda(i.webhookKey, s, { id: `o5-${r.riferimento}`, rif: r.riferimento, stato: "CANCELLED" });
    const m = await mappaOrdine(i.id, r.riferimento);
    expect(m.metadata).toMatchObject({ stato: "CLOSED" });
    expect(storico(m).map((e) => [e.stato, e.applicato, e.motivo])).toEqual([
      ["READY", true, null],
      ["IN_PROGRESS", false, "regressione da READY"],
      ["CLOSED", true, null],
      ["IN_PROGRESS", false, "stato finale CLOSED"],
      ["CANCELLED", false, "stato finale CLOSED"],
    ]);
  });

  it("stati fuori ordine in parallelo sulla stessa riga: nessun aggiornamento perso, finale stabile", async () => {
    const r = await ordineDiProva(A);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const s = await segreto(i.id);
    const stati = ["ACCEPTED", "IN_PROGRESS", "READY", "CLOSED", "IN_PROGRESS", "READY"];
    await Promise.all(stati.map((stato, n) => manda(i.webhookKey, s, { id: `par-${n}-${r.riferimento}`, rif: r.riferimento, stato })));
    const m = await mappaOrdine(i.id, r.riferimento);
    expect(m.metadata).toMatchObject({ stato: "CLOSED" });
    expect(storico(m)).toHaveLength(stati.length);
  });

  it("le regole delle transizioni, da sole", () => {
    expect(transizioneStato(undefined, "IN_PROGRESS").applicato).toBe(true);
    expect(transizioneStato("CLOSED", "CANCELLED")).toEqual({ applicato: false, motivo: "stato finale CLOSED" });
    expect(transizioneStato("READY", "IN_PROGRESS")).toEqual({ applicato: false, motivo: "regressione da READY" });
    expect(transizioneStato("IN_PROGRESS", "IN_PROGRESS")).toEqual({ applicato: false, motivo: "uguale" });
    expect(transizioneStato("UNKNOWN", "ACCEPTED").applicato).toBe(true);
    expect(transizionePreparazione("Prepared", "Submitted")).toBe(false);
    expect(transizionePreparazione("Submitted", "Packaged")).toBe(true);
    expect(transizionePreparazione("Submitted", "ValoreNuovo")).toBe(false);
  });

  it("l'esito dell'invio non cancella uno stato scritto da un webhook arrivato durante l'invio", async () => {
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const s = await segreto(i.id);
    const rif = `ft-corsa-${randomBytes(3).toString("hex")}`;
    // Il fornitore notifica la vendita appena creata, prima che Foodtech scriva SYNCED.
    const originale = adattatore.pos.createOrder!;
    adattatore.pos.createOrder = async (ctx, o) => {
      const r = await originale(ctx, o);
      await manda(i.webhookKey, s, { id: `corsa-${rif}`, rif, stato: "ACCEPTED" });
      return r;
    };
    try {
      await inviaOrdine(i, "corsa", { riferimento: rif, tavolo: "B2", tavoloExternalId: "T2", coperti: 2, cliente: null, nota: null, righe: [{ codiceProdotto: "P1", nome: "Antipasto", quantita: 1, prezzoUnitarioCents: null, note: null }] });
    } finally {
      adattatore.pos.createOrder = originale;
    }
    const m = await mappaOrdine(i.id, rif);
    expect(m.metadata).toMatchObject({ stato: "ACCEPTED", invio: { stato: "SYNCED" } });
  });
});

/* -------------------------------------------------------------------------- */
/*  7. Reinstallazione: gli eventi della vecchia installazione non toccano la nuova */
/* -------------------------------------------------------------------------- */

describe("reinstallazione e webhook della vecchia installazione", () => {
  it("URL e segreto vecchi: 404 sul vecchio indirizzo, 401 sul nuovo con la firma vecchia; la nuova non cambia", async () => {
    const L = await creaLocale("reinst");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    const prima = await finoAdAttiva(L);
    const segretoVecchio = await segreto(prima.id);
    sessione.venueId = L.venueId;
    const vecchio = await ordineDiProva(L);
    await disinstalla(L.attore, SLUG, ORIGINE);
    const dopo = await finoAdAttiva(L);
    expect(dopo.webhookKey).not.toBe(prima.webhookKey);
    const statiPrima = await db.externalEntityMapping.findMany({ where: { installationId: dopo.id }, select: { id: true, updatedAt: true } });

    const suVecchio = await manda(prima.webhookKey, segretoVecchio, { id: "ritardo-1", rif: vecchio.riferimento, stato: "CLOSED" });
    expect(suVecchio.status).toBe(404);
    const suNuovoFirmaVecchia = await manda(dopo.webhookKey, segretoVecchio, { id: "ritardo-2", rif: vecchio.riferimento, stato: "CLOSED" });
    expect(suNuovoFirmaVecchia.status).toBe(401);
    const statiDopo = await db.externalEntityMapping.findMany({ where: { installationId: dopo.id }, select: { id: true, updatedAt: true } });
    expect(statiDopo).toEqual(statiPrima);
    expect(await db.webhookEvent.count({ where: { installationId: dopo.id, providerEventId: { contains: "ritardo" } } })).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Revoca dell'accesso beta                                               */
/* -------------------------------------------------------------------------- */

describe("revoca dell'accesso beta", () => {
  it("non interrompe un'integrazione ACTIVE: sincronizza e manda ordini", async () => {
    const L = await creaLocale("revoca-attiva");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    const i = await finoAdAttiva(L);
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: false, email: ADMIN });
    expect(await eseguiSincronizzazione({ installationId: i.id, venueId: L.venueId, operazione: "full", trigger: "MANUAL" })).toMatchObject({ eseguita: true, riuscita: true });
    const esito = await inviaOrdine(i, "rev", { riferimento: `ft-rev-${randomBytes(3).toString("hex")}`, tavolo: "B2", tavoloExternalId: "T2", coperti: 1, cliente: null, nota: null, righe: [{ codiceProdotto: "P2", nome: "Caffè", quantita: 1, prezzoUnitarioCents: null, note: null }] });
    expect(esito.stato).toBe("SYNCED");
  });

  it("impedisce nuove installazioni, nuove attivazioni e la riattivazione dopo uno spegnimento", async () => {
    const L = await creaLocale("revoca-nuova");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    await installa(L.attore, SLUG);
    await connettiConCampi(L.attore, SLUG, { apiKey: "k" });
    await salvaConfigurazione(L.attore, SLUG, { configurazione: { sede: "sede-1" } });
    await provaConnessione(L.attore, SLUG, ORIGINE);
    await salvaCapacita(L.attore, SLUG, ["tables"], ORIGINE);
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: false, email: ADMIN });
    await expect(attiva(L.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "integration_beta_required" });

    const M = await creaLocale("revoca-riattiva");
    await impostaAccessoBeta({ venueId: M.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    await finoAdAttiva(M);
    await disattiva(M.attore, SLUG);
    await impostaAccessoBeta({ venueId: M.venueId, slug: SLUG, abilitato: false, email: ADMIN });
    const prima = conta();
    await expect(riattiva(M.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "integration_beta_required" });
    expect(conta()).toBe(prima);

    const N = await creaLocale("revoca-installa");
    await expect(installa(N.attore, SLUG)).rejects.toMatchObject({ code: "integration_beta_required" });
  });
});

/* -------------------------------------------------------------------------- */
/*  8b. Sospensione (il freno d'emergenza)                                    */
/* -------------------------------------------------------------------------- */

describe("sospensione Super Admin", () => {
  it("ferma tutto verso il fornitore, conserva configurazione e mappature, è auditata e reversibile", async () => {
    const L = await creaLocale("sospesa");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    const i = await finoAdAttiva(L);
    sessione.venueId = L.venueId;
    // Un ordine resta in coda (fornitore giù) prima della sospensione.
    cassa.rifiutaOrdini = false;
    const rif = `ft-coda-${randomBytes(3).toString("hex")}`;
    const riga = await db.externalEntityMapping.create({
      data: { venueId: L.venueId, installationId: i.id, entityType: "ORDER", externalId: rif, metadata: { invio: { stato: "PENDING_SYNC", tentativi: 1, idEsterno: null, codiceErrore: "PROVIDER_UNAVAILABLE", aggiornatoIl: new Date().toISOString() }, ordine: { riferimento: rif, tavolo: "B2", tavoloExternalId: "T2", coperti: 1, cliente: null, nota: null, righe: [{ codiceProdotto: "P2", nome: "Caffè", quantita: 1, prezzoUnitarioCents: null, note: null }] } } },
    });
    const mappePrima = await db.externalEntityMapping.count({ where: { installationId: i.id } });
    const configPrima = i.configuration;

    await sospendi({ ...L.attore, audit: L.c.audit }, SLUG, { email: ADMIN, motivo: "prova del freno" });
    const s = (await trovaInstallazione(L.venueId, SLUG))!;
    expect(s.status).toBe("DISABLED");
    expect((s.metadata as { sospensione: { da: string; motivo: string } }).sospensione).toMatchObject({ da: ADMIN, motivo: "prova del freno" });
    expect(s.configuration).toEqual(configPrima);
    expect(await db.externalEntityMapping.count({ where: { installationId: i.id } })).toBe(mappePrima);
    expect(await db.auditLog.count({ where: { orgId: L.orgId, action: "integration.suspend" } })).toBe(1);

    const prima = conta();
    expect(await eseguiSincronizzazione({ installationId: i.id, venueId: L.venueId, operazione: "full", trigger: "MANUAL" })).toEqual({ eseguita: false, motivo: "non_attiva" });
    expect(await tentaInvio(L.venueId, riga.id)).toEqual({ stato: "PENDING_SYNC", codiceErrore: "INTEGRAZIONE_NON_ATTIVA" });
    await expect(inviaOrdine(s, "x", { riferimento: "ft-x2", tavolo: null, tavoloExternalId: null, coperti: null, cliente: null, righe: [], nota: null })).rejects.toBeTruthy();
    expect((await errore(leggi(L.c, SLUG, "tables")))?.codice).toBe("integrazione_sospesa");
    await expect(connettiConCampi(L.attore, SLUG, { apiKey: "k" })).rejects.toMatchObject({ code: "integration_suspended" });
    await expect(provaConnessione(L.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "integration_suspended" });
    await expect(riattiva(L.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "integration_suspended" });
    await expect(salvaConfigurazione(L.attore, SLUG, { configurazione: { sede: "sede-1" } })).rejects.toMatchObject({ code: "integration_suspended" });
    // Webhook: conservati e ignorati.
    const w = await manda(s.webhookKey, await segreto(i.id), { id: `sosp-${rif}`, rif, stato: "CLOSED" });
    expect(w.corpo).toMatchObject({ ignorato: "integrazione_disattivata" });
    // Disinstallare non basta a togliere la sospensione.
    await disinstalla(L.attore, SLUG, ORIGINE);
    await expect(installa(L.attore, SLUG)).rejects.toMatchObject({ code: "integration_suspended" });
    expect(conta()).toBe(prima);

    await revocaSospensione({ ...L.attore, audit: L.c.audit }, SLUG, { email: ADMIN });
    expect(await db.auditLog.count({ where: { orgId: L.orgId, action: "integration.resume" } })).toBe(1);
    await finoAdAttiva(L);
    expect((await trovaInstallazione(L.venueId, SLUG))!.status).toBe("ACTIVE");
  });

  it("sospendere e riprendere da una sospesa ancora installata: riattiva dopo la revoca, con una prova", async () => {
    const L = await creaLocale("sospesa-riprende");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    await finoAdAttiva(L);
    await sospendi(L.attore, SLUG, { email: ADMIN });
    await revocaSospensione(L.attore, SLUG, { email: ADMIN });
    expect((await trovaInstallazione(L.venueId, SLUG))!.status).toBe("DISABLED");
    await riattiva(L.attore, SLUG, ORIGINE);
    expect((await trovaInstallazione(L.venueId, SLUG))!.status).toBe("ACTIVE");
  });
});

/* -------------------------------------------------------------------------- */
/*  9, 13, 14. Guardie fiscali e audit prima dell'effetto                     */
/* -------------------------------------------------------------------------- */

describe("guardie fiscali: basta una condizione mancante, e nessuna chiamata parte", () => {
  let L: Locale;
  let ordine: { run: string };
  beforeAll(async () => {
    L = await creaLocale("fiscale");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, operazioniFiscali: true, email: ADMIN });
    const i = await finoAdAttiva(L);
    await db.externalEntityMapping.create({ data: { venueId: L.venueId, installationId: i.id, entityType: "PAYMENT_METHOD", externalId: "contanti", externalLabel: "Contanti" } });
  });
  beforeEach(() => {
    sessione.venueId = L.venueId;
    sessione.orgId = L.orgId;
  });

  const paga = (frase = FRASE_PAGAMENTO, c: Chiamante = L.c) =>
    pagamentoDiProva(c, SLUG, ordine.run, { importoCents: 100, tenderExternalId: "contanti" }, { frase });
  const pagamentiAlFornitore = () => cassa.chiamate.filter((c) => c.percorso.endsWith("/pagamenti")).length;

  it("l'ordine di prova su cui si prova il pagamento (arriva alla cassa, «Crea ordine» verificato)", async () => {
    ordine = await ordineDiProva(L);
    const run = await db.integrationCertificationRun.findUniqueOrThrow({ where: { id: ordine.run } });
    expect([run.status, run.riferimento?.startsWith("ft-test-")]).toEqual(["RIUSCITO", true]);
  });

  it("non Super Admin: la rotta risponde 404", async () => {
    const { POST } = await import("@/app/api/integrations/[slug]/certificazione/route");
    sessione.superAdmin = null;
    const prima = pagamentiAlFornitore();
    const r = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ azione: "pagamento", parentRunId: ordine.run, importoCents: 100, tenderExternalId: "contanti", frase: FRASE_PAGAMENTO }) }), { params: { slug: SLUG } });
    expect(r.status).toBe(404);
    expect(pagamentiAlFornitore()).toBe(prima);
  });

  it("frase di conferma sbagliata", async () => {
    const prima = conta();
    expect((await errore(paga("confermo")))?.codice).toBe("conferma_mancante");
    expect(conta()).toBe(prima);
  });

  it("locale non autorizzato alle operazioni fiscali", async () => {
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, operazioniFiscali: false, email: ADMIN });
    const prima = conta();
    expect((await errore(paga()))?.codice).toBe("operazione_fiscale_bloccata");
    expect(conta()).toBe(prima);
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, operazioniFiscali: true, email: ADMIN });
  });

  it("fornitore finto", async () => {
    trattaFetchDiProvaComeReale(false);
    try {
      const prima = conta();
      const e = await errore(paga());
      expect([e?.codice, e?.message]).toEqual(["operazione_fiscale_bloccata", expect.stringMatching(/Ambiente finto/)]);
      expect(conta()).toBe(prima);
    } finally {
      trattaFetchDiProvaComeReale(true);
    }
  });

  it("«Crea ordine» non verificato contro l'API (l'ultima evidenza è FAILED)", async () => {
    await registraEvidenza({ slug: SLUG, capacita: "create_order", livello: "PROVIDER_API", esito: "FAILED", venueId: L.venueId, operatore: ADMIN });
    const prima = conta();
    expect((await errore(paga()))?.message).toMatch(/Crea ordine/);
    expect(conta()).toBe(prima);
    await registraEvidenza({ slug: SLUG, capacita: "create_order", livello: "PROVIDER_API", esito: "PASSED", venueId: L.venueId, operatore: ADMIN });
  });

  it("integrazione disattivata, poi sospesa", async () => {
    await disattiva(L.attore, SLUG);
    let prima = conta();
    expect((await errore(paga()))?.codice).toBe("operazione_fiscale_bloccata");
    expect(conta()).toBe(prima);
    await riattiva(L.attore, SLUG, ORIGINE);
    await sospendi(L.attore, SLUG, { email: ADMIN });
    prima = conta();
    expect((await errore(paga()))?.codice).toBe("operazione_fiscale_bloccata");
    expect(conta()).toBe(prima);
    await revocaSospensione(L.attore, SLUG, { email: ADMIN });
    await riattiva(L.attore, SLUG, ORIGINE);
  });

  it("senza un autore registrabile, o se l'audit non si scrive, il pagamento non parte", async () => {
    const prima = conta();
    expect((await errore(paga(FRASE_PAGAMENTO, { ...L.c, audit: undefined })))?.codice).toBe("audit_obbligatorio");
    // Un audit che non si può scrivere (organizzazione inesistente): nessuna richiesta.
    const rotto = await errore(paga(FRASE_PAGAMENTO, { ...L.c, audit: { ...L.c.audit!, orgId: "org-inesistente" } }));
    expect(rotto).not.toBeNull();
    expect(cassa.chiamate.slice(prima).some((c) => c.percorso.endsWith("/pagamenti"))).toBe(false);
  });

  it("con tutte le condizioni: prima l'intento (ATTEMPTED), poi la richiesta, poi l'esito — anche quando il fornitore rifiuta", async () => {
    cassa.rifiutaPagamenti = true;
    const inizio = new Date();
    const r = await paga();
    expect(r.errore).toBe("VALIDATION");
    const righe = await db.auditLog.findMany({ where: { orgId: L.orgId, action: "integration.fiscal_operation", createdAt: { gte: inizio } }, orderBy: { createdAt: "asc" } });
    expect(righe.map((x) => (x.diff as { fase: string }).fase)).toEqual(["ATTEMPTED", "FAILED"]);
    const richiesta = cassa.chiamate.filter((c) => c.percorso.endsWith("/pagamenti")).at(-1)!;
    expect(righe[0]!.createdAt.getTime()).toBeLessThanOrEqual(richiesta.il);
    expect((righe[0]!.diff as { classificazione: string }).classificazione).toBe("FISCAL_SIDE_EFFECT_POSSIBLE");
  });
});

/* -------------------------------------------------------------------------- */
/*  11–12. Livelli derivati; fixture e finti non promuovono                   */
/* -------------------------------------------------------------------------- */

describe("gli stati di certificazione si derivano e basta", () => {
  it("nessuna rotta imposta un livello: «conferma» accetta solo POS, e non esiste un'azione per scrivere evidenze", async () => {
    const { POST } = await import("@/app/api/integrations/[slug]/certificazione/route");
    const r = await ordineDiProva(A);
    const api = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ azione: "conferma", runId: r.run, capacita: "create_order", livello: "PROVIDER_API", risposta: "SI" }) }), { params: { slug: SLUG } });
    expect(api.status).toBe(400);
    const inventata = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ azione: "evidenza", capacita: "kitchen", livello: "REAL_POS", esito: "PASSED" }) }), { params: { slug: SLUG } });
    expect(inventata.status).toBe(422);
    const admin = await import("@/app/api/admin/integrazioni/route");
    const perAdmin = await admin.POST(new Request("https://x", { method: "POST", body: JSON.stringify({ azione: "evidenza", slug: SLUG }) }));
    expect(perAdmin.status).toBe(422);
  });

  it("lo script delle fixture scrive solo FIXTURE", () => {
    const script = readFileSync(join(__dirname, "..", "scripts", "certifica-fixture.ts"), "utf8");
    expect([...script.matchAll(/livello:\s*"(\w+)"/g)].map((m) => m[1])).toEqual(["FIXTURE"]);
  });
});

describe("fixture, localhost, server finti: mai evidenze API o POS", () => {
  it("ogni forma di ambiente finto si riconosce", () => {
    trattaFetchDiProvaComeReale(false);
    try {
      expect(motivoAmbienteFinto("tilby")).toMatch(/finto/);
    } finally {
      trattaFetchDiProvaComeReale(true);
    }
    const prima = { ...process.env };
    try {
      process.env.TILBY_API_BASE = "http://localhost:4011/v2";
      expect(motivoAmbienteFinto("tilby", { installazione: { configuration: { ambiente: "sandbox" } } as never, segreti: {} })).toMatch(/TILBY_API_BASE/);
      process.env.TILBY_API_BASE = "http://127.0.0.1:4011";
      expect(motivoAmbienteFinto("tilby", { installazione: { configuration: {} } as never, segreti: {} })).toMatch(/TILBY_API_BASE/);
      process.env.CASSA_IN_CLOUD_API_BASE = "http://127.0.0.1:4010";
      expect(motivoAmbienteFinto("cassa-in-cloud")).toMatch(/CASSA_IN_CLOUD_API_BASE/);
      process.env.ORACLE_SIMPHONY_ORIGINE_PROVA = "http://127.0.0.1:4012";
      expect(motivoAmbienteFinto("oracle-simphony", { installazione: { configuration: {} } as never, segreti: { sts: "http://127.0.0.1:4012" } })).toMatch(/ORACLE_SIMPHONY_ORIGINE_PROVA/);
      // Senza variabili di prova, un fornitore vero resta vero.
      delete process.env.TILBY_API_BASE;
      delete process.env.CASSA_IN_CLOUD_API_BASE;
      delete process.env.ORACLE_SIMPHONY_ORIGINE_PROVA;
      expect(motivoAmbienteFinto("tilby", { installazione: { configuration: {} } as never, segreti: {} })).toBeNull();
    } finally {
      process.env.TILBY_API_BASE = prima.TILBY_API_BASE;
      process.env.CASSA_IN_CLOUD_API_BASE = prima.CASSA_IN_CLOUD_API_BASE;
      process.env.ORACLE_SIMPHONY_ORIGINE_PROVA = prima.ORACLE_SIMPHONY_ORIGINE_PROVA;
      for (const k of ["TILBY_API_BASE", "CASSA_IN_CLOUD_API_BASE", "ORACLE_SIMPHONY_ORIGINE_PROVA"]) if (prima[k] === undefined) delete process.env[k];
    }
  });

  it("contro un fornitore finto: prove senza evidenze, e nessuna conferma POS possibile", async () => {
    trattaFetchDiProvaComeReale(false);
    try {
      const evidenzePrima = await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } });
      await leggi(A.c, SLUG, "tables");
      const r = await ordineDiProva(A);
      expect(await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } })).toBe(evidenzePrima);
      for (const livello of ["REAL_POS", "REAL_POS_ITALY"] as const) {
        expect((await errore(confermaManuale(A.c, SLUG, { runId: r.run, capacita: "kitchen", livello, risposta: "SI" })))).not.toBeNull();
      }
      expect(await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } })).toBe(evidenzePrima);
    } finally {
      trattaFetchDiProvaComeReale(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  16. Ripetizioni: cercare le corse prima della cassa vera                   */
/* -------------------------------------------------------------------------- */

describe("ripetizioni sotto carico", () => {
  it("5 × (ordine + webhook + seconda comanda + webhook): sempre attribuiti, mai regressioni", async () => {
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    const s = await segreto(i.id);
    for (let n = 0; n < 5; n++) {
      const r = await ordineDiProva(A);
      await manda(i.webhookKey, s, { id: `stress-a-${n}-${r.riferimento}`, rif: r.riferimento, stato: "IN_PROGRESS" });
      const a = await anteprimaSecondaComanda(A.c, SLUG, r.run, { righe: [{ externalId: "P2", quantita: 1 }] });
      const due = await secondaComanda(A.c, SLUG, r.run, { righe: [{ externalId: "P2", quantita: 1 }] }, { frase: FRASE_ORDINE, impronta: a.impronta });
      expect(due.accodata).toBe(true);
      await manda(i.webhookKey, s, { id: `stress-b-${n}-${r.riferimento}`, rif: r.riferimento, stato: "READY" });
      const m = await mappaOrdine(i.id, r.riferimento);
      expect(m.metadata).toMatchObject({ stato: "READY" });
      expect(storico(m)).toHaveLength(2);
    }
  });

  it("3 × installa → disinstalla → reinstalla: una riga sola, indirizzo sempre nuovo", async () => {
    const L = await creaLocale("cicli");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    const chiavi = new Set<string>();
    for (let n = 0; n < 3; n++) {
      const i = await finoAdAttiva(L);
      chiavi.add(i.webhookKey);
      await disinstalla(L.attore, SLUG, ORIGINE);
    }
    expect(chiavi.size).toBe(3);
    expect(await db.integrationInstallation.count({ where: { venueId: L.venueId, integrationSlug: SLUG } })).toBe(1);
  });

  it("sincronizzazioni concorrenti: ne parte una alla volta", async () => {
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    cassa.ritardoMs = 40;
    const esiti = await Promise.all([1, 2, 3, 4, 5].map(() => eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" })));
    expect(esiti.filter((e) => e.eseguita)).toHaveLength(1);
  });

  it("due locali, stesso fornitore, in parallelo: ordini e webhook non si incrociano", async () => {
    const [ra, rb] = await Promise.all([ordineDiProva(A), (async () => ordineDiProva(B))()]);
    const ia = (await trovaInstallazione(A.venueId, SLUG))!;
    const ib = (await trovaInstallazione(B.venueId, SLUG))!;
    // Il webhook di B mandato all'indirizzo di A (con il segreto di A) non trova l'ordine di B.
    await manda(ia.webhookKey, await segreto(ia.id), { id: `x-${rb.riferimento}`, rif: rb.riferimento, stato: "CLOSED" });
    expect(await db.externalEntityMapping.findUnique({ where: { installationId_entityType_externalId: { installationId: ib.id, entityType: "ORDER", externalId: rb.riferimento } } }).then((m) => (m!.metadata as { stato?: string }).stato)).toBeUndefined();
    await Promise.all([
      manda(ia.webhookKey, await segreto(ia.id), { id: `pa-${ra.riferimento}`, rif: ra.riferimento, stato: "READY" }),
      manda(ib.webhookKey, await segreto(ib.id), { id: `pb-${rb.riferimento}`, rif: rb.riferimento, stato: "IN_PROGRESS" }),
    ]);
    expect((await mappaOrdine(ia.id, ra.riferimento)).metadata).toMatchObject({ stato: "READY" });
    expect((await mappaOrdine(ib.id, rb.riferimento)).metadata).toMatchObject({ stato: "IN_PROGRESS" });
  });

  it("due installazioni dello stesso locale in parallelo: una riga", async () => {
    const L = await creaLocale("doppia");
    await impostaAccessoBeta({ venueId: L.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    const esiti = await Promise.allSettled([installa(L.attore, SLUG), installa(L.attore, SLUG), installa(L.attore, SLUG)]);
    expect(esiti.filter((e) => e.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await db.integrationInstallation.count({ where: { venueId: L.venueId, integrationSlug: SLUG } })).toBe(1);
  });
});
