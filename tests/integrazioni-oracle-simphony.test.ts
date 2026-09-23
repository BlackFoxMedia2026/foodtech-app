import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { oracleSimphony } from "@/server/integrations/adapters/oracle-simphony";
import { coppiaPkce, codiceDa, cookieDa } from "@/server/integrations/adapters/oracle-simphony/autenticazione";
import { regoleIndirizzo } from "@/server/integrations/adapters/oracle-simphony/config";
import {
  corpoCheck,
  firmaValida,
  idempotencyId,
  leggiNotifica,
  menu,
  nonDisponibili,
  righeCheck,
  statoCheck,
  totali,
  tradotto,
} from "@/server/integrations/adapters/oracle-simphony/traduzione";
import { creaClientFornitore } from "@/server/integrations/adapters/http";
import type { ContestoAdattatore } from "@/server/integrations/adapters/tipi";
import type { OrdineDaInviare } from "@/server/integrations/dominio";
import { ErroreIntegrazione } from "@/server/integrations/errori";
import { controllaPrimaDiChiamare, ipRiservato, usaRisolutorePerProve, validaIndirizzo } from "@/server/integrations/indirizzi";
import { HOST_AUTH, HOST_STS, ORACLE } from "./fixture-oracle-simphony";
import { creaOracleFinto } from "./oracle-finto";

/**
 * **L'adattatore Oracle Simphony STS Gen2, contro lo swagger ufficiale.**
 *
 * Nessuna chiamata esce da qui: il server è `oracle-finto.ts`, costruito
 * sugli schemi. Queste prove dicono che l'adattatore segue la documentazione
 * — **non** che funzioni con Oracle. Livello: TESTED_WITH_FIXTURE.
 */

let oracle = creaOracleFinto();
const errore = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ErroreIntegrazione;

beforeAll(() => usaRisolutorePerProve(async () => ["20.50.60.70"]));
afterAll(() => usaRisolutorePerProve(undefined));
beforeEach(() => {
  oracle = creaOracleFinto();
});

