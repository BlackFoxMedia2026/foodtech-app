import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/* Le rotte leggono la sessione: qui si decide chi è l'utente. */
const sessione = vi.hoisted(() => ({ superAdmin: null as string | null, venueId: "" }));
vi.mock("@/lib/super-admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/super-admin")>()),
  superAdminCorrente: async () => (sessione.superAdmin ? { ok: true, email: sessione.superAdmin } : { ok: false }),
}));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  const apiError = (status: number, code: string, message: string) => NextResponse.json({ error: code, message }, { status });
  return {
    apiError,
    apiErrorResponse: (err: { httpStatus?: number; code?: string; message?: string }) =>
      apiError(err.httpStatus ?? 500, err.code ?? "errore", err.message ?? ""),
    requireVenueApi: async () => ({
      ok: true,
      venueId: sessione.venueId,
      orgId: "org",
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
import { attiva, connettiConCampi, installa, salvaCapacita, salvaConfigurazione, provaConnessione, usaFetchPerProve } from "@/server/integrations/installazioni";
import { eseguiSincronizzazione } from "@/server/integrations/sync";
import { dettaglioPerLocale } from "@/server/integrations/vista";
import { impostaAccessoBeta, impostaFase, faseDi } from "@/server/integrations/certificazione/accesso";
import { registraEvidenza, statoProvider } from "@/server/integrations/certificazione/evidenze";
import {
  anteprimaOrdine,
  anteprimaSecondaComanda,
  confermaManuale,
  creaOrdineDiProva,
  FRASE_ORDINE,
  FRASE_PAGAMENTO,
  leggi,
  leggiConto,
  motivoPagamentoBloccato,
  pagamentoDiProva,
  prodottiDiProva,
  provaConnessioneReale,
  secondaComanda,
  statoConsole,
  tavoloDiProva,
  traccia,
  trattaFetchDiProvaComeReale,
  type Chiamante,
} from "@/server/integrations/certificazione/console";
import { matrice, statoCertificazione, CAPACITA_CERTIFICABILI } from "@/server/integrations/certificazione/livelli";

/**
 * **La certificazione dei fornitori, contro il database vero.**
 *
 * Il fornitore è finto (uno slug casuale a ogni esecuzione, perché le
 * evidenze sono immutabili e non si cancellano) ma passa dal client HTTP vero,
 * così la traccia registra richieste e risposte ripulite.
 */

const db = new PrismaClient();
const SLUG = `prova-cert-${randomBytes(4).toString("hex")}`;
const PREFISSO = "test-cert-";
const ORIGINE = "https://app.foodtech.test";
const ADMIN = "capo@foodtech.test";

/* --------------------------- il fornitore finto --------------------------- */

const cassa = { ordini: new Map<string, { id: string; tavolo: string | null; righe: { codice: string; q: number }[]; pagato: number }>(), prossimo: 1, rifiutaOrdini: false };

const fetchFinto = (async (url: string, init: RequestInit = {}) => {
  const u = new URL(url);
  const corpo = init.body ? JSON.parse(String(init.body)) : null;
  const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (u.pathname === "/sessione") return json(200, { account: "Cassa demo", access_token: "segretissimo", gestore: { email: "titolare@cassa.it", nome: "Mario" } });
  if (u.pathname === "/tavoli") return json(200, [{ id: "T2", nome: "B2", sala: "S1" }, { id: "T3", nome: "B3", sala: "S1" }]);
  if (u.pathname === "/prodotti") return json(200, [{ id: "P1", nome: "Antipasto", prezzo: 900 }, { id: "P2", nome: "Caffè", prezzo: 150 }]);
  if (u.pathname === "/ordini" && init.method === "POST") {
    if (cassa.rifiutaOrdini) return json(422, { errore: "tavolo occupato" });
    const id = `O${cassa.prossimo++}`;
    cassa.ordini.set(id, { id, tavolo: corpo.tavolo, righe: corpo.righe, pagato: 0 });
    return json(201, { id });
  }
  const m = /^\/ordini\/(\w+)(\/righe|\/pagamenti)?$/.exec(u.pathname);
  if (m) {
    const o = cassa.ordini.get(m[1]!);
    if (!o) return json(404, {});
    if (m[2] === "/righe") o.righe.push(...corpo.righe);
    if (m[2] === "/pagamenti") o.pagato += corpo.importo;
    return json(200, { ...o, totale: o.righe.reduce((s, r) => s + (r.codice === "P1" ? 900 : 150) * r.q, 0) });
  }
  return json(404, {});
}) as unknown as typeof fetch;

const BASE = "https://cassa-finta.example.com";
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
  async sincronizza(ctx) {
    const t = await ctx.http.richiesta<{ id: string; nome: string }[]>({ url: `${BASE}/tavoli` });
    const p = await ctx.http.richiesta<{ id: string; nome: string; prezzo: number }[]>({ url: `${BASE}/prodotti` });
    return {
      entita: [
        ...t.map((x) => ({ tipo: "TABLE" as const, externalId: x.id, etichetta: x.nome })),
        ...p.map((x) => ({ tipo: "PRODUCT" as const, externalId: x.id, etichetta: x.nome, metadata: { prezzoCents: x.prezzo, varianti: x.id === "P1" ? [{ id: "v" }] : [] } })),
      ],
      scartati: [],
    };
  },
  pos: {
    async getLocations() {
      return [{ externalId: "sede-1", nome: "Torino Test", account: null }];
    },
    async getFloors() {
      return [{ externalId: "S1", nome: "Sala interna" }];
    },
    async getTables(ctx) {
      const t = await ctx.http.richiesta<{ id: string; nome: string; sala: string }[]>({ url: `${BASE}/tavoli` });
      return t.map((x) => ({ externalId: x.id, etichetta: x.nome, salaExternalId: x.sala, posti: 4, attivo: true }));
    },
    async getMenu() {
      return [];
    },
    async createOrder(ctx, o) {
      const r = await ctx.http.richiesta<{ id: string }>({ metodo: "POST", url: `${BASE}/ordini`, corpo: { tavolo: o.tavoloExternalId, righe: o.righe.map((x) => ({ codice: x.codiceProdotto, q: x.quantita })) } });
      return { accettato: true, externalId: r.id };
    },
    async updateOrder(ctx, id, o) {
      await ctx.http.richiesta({ metodo: "POST", url: `${BASE}/ordini/${id}/righe`, corpo: { righe: o.righe.map((x) => ({ codice: x.codiceProdotto, q: x.quantita })) } });
    },
    async getOrder(ctx, id) {
      const r = await ctx.http.richiesta<{ id: string; totale: number; righe: { codice: string; q: number }[] }>({ url: `${BASE}/ordini/${id}` });
      return { externalId: r.id, riferimento: null, stato: "IN_PROGRESS", tavolo: null, totaleCents: r.totale + 50, righe: r.righe.map((x) => ({ codiceProdotto: x.codice, nome: x.codice, quantita: x.q, prezzoUnitarioCents: null, note: null })) };
    },
    async createPayment(ctx, p) {
      await ctx.http.richiesta({ metodo: "POST", url: `${BASE}/ordini/${p.riferimentoOrdine}/pagamenti`, corpo: { importo: p.importoCents } });
    },
  },
};

const voce: VoceCatalogo = {
  id: "int_prova_cert",
  slug: SLUG,
  nome: "Cassa da certificare",
  fornitore: "Prova",
  categoria: "POS",
  descrizione: "Solo per le prove.",
  logo: { monogramma: "Pc" },
  implementazione: "IN_DEVELOPMENT",
  disponibilita: "PREVIEW",
  autenticazione: { modalita: "API_KEY", verificata: true },
  capacita: ["locations", "tables", "menu", "orders.read", "orders.write", "payments.write"],
  webhook: { eventi: [], autenticazione: "nessuna" },
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

type Locale = { venueId: string; orgId: string; c: Chiamante };
async function creaLocale(nome: string): Promise<Locale> {
  const org = await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const venue = await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  return {
    venueId: venue.id,
    orgId: org.id,
    c: { venueId: venue.id, email: ADMIN, origine: ORIGINE, audit: { userId: "admin", email: ADMIN, orgId: org.id, venueId: venue.id } },
  };
}
const attore = (l: Locale) => ({ venueId: l.venueId, orgId: l.orgId, userId: "u" });

let A: Locale;
let B: Locale;
const annulla: (() => void)[] = [];
const envPrima = { chiave: process.env.CHIAVE_CIFRATURA, segreto: process.env.NEXTAUTH_SECRET };

async function pulisci() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: PREFISSO } }, select: { id: true } });
  const venues = await db.venue.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { id: true } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
}

async function finoAdAttiva(l: Locale) {
  await installa(attore(l), SLUG);
  await connettiConCampi(attore(l), SLUG, { apiKey: "k" });
  await salvaConfigurazione(attore(l), SLUG, { configurazione: { sede: "sede-1" }, etichette: { sede: "Torino Test" } });
  await provaConnessione(attore(l), SLUG, ORIGINE);
  await salvaCapacita(attore(l), SLUG, ["locations", "tables", "menu", "orders.read", "orders.write", "payments.write"], ORIGINE);
  await attiva(attore(l), SLUG, ORIGINE);
  const i = await db.integrationInstallation.findFirstOrThrow({ where: { venueId: l.venueId, integrationSlug: SLUG } });
  await eseguiSincronizzazione({ installationId: i.id, venueId: l.venueId, operazione: "full", trigger: "MANUAL" });
}

beforeAll(async () => {
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 4).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  annulla.push(registraVocePerProve(voce), registraAdattatorePerProve(adattatore as IntegrationAdapter));
  usaFetchPerProve(fetchFinto);
  await pulisci();
  A = await creaLocale("a");
  B = await creaLocale("b");
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
  sessione.superAdmin = ADMIN;
  sessione.venueId = A.venueId;
});

const errore = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { codice?: string; code?: string; httpStatus?: number; message: string };