const http = (token?: string) =>
  creaClientFornitore({
    slug: "oracle-simphony",
    correlationId: "c",
    fetchImpl: oracle.fetchFinto,
    intestazioni: (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
  });

const CAMPI = { sts: `${HOST_STS}/api/v1`, auth: HOST_AUTH, clientId: "client-A", organizzazione: "TFOINC", utente: "api-a", password: "segreta-A" };

async function contesto(conf: Record<string, unknown> = {}, extra: Partial<ContestoAdattatore["installazione"]> = {}): Promise<ContestoAdattatore> {
  const c = await oracleSimphony.connetti!({ campi: CAMPI, http: http() });
  return {
    installazione: {
      id: "inst_o",
      venueId: "venue_A",
      configuration: { destinazione: "fdmnh144:42", tipoOrdine: "fdmnh144:42:1", dipendente: "900", ...conf },
      enabledCapabilities: ["orders.write"],
      externalAccountId: "tfoinc",
      externalLocationId: "fdmnh144:42",
      webhookKey: "chiave-webhook-oracle",
      metadata: null,
      ...extra,
    },
    segreti: c.segreti,
    http: http(c.segreti.accessToken),
    correlationId: "c",
    origine: "https://app.foodtech.com",
  };
}

const riga = (menuItemId: number, nome: string, q: number, note: string | null = null) => ({
  codiceProdotto: `${menuItemId}-1`,
  nome,
  quantita: q,
  prezzoUnitarioCents: null,
  note,
  datiProdotto: { menuItemId, definitionSequence: 1 },
});
const prima: OrdineDaInviare = {
  riferimento: "ft-cmd-1",
  tavolo: "B2",
  tavoloExternalId: "B2",
  coperti: 2,
  cliente: null,
  nota: null,
  righe: [riga(101, "Antipasto della casa", 2), riga(102, "Primo del giorno", 2)],
};
const aggiunta: OrdineDaInviare = { ...prima, riferimento: "ft-cmd-2", coperti: null, righe: [riga(201, "Tiramisù", 2), riga(202, "Caffè", 2)] };

/* -------------------------------------------------------------------------- */

describe("indirizzi per installazione: niente SSRF", () => {
  const regole = { suffissi: ["oracleindustry.com"], originePerProve: null };

  it("solo https, solo domini ammessi, niente IP, localhost, credenziali o query", () => {
    expect(validaIndirizzo(`${HOST_STS}/api/v1/`, regole)).toBe(`${HOST_STS}/api/v1`);
    for (const cattivo of [
      "http://tfoinc-stsg2.oracleindustry.com",
      "https://evil.example.com",
      "https://oracleindustry.com.evil.com",
      "https://169.254.169.254/latest",
      "https://[::1]/",
      "https://localhost",
      "https://utente:pw@tfoinc.oracleindustry.com",
      "https://tfoinc.oracleindustry.com/?x=1",
      "non un indirizzo",
    ]) {
      expect(() => validaIndirizzo(cattivo, regole), cattivo).toThrow(ErroreIntegrazione);
    }
  });

  it("un nome ammesso che risolve in una rete privata non si chiama", async () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(ipRiservato(ip), ip).toBe(true);
    }
    expect(ipRiservato("20.50.60.70")).toBe(false);
    usaRisolutorePerProve(async () => ["20.50.60.70", "10.0.0.9"]);
    try {
      expect((await errore(controllaPrimaDiChiamare(`${HOST_STS}/api/v1/organizations`, regole))).codice).toBe("INVALID_CONFIGURATION");
    } finally {
      usaRisolutorePerProve(async () => ["20.50.60.70"]);
    }
  });

  it("domini in più solo dall'operatore; l'origine di prova solo se è loopback", () => {
    const r = regoleIndirizzo({ ORACLE_SIMPHONY_DOMINI_CONSENTITI: "cliente.example.com, *.altro.example.net, nonvalido" } as unknown as NodeJS.ProcessEnv);
    expect(r.suffissi).toEqual(["oracleindustry.com", "cliente.example.com", "altro.example.net"]);
    expect(regoleIndirizzo({ ORACLE_SIMPHONY_ORIGINE_PROVA: "http://127.0.0.1:4012" } as unknown as NodeJS.ProcessEnv).originePerProve).toBe("http://127.0.0.1:4012");
    expect(regoleIndirizzo({ ORACLE_SIMPHONY_ORIGINE_PROVA: "http://10.0.0.1:4012" } as unknown as NodeJS.ProcessEnv).originePerProve).toBeNull();
  });

  it("ogni chiamata vieta i redirect (il server finto rifiuta chi non lo fa)", async () => {
    const ctx = await contesto();
    await oracleSimphony.provaConnessione(ctx);
    expect(oracle.stato.chiamate.length).toBeGreaterThan(3);
  });
});