/* -------------------------------------------------------------------------- */

describe("accesso beta e marketplace", () => {
  it("un'anteprima senza accesso beta non si installa: «Disponibilità su richiesta»", async () => {
    expect(await faseDi(SLUG)).toBe("INTERNAL");
    await expect(installa(attore(A), SLUG)).rejects.toMatchObject({ code: "integration_beta_required", httpStatus: 403 });
    expect((await dettaglioPerLocale(A.venueId, SLUG, false))!.voce.nonInstallabile).toMatch(/Disponibilità su richiesta/);
  });

  it("accesso beta al locale A: A installa, B resta fuori", async () => {
    await impostaAccessoBeta({ venueId: A.venueId, slug: SLUG, abilitato: true, email: ADMIN });
    await finoAdAttiva(A);
    expect((await dettaglioPerLocale(A.venueId, SLUG, false))!.installazione?.status).toBe("ACTIVE");
    await expect(installa(attore(B), SLUG)).rejects.toMatchObject({ code: "integration_beta_required" });
    expect((await dettaglioPerLocale(B.venueId, SLUG, false))!.voce.nonInstallabile).toMatch(/su richiesta/);
    const riga = await db.integrationBetaAccess.findUniqueOrThrow({ where: { venueId_integrationSlug: { venueId: A.venueId, integrationSlug: SLUG } } });
    expect(riga).toMatchObject({ enabled: true, fiscalTestsAuthorized: false, enabledByEmail: ADMIN });
  });
});

describe("chi entra nella console", () => {
  it("un ristoratore (non Super Admin) riceve 404, anche con tutti i permessi del locale", async () => {
    const { GET, POST } = await import("@/app/api/integrations/[slug]/certificazione/route");
    sessione.superAdmin = null;
    expect((await GET(new Request("https://x"), { params: { slug: SLUG } })).status).toBe(404);
    const r = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ azione: "prova" }) }), { params: { slug: SLUG } });
    expect(r.status).toBe(404);
    const admin = await import("@/app/api/admin/integrazioni/route");
    expect((await admin.GET()).status).toBe(404);
  });

  it("il Super Admin vede lo stato: implementazione e certificazione separate", async () => {
    const { GET } = await import("@/app/api/integrations/[slug]/certificazione/route");
    const r = await GET(new Request("https://x"), { params: { slug: SLUG } });
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.provider.implementazione).toBe("IN_DEVELOPMENT");
    expect(s.certificazione.stato).toBe("PREVIEW");
    expect(s.rilascio).toBe("INTERNAL");
    expect(JSON.stringify(s)).not.toContain('"k"');
  });
});

describe("contro un fornitore finto non nascono evidenze API", () => {
  it("prova e letture riescono, ma restano senza evidenza e la console lo dice", async () => {
    const p = await provaConnessioneReale(A.c, SLUG);
    expect(p).toMatchObject({ ambienteVero: false, provider: SLUG, location: "Torino Test" });
    const l = await leggi(A.c, SLUG, "tables");
    expect(l.ambienteVero).toBe(false);
    expect(await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG } })).toBe(0);
  });
});