describe("accesso: OpenID Connect, Authorization Code + PKCE", () => {
  it("PKCE S256, cookie dall'authorize al signin, code nel redirectUrl", () => {
    const { verifier, challenge } = coppiaPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieDa(new Headers({ "set-cookie": "oidc_session=abc; Path=/; HttpOnly" }))).toBe("oidc_session=abc");
    expect(codiceDa("apiaccount://callback?code=abc%3D")).toBe("abc=");
    expect(codiceDa("?code=xyz=")).toBe("xyz=");
  });

  it("connetti: authorize → signin → token; bearer = id_token; la password non si salva", async () => {
    const c = await oracleSimphony.connetti!({ campi: CAMPI, http: http() });
    const passi = oracle.stato.chiamate.map((x) => `${x.metodo} ${new URL(x.url).pathname}`);
    expect(passi).toEqual([
      "GET /oidc-provider/v1/oauth2/authorize",
      "POST /oidc-provider/v1/oauth2/signin",
      "POST /oidc-provider/v1/oauth2/token",
    ]);
    const firma = new URLSearchParams(oracle.stato.chiamate[1]!.corpo!);
    expect([firma.get("username"), firma.get("orgname")]).toEqual(["api-a", "tfoinc"]);
    expect(c.kind).toBe("OAUTH2");
    expect(c.segreti.accessToken).toMatch(/^id-client-A-/);
    expect(c.segreti.sts).toBe(HOST_STS);
    expect(JSON.stringify(c.segreti)).not.toContain("segreta-A");
    // Rinnovo con anticipo (4 giorni prima dei 14), refresh valido 28 giorni.
    const giorni = (d: Date | null) => Math.round((d!.getTime() - Date.now()) / 86_400_000);
    expect(giorni(c.accessTokenExpiresAt)).toBe(10);
    expect(giorni(c.refreshTokenExpiresAt)).toBe(28);
  });

  it("credenziali sbagliate, password scaduta: «accesso rifiutato», niente di salvato", async () => {
    expect((await errore(oracleSimphony.connetti!({ campi: { ...CAMPI, password: "no" }, http: http() }))).codice).toBe("AUTH_INVALID");
    const scaduta = (async (url: string, init: RequestInit) =>
      url.includes("/signin") ? new Response(JSON.stringify({ nextOp: "expired" }), { status: 200, headers: { "content-type": "application/json" } }) : oracle.fetchFinto(url, init)) as unknown as typeof fetch;
    const e = await errore(oracleSimphony.connetti!({ campi: CAMPI, http: creaClientFornitore({ slug: "o", correlationId: "c", fetchImpl: scaduta }) }));
    expect(e.codice).toBe("AUTH_INVALID");
    expect(e.message).toMatch(/60 giorni/);
  });

  it("la password va solo a un OpenID Provider ammesso", async () => {
    const e = await errore(oracleSimphony.connetti!({ campi: { ...CAMPI, auth: "https://raccoglitore.example.com" }, http: http() }));
    expect(e.codice).toBe("INVALID_CONFIGURATION");
    expect(oracle.stato.chiamate).toHaveLength(0);
  });

  it("rinnovo: grant_type=refresh_token, il refresh token ruota; morto → AUTH_EXPIRED", async () => {
    const ctx = await contesto();
    const nuove = await oracleSimphony.rinnovaAutenticazione!({ ...ctx, http: http() });
    expect(nuove.segreti.refreshToken).not.toBe(ctx.segreti.refreshToken);
    expect(nuove.segreti.clientId).toBe("client-A");
    // Il vecchio refresh token non vale più.
    expect((await errore(oracleSimphony.rinnovaAutenticazione!({ ...ctx, http: http() }))).codice).toBe("AUTH_EXPIRED");
  });

  it("id_token revocato durante il lavoro: 401 → accesso scaduto", async () => {
    const ctx = await contesto();
    oracle.stato.guasto = "token_revocato";
    expect((await errore(oracleSimphony.pos.getTables!(ctx))).codice).toBe("AUTH_EXPIRED");
  });
});

describe("organizzazione, location, revenue center", () => {
  it("le opzioni: ogni revenue center di ogni location, e i suoi tipi d'ordine", async () => {
    const o = await oracleSimphony.opzioniConfigurazione!(await contesto());
    expect(o.locations).toEqual([
      { value: "fdmnh144:42", label: "Ristorante Torino · Sala" },
      { value: "milano01:7", label: "Ristorante Milano · Bar" },
    ]);
    expect(o.order_types).toContainEqual({ value: "fdmnh144:42:1", label: "Sala — Eat In" });
  });

  it("la prova: organizzazione autorizzata, RVC, tipo d'ordine, dipendente, POS collegato", async () => {
    const r = await oracleSimphony.provaConnessione(await contesto());
    expect(r.account).toEqual({ externalId: "tfoinc", nome: "TFO Inc" });
    expect(r.sedi[0]).toMatchObject({ externalId: "fdmnh144:42", nome: "Sala" });
    expect(r.avvisi).toEqual([]);
    const head = oracle.stato.chiamate.find((c) => c.metodo === "HEAD")!;
    expect(head.intestazioni).toMatchObject({ "simphony-orgshortname": "tfoinc", "simphony-locref": "fdmnh144", "simphony-rvcref": "42" });
  });

  it("API raggiungibile ma POS scollegato: la prova riesce e lo dice", async () => {
    oracle.stato.posCollegato = false;
    const r = await oracleSimphony.provaConnessione(await contesto());
    expect(r.avvisi.join(" ")).toMatch(/non risulta collegato al POS/);
  });

  it("tipo d'ordine di un altro RVC, dipendente inesistente: configurazione da rivedere", async () => {
    expect((await errore(oracleSimphony.provaConnessione(await contesto({ tipoOrdine: "milano01:7:1" })))).codice).toBe("INVALID_CONFIGURATION");
    expect((await errore(oracleSimphony.provaConnessione(await contesto({ dipendente: "12" })))).message).toMatch(/dipendente 12/);
  });
});

describe("configurazione: tavoli, menu, condimenti, tasse, tender, disponibilità", () => {
  it("importazione completa, solo lettura", async () => {
    const ctx = await contesto();
    const r = await oracleSimphony.sincronizza!(ctx, "full");
    const per = (t: string) => r.entita.filter((e) => e.tipo === t);
    expect(per("TABLE").map((e) => e.externalId)).toEqual(["B2", "B3", "B4"]);
    expect(per("CATEGORY").map((e) => e.etichetta)).toEqual(["Antipasti", "Dolci"]);
    expect(per("PRODUCT").find((e) => e.externalId === "101-1")!.metadata).toMatchObject({ menuItemId: 101, definitionSequence: 1, prezzoCents: 950, disponibile: true });
    expect(per("PRODUCT").find((e) => e.externalId === "102-1")!.metadata).toMatchObject({ disponibile: false });
    expect(per("PRODUCT").find((e) => e.externalId === "301-1")!.metadata).toMatchObject({ condimentiObbligatori: true });
    expect(per("MODIFIER").map((e) => e.etichetta)).toEqual(["Al sangue"]);
    expect(per("TAX_RATE").map((e) => e.metadata?.percentuale)).toEqual([10, 22]);
    expect(per("PAYMENT_METHOD").map((e) => e.metadata?.tipo)).toEqual(["payment", "payment", "serviceTotal"]);
    expect(per("DISCOUNT").map((e) => e.metadata?.aperto)).toEqual([false, true]);
    expect(per("SERVICE_CHARGE")).toHaveLength(1);
    expect(oracle.stato.chiamate.every((c) => c.metodo === "GET" || c.metodo === "HEAD" || c.url.startsWith(HOST_AUTH))).toBe(true);
    const menuGet = oracle.stato.chiamate.find((c) => c.url.includes("/menus/tfoinc"))!;
    expect(menuGet.intestazioni["simphony-rvcref"]).toBe("42");
    const tasse = new URL(oracle.stato.chiamate.find((c) => c.url.includes("/taxes"))!.url).searchParams;
    expect([tasse.get("OrgShortName"), tasse.get("LocRef"), tasse.get("RvcRef")]).toEqual(["tfoinc", "fdmnh144", "42"]);
  });

  it("POS scollegato: la sincronizzazione lo scrive nel registro", async () => {
    oracle.stato.posCollegato = false;
    const r = await oracleSimphony.sincronizza!(await contesto(), "full");
    expect(r.scartati[0]!.motivo).toMatch(/connectionStatus/);
  });

  it("normalizzazione: TranslatedString, definizioni, voci esaurite, totali", () => {
    expect(tradotto({ "en-US": "coffee", "it-IT": "caffè" })).toBe("caffè");
    expect(tradotto({ "de-DE": "kaffee" })).toBe("kaffee");
    expect(tradotto("Sala")).toBe("Sala");
    expect(menu(ORACLE.menu).voci).toHaveLength(5);
    expect([...nonDisponibili(ORACLE.nonDisponibili)]).toEqual(["102-1"]);
    expect(totali({ subtotal: 43, totalDue: 13, paymentTotal: 30, serviceChargeTotal: 1, autoServiceChargeTotal: 2 })).toMatchObject({ subtotaleCents: 4300, daPagareCents: 1300, pagatoCents: 3000, serviziCents: 300 });
    expect(statoCheck({ aperto: false, preparazione: "Uninitialized" })).toBe("CLOSED");
    expect(statoCheck({ aperto: true, preparazione: "Submitted" })).toBe("IN_PROGRESS");
  });

  it("risposte malformate: ci si ferma, non si importa il vuoto", async () => {
    const ctx = await contesto();
    const rotta = (async (url: string, init: RequestInit) =>
      url.includes("/menus/summary") ? new Response(JSON.stringify({ menus: [] }), { status: 200, headers: { "content-type": "application/json" } }) : oracle.fetchFinto(url, init)) as unknown as typeof fetch;
    const e = await errore(oracleSimphony.sincronizza!({ ...ctx, http: creaClientFornitore({ slug: "o", correlationId: "c", fetchImpl: rotta, intestazioni: () => ({ Authorization: `Bearer ${ctx.segreti.accessToken}` }) }) }, "menu"));
    expect(e.codice).toBe("UNKNOWN");
  });
});