describe("con un fornitore vero (simulato): letture, ordine di prova, traccia", () => {
  beforeAll(() => trattaFetchDiProvaComeReale(true));

  it("test connessione: provider, workspace, location, tempi, autenticazione, salute — senza segreti", async () => {
    const p = await provaConnessioneReale(A.c, SLUG);
    expect(p).toMatchObject({ ambienteVero: true, workspace: `${PREFISSO}a`, location: "Torino Test", autenticazione: { tipo: "API_KEY" } });
    expect(p.tempoRispostaMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(p)).not.toMatch(/segretissimo/);
    const e = await db.integrationCertificationEvidence.findFirstOrThrow({ where: { integrationSlug: SLUG, capability: "connection" } });
    expect(e).toMatchObject({ level: "PROVIDER_API", result: "PASSED", operatorEmail: ADMIN, manualConfirmation: false, venueName: `${PREFISSO}a` });
  });

  it("leggi tavoli: normalizzata e grezza a confronto, la grezza ripulita da token e dati personali", async () => {
    const l = await leggi(A.c, SLUG, "tables");
    expect(l.normalizzata).toEqual([
      { externalId: "T2", etichetta: "B2", salaExternalId: "S1", posti: 4, attivo: true },
      { externalId: "T3", etichetta: "B3", salaExternalId: "S1", posti: 4, attivo: true },
    ]);
    expect(l.grezza[0]).toMatchObject({ endpoint: `GET ${BASE}/tavoli`, status: 200 });
    // Una risposta con token e dati personali (la sessione): ripulita.
    const run = await db.integrationCertificationRun.findFirstOrThrow({ where: { integrationSlug: SLUG, kind: "TEST_CONNECTION", realEnvironment: true } });
    const testo = JSON.stringify(run.trace);
    expect(testo).not.toContain("segretissimo");
    expect(testo).not.toContain("titolare@cassa.it");
    expect(testo).toContain("Cassa demo");
    // Nessun dato di Foodtech toccato: nessun tavolo nuovo.
    expect(await db.table.count({ where: { venueId: A.venueId } })).toBe(0);
  });

  it("tavolo e prodotti di prova: id esterno, sala, stato, mappatura; varianti indicate", async () => {
    const t = await tavoloDiProva(A.c, SLUG, "T2");
    expect(t).toMatchObject({ externalId: "T2", etichetta: "B2", sala: { externalId: "S1", nome: "Sala interna" }, stato: "attivo", mappatura: { abbinato: null } });
    const p = await prodottiDiProva(A.c, SLUG);
    expect(p.find((x) => x.externalId === "P1")!.indizi.conVarianti).toBe(true);
    expect(p.find((x) => x.externalId === "P2")!.indizi.conVarianti).toBe(false);
  });

  let ordineRun = "";
  it("ordine di prova: anteprima, conferma esplicita, riferimento riconoscibile, evidenze API", async () => {
    const scelta = { tavoloExternalId: "T2", righe: [{ externalId: "P1", quantita: 2 }] };
    const a = await anteprimaOrdine(A.c, SLUG, scelta);
    expect(a).toMatchObject({ provider: "Cassa da certificare", location: "Torino Test", tavolo: "B2", importoAttesoCents: 1800, senzaPagamentiNeFiscale: true });
    // Senza la frase, o con una scelta diversa dall'anteprima: niente.
    expect((await errore(creaOrdineDiProva(A.c, SLUG, scelta, { frase: "ok", impronta: a.impronta }))).codice).toBe("conferma_mancante");
    expect((await errore(creaOrdineDiProva(A.c, SLUG, { ...scelta, righe: [{ externalId: "P1", quantita: 3 }] }, { frase: FRASE_ORDINE, impronta: a.impronta }))).codice).toBe("anteprima_diversa");
    expect(cassa.ordini.size).toBe(0);

    const r = await creaOrdineDiProva(A.c, SLUG, scelta, { frase: FRASE_ORDINE, impronta: a.impronta });
    ordineRun = r.run;
    expect(r.riferimento).toMatch(/^ft-test-/);
    expect(r.esito).toMatchObject({ stato: "SYNCED", idEsterno: "O1" });
    const caps = await db.integrationCertificationEvidence.findMany({ where: { integrationSlug: SLUG, runId: r.run } });
    expect(caps.map((e) => [e.capability, e.level, e.result]).sort()).toEqual([
      ["create_order", "PROVIDER_API", "PASSED"],
      ["table_association", "PROVIDER_API", "PASSED"],
    ]);
  });

  it("traccia: Foodtech → payload → richiesta → risposta → id esterno → mappatura → stato finale", async () => {
    const t = await traccia(A.c, SLUG, ordineRun);
    const fasi = t.passi.map((p) => p.fase);
    expect(fasi).toEqual(expect.arrayContaining(["foodtech", "adapter", "provider", "stato"]));
    expect(t.passi.find((p) => p.fase === "provider")!.titolo).toMatch(/POST .*\/ordini → 201/);
    expect(t.passi.some((p) => /Mappatura ORDER/.test(p.titolo))).toBe(true);
    expect(t.passi.find((p) => p.fase === "stato")!.dati).toMatchObject({ invio: { stato: "SYNCED" } });
    expect(t.passi.every((p) => typeof p.il === "string")).toBe(true);
  });

  it("seconda comanda: si accoda allo stesso ordine, e il conto mostra la differenza senza correggerla", async () => {
    const righe = [{ externalId: "P2", quantita: 2 }];
    const a = await anteprimaSecondaComanda(A.c, SLUG, ordineRun, { righe });
    expect(a.effettiAttesi[0]).toMatch(/AGGIUNGONO/);
    const r = await secondaComanda(A.c, SLUG, ordineRun, { righe }, { frase: FRASE_ORDINE, impronta: a.impronta });
    expect(r.accodata).toBe(true);
    expect(cassa.ordini.get("O1")!.righe).toEqual([{ codice: "P1", q: 2 }, { codice: "P2", q: 2 }]);
    const e = await db.integrationCertificationEvidence.findFirstOrThrow({ where: { integrationSlug: SLUG, runId: r.run } });
    expect([e.capability, e.level]).toEqual(["add_round", "PROVIDER_API"]);

    const conto = await leggiConto(A.c, SLUG, ordineRun);
    expect(conto).toMatchObject({ attesoFoodtechCents: 2100, totaleProviderCents: 2150, differenzaCents: 50 });
  });

  it("la console di B non vede le prove di A", async () => {
    const s = await statoConsole(B.c, SLUG);
    expect(s.prove).toHaveLength(0);
    expect((await errore(traccia(B.c, SLUG, ordineRun))).codice).toBe("not_found");
  });

  describe("conferme manuali: l'unica strada per REAL_POS", () => {
    it("un 200 non basta: senza una persona che conferma, nessun REAL_POS", async () => {
      expect((await errore(registraEvidenza({ slug: SLUG, capacita: "kitchen", livello: "REAL_POS", esito: "PASSED", venueId: A.venueId, operatore: ADMIN }))).codice).toBe("serve_conferma_manuale");
      const s = await statoProvider(SLUG);
      expect(s.righe.find((r) => r.capacita.chiave === "kitchen")!.celle.REAL_POS.esito).toBeNull();
    });

    it("«La comanda è stata stampata?» SÌ → evidenza REAL_POS con provider, sede, data, ordine, operatore", async () => {
      const e = await confermaManuale(A.c, SLUG, { runId: ordineRun, capacita: "kitchen", livello: "REAL_POS", risposta: "SI", note: "Stampata sulla stampante cucina", riferimentoProva: "foto-cucina-01.jpg" });
      expect(e).toMatchObject({ level: "REAL_POS", result: "PASSED", manualConfirmation: true, externalEntityId: "O1", externalLocationId: "sede-1", operatorEmail: ADMIN, evidenceRef: "foto-cucina-01.jpg" });
    });

    it("«Solo le righe nuove?» NO → evidenza FAILED sulla seconda comanda", async () => {
      const run = await db.integrationCertificationRun.findFirstOrThrow({ where: { integrationSlug: SLUG, kind: "SECOND_ROUND" } });
      const e = await confermaManuale(A.c, SLUG, { runId: run.id, capacita: "add_round", livello: "REAL_POS", risposta: "NO", note: "Ristampata tutta la comanda" });
      expect(e.result).toBe("FAILED");
    });

    it("una capacità che la prova non dimostra, o una prova contro un fornitore finto: rifiutate", async () => {
      expect((await errore(confermaManuale(A.c, SLUG, { runId: ordineRun, capacita: "add_round", livello: "REAL_POS", risposta: "SI" }))).codice).toBe("capacita_non_pertinente");
      const finta = await db.integrationCertificationRun.findFirstOrThrow({ where: { integrationSlug: SLUG, realEnvironment: false } });
      await expect(confermaManuale(A.c, SLUG, { runId: finta.id, capacita: "kitchen", livello: "REAL_POS", risposta: "SI" })).rejects.toBeTruthy();
    });
  });

  describe("sicurezza fiscale", () => {
    it("il pagamento di prova è bloccato per difetto, e senza autorizzazione esplicita non parte", async () => {
      expect(await motivoPagamentoBloccato(A.c, SLUG)).toMatch(/non autorizzate/);
      const e = await errore(pagamentoDiProva(A.c, SLUG, ordineRun, { importoCents: 500, tenderExternalId: "x" }, { frase: FRASE_PAGAMENTO }));
      expect([e.codice, e.httpStatus]).toEqual(["operazione_fiscale_bloccata", 403]);
      expect(cassa.ordini.get("O1")!.pagato).toBe(0);
    });

    it("evidenze fiscali (chiusura, documento, POS IT) rifiutate senza locale autorizzato", async () => {
      expect((await errore(confermaManuale(A.c, SLUG, { runId: ordineRun, capacita: "kitchen", livello: "REAL_POS_ITALY", risposta: "SI" }))).codice).toBeTruthy();
    });

    it("autorizzato dal Super Admin: frase obbligatoria, audit dell'operazione fiscale, evidenza API", async () => {
      await impostaAccessoBeta({ venueId: A.venueId, slug: SLUG, abilitato: true, operazioniFiscali: true, email: ADMIN });
      const i = await db.integrationInstallation.findFirstOrThrow({ where: { venueId: A.venueId, integrationSlug: SLUG } });
      await db.externalEntityMapping.create({ data: { venueId: A.venueId, installationId: i.id, entityType: "PAYMENT_METHOD", externalId: "contanti", externalLabel: "Contanti" } });
      expect(await motivoPagamentoBloccato(A.c, SLUG)).toBeNull();
      expect((await errore(pagamentoDiProva(A.c, SLUG, ordineRun, { importoCents: 500, tenderExternalId: "contanti" }, { frase: "si" }))).codice).toBe("conferma_mancante");
      const r = await pagamentoDiProva(A.c, SLUG, ordineRun, { importoCents: 500, tenderExternalId: "contanti" }, { frase: FRASE_PAGAMENTO });
      expect(r.errore).toBeNull();
      expect(cassa.ordini.get("O1")!.pagato).toBe(500);
      const audit = await db.auditLog.findFirst({ where: { orgId: A.orgId, action: "integration.fiscal_operation" } });
      expect(audit!.diff).toMatchObject({ classificazione: "FISCAL_SIDE_EFFECT_POSSIBLE", importoCents: 500, operatore: ADMIN });
    });

    it("mai con un fornitore finto, anche se autorizzato", async () => {
      trattaFetchDiProvaComeReale(false);
      try {
        const e = await errore(pagamentoDiProva(A.c, SLUG, ordineRun, { importoCents: 100, tenderExternalId: "contanti" }, { frase: FRASE_PAGAMENTO }));
        expect(e.codice).toBe("operazione_fiscale_bloccata");
        expect(e.message).toMatch(/Ambiente finto/);
      } finally {
        trattaFetchDiProvaComeReale(true);
      }
    });
  });

  it("un ordine rifiutato dal fornitore registra un'evidenza FAILED", async () => {
    cassa.rifiutaOrdini = true;
    const scelta = { tavoloExternalId: "T3", righe: [{ externalId: "P2", quantita: 1 }] };
    const a = await anteprimaOrdine(A.c, SLUG, scelta);
    const r = await creaOrdineDiProva(A.c, SLUG, scelta, { frase: FRASE_ORDINE, impronta: a.impronta });
    expect(r.esito).toMatchObject({ stato: "FAILED" });
    const e = await db.integrationCertificationEvidence.findFirstOrThrow({ where: { integrationSlug: SLUG, runId: r.run, capability: "create_order" } });
    expect(e.result).toBe("FAILED");
  });
});