describe("il check: prima comanda, round, idempotenza", () => {
  it("20:10 B2: POST /checks con intestazioni Simphony, detect-duplicate-request, idempotencyId stabile", async () => {
    const ctx = await contesto();
    const r = await oracleSimphony.pos.createOrder!(ctx, prima);
    expect(r.accettato).toBe(true);
    const post = oracle.stato.chiamate.find((c) => c.metodo === "POST" && c.url.endsWith("/api/v1/checks"))!;
    expect(post.intestazioni).toMatchObject({ "simphony-features": "detect-duplicate-request", "simphony-rvcref": "42" });
    const corpo = JSON.parse(post.corpo!);
    expect(corpo.header).toMatchObject({ orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: 42, checkEmployeeRef: 900, orderTypeRef: 1, tableName: "B2", guestCount: 2 });
    expect(corpo.header.idempotencyId).toMatch(/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/);
    expect(corpo.header.idempotencyId).toBe(idempotencyId("venue_A:ft-cmd-1:create"));
    expect(corpo.menuItems).toEqual([
      { menuItemId: 101, definitionSequence: 1, quantity: 2 },
      { menuItemId: 102, definitionSequence: 1, quantity: 2 },
    ]);
    expect(corpo.extensions[0]).toMatchObject({ appName: "foodtech", dataName: "riferimento", data: "ft-cmd-1", options: ["includeInApiResponse"] });
    // Prima di creare: il POS è collegato? il check esiste già?
    const ordine = oracle.stato.chiamate.filter((c) => !c.url.startsWith(HOST_AUTH)).map((c) => `${c.metodo} ${new URL(c.url).pathname}`);
    expect(ordine).toEqual(["HEAD /api/v1/checks/connectionStatus", "GET /api/v1/checks", "POST /api/v1/checks"]);
  });

  it("stesso invio due volte: un check solo (Oracle ritrova il check; e comunque lo ritroviamo noi)", async () => {
    const ctx = await contesto();
    const a = await oracleSimphony.pos.createOrder!(ctx, prima);
    const b = await oracleSimphony.pos.createOrder!(ctx, prima);
    expect(b.externalId).toBe(a.externalId);
    expect(oracle.stato.postCheck).toBe(1);
  });

  it("stesso idempotencyId entro 300 s: Oracle restituisce la risposta originale (isCachedResponse)", async () => {
    const ctx = await contesto();
    const corpo = corpoCheck({ orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: 42, dipendente: 900, tipoOrdine: 1 }, prima, idempotencyId("x"));
    const manda = () =>
      ctx.http.richiesta<{ header: { checkRef: string; isCachedResponse?: boolean } }>({
        metodo: "POST",
        url: `${HOST_STS}/api/v1/checks`,
        intestazioni: { "Simphony-OrgShortName": "tfoinc", "Simphony-LocRef": "fdmnh144", "Simphony-RvcRef": "42", "Simphony-Features": "detect-duplicate-request" },
        corpo,
        redirect: "error",
      });
    const x = await manda();
    const y = await manda();
    expect(y.header.checkRef).toBe(x.header.checkRef);
    expect(y.header.isCachedResponse).toBe(true);
  });

  it("20:40 B2 aggiunge dessert e caffè: POST /checks/{checkRef}/round, righe vecchie intatte, idempotente", async () => {
    const ctx = await contesto();
    const { externalId } = await oracleSimphony.pos.createOrder!(ctx, prima);
    await oracleSimphony.pos.updateOrder!(ctx, externalId!, aggiunta);
    await oracleSimphony.pos.updateOrder!(ctx, externalId!, aggiunta);
    expect(oracle.stato.postRound).toBe(1);
    const round = JSON.parse(oracle.stato.chiamate.find((c) => c.url.endsWith("/round"))!.corpo!);
    expect(round.header).toMatchObject({ checkRef: externalId, idempotencyId: idempotencyId("venue_A:ft-cmd-2:round") });
    expect(round.menuItems.map((r: { menuItemId: number }) => r.menuItemId)).toEqual([201, 202]);
    const letto = await oracleSimphony.pos.getOrder!(ctx, externalId!);
    expect(letto!.righe.map((r) => [r.nome, r.quantita])).toEqual([
      ["Antipasto della casa", 2],
      ["Primo del giorno", 2],
      ["Tiramisù", 2],
      ["Caffè", 2],
    ]);
    expect(letto!.stato).toBe("IN_PROGRESS");
    expect(letto!.totaleCents).toBe(19 * 100 + 24 * 100 + 12 * 100 + 3 * 100);
  });

  it("round su un check chiuso o sparito: contoChiuso, e il servizio aprirà un check nuovo", async () => {
    const ctx = await contesto();
    const { externalId } = await oracleSimphony.pos.createOrder!(ctx, prima);
    oracle.stato.checks.get(externalId!)!.header.status = "closed";
    const e = await errore(oracleSimphony.pos.updateOrder!(ctx, externalId!, aggiunta));
    expect([e.codice, e.dettaglio.contoChiuso]).toEqual(["CONFLICT", true]);
    const e2 = await errore(oracleSimphony.pos.updateOrder!(ctx, "inesistente", aggiunta));
    expect(e2.dettaglio.contoChiuso).toBe(true);
    expect(oracle.stato.postRound).toBe(0);
  });

  it("POS scollegato: la comanda non parte e resta da riprovare", async () => {
    const ctx = await contesto();
    oracle.stato.posCollegato = false;
    const e = await errore(oracleSimphony.pos.createOrder!(ctx, prima));
    expect([e.codice, e.riprovabile]).toEqual(["PROVIDER_UNAVAILABLE", true]);
    expect(oracle.stato.postCheck).toBe(0);
  });

  it("righe che Simphony non può ricevere bene: niente invio alla cieca", () => {
    expect(() => righeCheck({ ...prima, righe: [riga(101, "Antipasto", 1, "Allergia: frutta a guscio, sedano")] }, null)).toThrow(/20 caratteri/);
    expect(() => righeCheck({ ...prima, righe: [{ ...riga(301, "Bistecca", 1), datiProdotto: { menuItemId: 301, definitionSequence: 1, condimentiObbligatori: true } }] }, null)).toThrow(/condimenti obbligatori/);
    expect(() => righeCheck({ ...prima, righe: [{ ...riga(1, "X", 1), datiProdotto: {} }] }, null)).toThrow(/menuItemId/);
    expect(righeCheck({ ...prima, righe: [riga(101, "Antipasto", 1, "senza sale")] }, "ft-r")[0]).toMatchObject({ referenceText: "senza sale", extensions: [{ data: "ft-r" }] });
  });
});

describe("conto: lettura, calcolo, pagamenti, printed check, annullamento", () => {
  it("calcolo prima di creare: POST /checks/calculator, i totali sono di Oracle", async () => {
    const ctx = await contesto();
    const t = await oracleSimphony.pos.calculateOrder!(ctx, prima);
    expect(t.subtotaleCents).toBe(4300);
    expect(oracle.stato.checks.size).toBe(0);
  });

  it("€120 divisi in tre: più tender sullo stesso check, parziali; chiuso quando il dovuto arriva a zero", async () => {
    const ctx = await contesto();
    const tanti: OrdineDaInviare = { ...prima, righe: [riga(101, "Antipasto", 4), riga(102, "Primo", 5), riga(201, "Tiramisù", 4)] };
    const { externalId } = await oracleSimphony.pos.createOrder!(ctx, tanti); // 38 + 60 + 24 = 122
    const paga = (euro: number, tender: string, id: string) =>
      oracleSimphony.pos.createPayment!(ctx, { riferimentoOrdine: externalId!, importoCents: euro * 100, manciaCents: 0, metodo: { externalId: tender, nome: tender }, idOperazione: id });
    await paga(40, "1", "A");
    await paga(30, "2", "B");
    let conto = await oracleSimphony.pos.getOrder!(ctx, externalId!);
    expect(conto!.stato).toBe("IN_PROGRESS");
    await paga(52, "2", "C");
    await paga(52, "2", "C"); // ripetuto: stesso idempotencyId → nessun secondo tender
    conto = await oracleSimphony.pos.getOrder!(ctx, externalId!);
    expect(conto!.stato).toBe("CLOSED");
    const pagamenti = await oracleSimphony.pos.getPayments!(ctx, { da: new Date(Date.now() - 3600_000), a: new Date() });
    expect(pagamenti.map((p) => [p.metodo, p.importoCents])).toEqual([["Contanti", 4000], ["Carta", 3000], ["Carta", 5200]]);
    const corpo = JSON.parse(oracle.stato.chiamate.filter((c) => c.url.endsWith("/round"))[0]!.corpo!);
    expect(corpo).toMatchObject({ tenders: [{ tenderId: 1, total: 40 }] });
    expect(corpo.menuItems).toBeUndefined();
    // Chiuso: niente più pagamenti né round.
    expect((await errore(paga(1, "1", "D"))).dettaglio.contoChiuso).toBe(true);
  });

  it("un pagamento senza idOperazione stabile non parte", async () => {
    const ctx = await contesto();
    expect((await errore(oracleSimphony.pos.createPayment!(ctx, { riferimentoOrdine: "x", importoCents: 100, manciaCents: 0, metodo: { externalId: "1", nome: "C" } }))).codice).toBe("VALIDATION");
  });

  it("printed check: righe a 40 colonne, non un documento fiscale", async () => {
    const ctx = await contesto();
    const { externalId } = await oracleSimphony.pos.createOrder!(ctx, prima);
    const righe = await oracleSimphony.pos.getPrintedCheck!(ctx, externalId!);
    expect(righe).toContain("------------ Check Closed -------------");
    expect(oracleSimphony.pos.getReceipt).toBeUndefined();
  });

  it("annullamento: DELETE /checks/{checkRef}; poi il check non si trova più", async () => {
    const ctx = await contesto();
    const { externalId } = await oracleSimphony.pos.createOrder!(ctx, prima);
    await oracleSimphony.pos.cancelOrder!(ctx, externalId!);
    expect(await oracleSimphony.pos.getOrder!(ctx, externalId!)).toBeNull();
  });

  it("nessuna chiusura esplicita: non esiste un endpoint, chiude il pagamento completo", () => {
    expect(oracleSimphony.pos.closeOrder).toBeUndefined();
  });
});