describe("evidenze immutabili, matrice, stato, rilascio", () => {
  it("un'evidenza non si modifica né si cancella (lo impedisce il database)", async () => {
    const e = await db.integrationCertificationEvidence.findFirstOrThrow({ where: { integrationSlug: SLUG } });
    await expect(db.integrationCertificationEvidence.update({ where: { id: e.id }, data: { result: "PASSED" } })).rejects.toThrow(/immutabile/);
    await expect(db.integrationCertificationEvidence.delete({ where: { id: e.id } })).rejects.toThrow(/immutabile/);
  });

  it("certificazione ripetuta: vale la più recente, le vecchie restano", async () => {
    const prima = await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG, capability: "read_bill" } });
    await registraEvidenza({ slug: SLUG, capacita: "read_bill", livello: "PROVIDER_API", esito: "FAILED", venueId: A.venueId, operatore: ADMIN });
    let s = await statoProvider(SLUG);
    expect(s.righe.find((r) => r.capacita.chiave === "read_bill")!.celle.PROVIDER_API.esito).toBe("FAILED");
    await registraEvidenza({ slug: SLUG, capacita: "read_bill", livello: "PROVIDER_API", esito: "PASSED", venueId: A.venueId, operatore: ADMIN });
    s = await statoProvider(SLUG);
    expect(s.righe.find((r) => r.capacita.chiave === "read_bill")!.celle.PROVIDER_API.esito).toBe("PASSED");
    expect(await db.integrationCertificationEvidence.count({ where: { integrationSlug: SLUG, capability: "read_bill" } })).toBe(prima + 2);
  });

  it("la matrice non deduce: un REAL_POS non riempie la casella API, e le celle vuote restano vuote", () => {
    const t = new Date();
    const righe = matrice(CAPACITA_CERTIFICABILI, [{ capability: "kitchen", level: "REAL_POS", result: "PASSED", createdAt: t }]);
    const k = righe.find((r) => r.capacita.chiave === "kitchen")!;
    expect(k.celle.REAL_POS.esito).toBe("PASSED");
    expect(k.celle.PROVIDER_API.esito).toBeNull();
    expect(righe.find((r) => r.capacita.chiave === "fiscal_document")!.celle.FIXTURE.applicabile).toBe(false);
    expect(statoCertificazione(righe)).toBe("PREVIEW");
  });

  it("stato del fornitore: le capacità essenziali API superate → API_VERIFIED; «Invia comanda» non ancora", async () => {
    const s = await statoProvider(SLUG);
    // Mancano menu e tavoli a livello API: si registrano leggendo.
    await leggi(A.c, SLUG, "menu").catch(() => null);
    await registraEvidenza({ slug: SLUG, capacita: "menu", livello: "PROVIDER_API", esito: "PASSED", venueId: A.venueId, operatore: ADMIN });
    await registraEvidenza({ slug: SLUG, capacita: "kitchen", livello: "PROVIDER_API", esito: "PASSED", venueId: A.venueId, operatore: ADMIN });
    await registraEvidenza({ slug: SLUG, capacita: "create_order", livello: "PROVIDER_API", esito: "PASSED", venueId: A.venueId, operatore: ADMIN });
    const dopo = await statoProvider(SLUG);
    expect(s.stato).toBe("PREVIEW");
    expect(dopo.stato).toBe("API_VERIFIED");
    expect(dopo.inviaComanda.pronto).toBe(false);
    expect(dopo.inviaComanda.mancano).toEqual(expect.arrayContaining(["create_order", "table_association", "add_round"]));
  });

  it("rilascio: GA rifiutata senza POS verificato; beta pubblica ammessa con l'API verificata, e B installa", async () => {
    expect((await errore(impostaFase({ slug: SLUG, fase: "GENERAL_AVAILABILITY", email: ADMIN }))).codice).toBe("certificazione_insufficiente");
    await impostaFase({ slug: SLUG, fase: "PUBLIC_BETA", email: ADMIN });
    expect(await faseDi(SLUG)).toBe("PUBLIC_BETA");
    await installa(attore(B), SLUG);
    // E si torna indietro quando si vuole.
    await impostaFase({ slug: SLUG, fase: "PRIVATE_BETA", email: ADMIN });
    // Già installata da B: restringere il rilascio non disinstalla niente.
    expect((await dettaglioPerLocale(B.venueId, SLUG, false))!.installazione).not.toBeNull();
  });

  it("revocare l'accesso beta revoca anche le operazioni fiscali", async () => {
    const r = await impostaAccessoBeta({ venueId: A.venueId, slug: SLUG, abilitato: false, operazioniFiscali: true, email: ADMIN });
    expect(r).toMatchObject({ enabled: false, fiscalTestsAuthorized: false });
    expect(await motivoPagamentoBloccato(A.c, SLUG)).toMatch(/non autorizzate/);
  });
});