describe("notifiche", () => {
  it("attivazione: PUT della chiave HMAC, quattro iscrizioni; i dipendenti senza rvcRef", async () => {
    const ctx = await contesto();
    const r = await oracleSimphony.attiva!(ctx);
    const reg = oracle.stato.registrazioni.get("client-A")!;
    expect(Buffer.from(reg.hmacKey, "base64").length).toBeGreaterThanOrEqual(32);
    expect(r.segretiAggiunti).toEqual({ hmacKey: reg.hmacKey, keyId: reg.keyId });
    expect(oracle.stato.iscrizioni.map((i) => [i.messageType.id, i.rvcRef ?? null])).toEqual([
      ["CheckNotification", "42"],
      ["ConfigurationNotification", "42"],
      ["OrganizationsNotification", "42"],
      ["EmployeesNotification", null],
    ]);
    expect(oracle.stato.iscrizioni[0]!.callbackUri).toBe("https://app.foodtech.com/api/integrations/webhooks/oracle-simphony/chiave-webhook-oracle");
    expect((r.metadata!.sottoscrizioni as unknown[]).length).toBe(4);
  });

  it("un indirizzo che Oracle non consegna (http, porta, dominio): nessuna iscrizione, e lo si dice", async () => {
    for (const origine of ["http://localhost:3321", "https://app.foodtech.test", "https://app.foodtech.com:8443"]) {
      oracle = creaOracleFinto();
      const ctx = await contesto();
      const r = await oracleSimphony.attiva!({ ...ctx, origine });
      expect(r.metadata!.avvisoNotifiche, origine).toMatch(/porta 443/);
      expect(oracle.stato.iscrizioni).toHaveLength(0);
    }
  });

  it("disinstallare toglie iscrizioni e registrazione", async () => {
    const ctx = await contesto();
    const r = await oracleSimphony.attiva!(ctx);
    await oracleSimphony.disconnetti!({ ...ctx, installazione: { ...ctx.installazione, metadata: r.metadata! } });
    expect(oracle.stato.iscrizioni).toHaveLength(0);
    expect(oracle.stato.registrazioni.has("client-A")).toBe(false);
  });

  it("Digest e Key-Id: HMAC-SHA256 Base64 del corpo con la chiave registrata", async () => {
    const chiave = Buffer.alloc(32, 7).toString("base64");
    const corpo = JSON.stringify(ORACLE.notifica.check);
    const digest = createHmac("sha256", Buffer.from(chiave, "base64")).update(corpo).digest("base64");
    expect(firmaValida(corpo, digest, chiave)).toBe(true);
    expect(firmaValida(corpo + " ", digest, chiave)).toBe(false);
    expect(firmaValida(corpo, digest, Buffer.alloc(32, 8).toString("base64"))).toBe(false);
    const ctx = { ...(await contesto()), segreti: { hmacKey: chiave, keyId: "k1" } };
    const w = (keyId: string) => ({ corpo, intestazioni: new Headers({ digest, "key-id": keyId }) });
    expect(oracleSimphony.verificaWebhook!(ctx, w("k1"))).toBe(true);
    expect(oracleSimphony.verificaWebhook!(ctx, w("altra"))).toBe(false);
    expect(oracleSimphony.verificaWebhook!({ ...ctx, segreti: {} }, w("k1"))).toBe(false);
  });

  it("i quattro esempi della documentazione, tradotti", () => {
    const c = leggiNotifica(ORACLE.notifica.check);
    expect(c.idEvento).toBe("8253c2a5-5b3c-497d-a87f-f8bb2e250ba7");
    expect(c.sede).toBe("fdmnh144:42");
    expect(c.evento).toEqual({ tipo: "pos.order.status", riferimento: null, externalId: "929aacee2c6d42c78ae877e824c28eed00000431", stato: "IN_PROGRESS", motivo: null, preparazione: "Submitted" });
    expect(leggiNotifica(ORACLE.notifica.configurazione).evento).toEqual({ tipo: "catalogo.cambiato", risorsa: "menu", externalId: null });
    expect(leggiNotifica(ORACLE.notifica.organizzazione).evento).toMatchObject({ risorsa: "tables" });
    const d = leggiNotifica(ORACLE.notifica.dipendenti);
    expect([d.evento.tipo, d.sede]).toEqual(["sconosciuto", null]);
    const lotto = leggiNotifica({ messages: [...ORACLE.notifica.check.messages, ...ORACLE.notifica.configurazione.messages] });
    expect(lotto.evento.tipo).toBe("multipli");
    expect(lotto.idEvento).toMatch(/^[0-9a-f]{64}$/);
  });

  it("notifiche malformate: rifiutate", () => {
    expect(() => leggiNotifica({})).toThrow(/messages/);
    expect(() => leggiNotifica({ messages: [{ messageType: { id: "CheckNotification" } }] })).toThrow(/id/);
  });
});

describe("guasti di Oracle", () => {
  it("503, 521 (timeout di Oracle dopo 60 s), timeout nostro: riprovabili", async () => {
    const ctx = await contesto();
    for (const g of ["503", "521", "timeout"] as const) {
      oracle.stato.guasto = g;
      const e = await errore(oracleSimphony.pos.getTables!(ctx));
      expect(e.riprovabile, g).toBe(true);
    }
  });

  it("JSON rotto: errore, non un elenco vuoto", async () => {
    const ctx = await contesto();
    oracle.stato.guasto = "json_rotto";
    expect((await errore(oracleSimphony.pos.getTables!(ctx))).codice).toBe("UNKNOWN");
  });

  it("duplicate_request mentre la prima è ancora in lavorazione: si riprova", async () => {
    const ctx = await contesto();
    const occupato = (async (url: string, init: RequestInit) =>
      init.method === "POST" && url.endsWith("/checks")
        ? new Response(JSON.stringify({ title: "POS Error", status: 400, posDetails: [{ code: "duplicate_request", message: "duplicate request detected, no response found" }] }), { status: 400, headers: { "content-type": "application/json" } })
        : oracle.fetchFinto(url, init)) as unknown as typeof fetch;
    const e = await errore(oracleSimphony.pos.createOrder!({ ...ctx, http: creaClientFornitore({ slug: "o", correlationId: "c", fetchImpl: occupato, intestazioni: () => ({ Authorization: `Bearer ${ctx.segreti.accessToken}` }) }) }, prima));
    expect([e.codice, e.riprovabile]).toEqual(["PROVIDER_UNAVAILABLE", true]);
  });
});
