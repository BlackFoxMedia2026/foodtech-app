import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  attiva,
  connettiConCampi,
  disinstalla,
  installa,
  opzioniConfigurazione,
  provaConnessione,
  salvaCapacita,
  salvaConfigurazione,
  trovaInstallazione,
  usaFetchPerProve,
  type Attore,
} from "@/server/integrations/installazioni";
import { eseguiSincronizzazione } from "@/server/integrations/sync";
import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { approvaRichiesta, archiviaRichiesta, richiediAttivazione, richiesteAperte } from "@/server/integrations/richieste";
import { importaIniziale } from "@/server/integrations/importazione";
import { catalogoCliente, dettaglioCliente } from "@/server/integrations/vista-cliente";
import {
  capacitaDaGruppi,
  condizioneDi,
  gruppiDi,
  passoDaRiprendere,
  provaPerIlCliente,
  statoPerIlCliente,
  vistaVoceCliente,
  verificaInCorso,
  STATI_CLIENTE,
  ETICHETTA_STATO_CLIENTE,
  type IngressoStato,
} from "@/server/integrations/cliente";
import { STATI_INSTALLAZIONE } from "@/server/integrations/tipi";
import { CATALOGO, voceDi } from "@/server/integrations/registry";
import { FIXTURE } from "./fixture-cassa-in-cloud";

/**
 * **L'esperienza del cliente: semplice davanti, tutto il resto dietro.**
 *
 * Due metà. Le regole pure (`cliente.ts`): gli stati della connessione, il pulsante, gli
 * interruttori di sincronizzazione, i campi del wizard per ogni fornitore.
 * E contro il database vero, con Cassa in Cloud finto: il catalogo e la
 * pagina del cliente non portano parole tecniche né segreti, l'anteprima
 * non si collega senza accesso beta, «Richiedi attivazione» arriva al Super
 * Admin, il wizard installa davvero su `IntegrationInstallation`, e
 * ricollegare, disconnettere, importare funzionano.
 */

const db = new PrismaClient();
const PREFISSO = "test-cliente-";
const SLUG = "cassa-in-cloud";
const ORIGINE = "https://app.foodtech.test";

if (!/dev|test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Queste prove scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/**
 * Le parole della vista interna che non devono mai arrivare al browser di un
 * ristoratore. Sono i nomi degli stati tecnici, delle API e dei documenti
 * dei fornitori, e dei campi di sistema.
 */
const TECNICHE = [
  "PREVIEW", "PRIVATE_BETA", "PUBLIC_BETA", "GENERAL_AVAILABILITY", "IN_DEVELOPMENT", "IMPLEMENTED", "PLANNED",
  "TESTED_WITH_FIXTURE", "TESTED_PROVIDER_API", "FIXTURE", "PROVIDER_API", "REAL_POS",
  "adattatore", "Adattatore", "DA VERIFICARE", "DA_VERIFICARE", "DOCUMENTATA",
  "STS", "Gen2", "opzione 74", "option 74", "POSAPI", "Client Scope", "Authorization Scope", "EMC", "Enterprise Parameters",
  "X-Version", "x-cn-signature", "HMAC", "OAuth", "scope", "endpoint", "/api/v1", "/documents", "/salespoint",
  "api-doc.cassanova.com", "developer.tilby.com", "api-portal.lsk", "documentazione", "Documentazione",
  "partnership", "nessun codice", "non può ancora custodire", "LIGHTSPEED_K_CLIENT", "STRIPE_SECRET",
  "webhookKey", "lastError", "correlationId", "externalId", "secretCiphertext",
];

function senzaParoleTecniche(valore: unknown, etichetta: string) {
  const testo = JSON.stringify(valore);
  for (const p of TECNICHE) expect(testo, `${etichetta}: «${p}»`).not.toContain(p);
}

/* -------------------------------------------------------------------------- */
/*  Regole pure                                                               */
/* -------------------------------------------------------------------------- */

const base: IngressoStato = {
  nativa: null,
  motivoTecnico: null,
  fase: "PRIVATE_BETA",
  betaAbilitata: false,
  installazione: null,
  richiesta: null,
};

describe("gli stati della connessione visti dal cliente", () => {
  it("anteprima senza accesso beta: «In anteprima» e «Richiedi attivazione»", () => {
    expect(statoPerIlCliente(base)).toEqual({ stato: "IN_ANTEPRIMA", azione: "RICHIEDI_ATTIVAZIONE", inAttivazione: false, anteprima: true });
  });

  it("anteprima con accesso beta: «In anteprima» e «Collega»", () => {
    expect(statoPerIlCliente({ ...base, betaAbilitata: true })).toMatchObject({ stato: "IN_ANTEPRIMA", azione: "COLLEGA" });
    // La beta pubblica non chiede l'accesso: si collega, e resta un'anteprima.
    expect(statoPerIlCliente({ ...base, fase: "PUBLIC_BETA" })).toMatchObject({ stato: "IN_ANTEPRIMA", azione: "COLLEGA" });
  });

  it("disponibilità generale: «Non collegato» e «Collega», senza il segno di anteprima", () => {
    expect(statoPerIlCliente({ ...base, fase: "GENERAL_AVAILABILITY" })).toMatchObject({ stato: "NON_COLLEGATO", azione: "COLLEGA", anteprima: false });
  });

  it("senza adattatore: «Prossimamente» e «Avvisami», poi «Ti avviseremo»", () => {
    expect(statoPerIlCliente({ ...base, motivoTecnico: "coming_soon" })).toMatchObject({ stato: "PROSSIMAMENTE", azione: "AVVISAMI" });
    expect(
      statoPerIlCliente({ ...base, motivoTecnico: "coming_soon", richiesta: { kind: "NOTIFY", status: "PENDING" } }),
    ).toMatchObject({ azione: "AVVISO_ATTIVO" });
  });

  it("manca una credenziale globale di Foodtech: niente modulo, «in fase di attivazione», anche con la beta", () => {
    const e = statoPerIlCliente({ ...base, motivoTecnico: "platform_not_configured", betaAbilitata: true });
    expect(e).toEqual({ stato: "IN_ANTEPRIMA", azione: "RICHIEDI_ATTIVAZIONE", inAttivazione: true, anteprima: true });
  });

  it("richiesta inviata: il pulsante si spegne; chiusa, torna", () => {
    expect(statoPerIlCliente({ ...base, richiesta: { kind: "ACCESS", status: "PENDING" } }).azione).toBe("RICHIESTA_INVIATA");
    expect(statoPerIlCliente({ ...base, richiesta: { kind: "ACCESS", status: "DISMISSED" } }).azione).toBe("RICHIEDI_ATTIVAZIONE");
  });

  it("installata: lo stato della connessione, con le parole chieste", () => {
    const con = (status: string, salute = "HEALTHY", sospesa = false, verificaInCorso = false) =>
      statoPerIlCliente({ ...base, installazione: { status: status as never, salute: salute as never, sospesa, verificaInCorso } });
    expect(con("ACTIVE")).toMatchObject({ stato: "COLLEGATO", azione: "GESTISCI" });
    expect(con("SYNCING")).toMatchObject({ stato: "COLLEGATO" });
    expect(con("REAUTH_REQUIRED", "AUTH_REQUIRED")).toMatchObject({ stato: "CREDENZIALI_SCADUTE", azione: "GESTISCI" });
    expect(con("ERROR", "ERROR")).toMatchObject({ stato: "ERRORE_CONNESSIONE" });
    expect(con("ACTIVE", "DEGRADED")).toMatchObject({ stato: "ERRORE_CONNESSIONE" });
    expect(con("DISABLED")).toMatchObject({ stato: "IN_PAUSA" });
    expect(con("ACTIVE", "HEALTHY", true)).toMatchObject({ stato: "IN_PAUSA" });
    for (const s of ["INSTALLING", "NEEDS_CONFIGURATION", "CONNECTED"]) {
      expect(con(s)).toMatchObject({ stato: "CONFIGURAZIONE_NECESSARIA", azione: "RIPRENDI" });
    }
    expect(con("ACTIVE", "HEALTHY", false, true)).toMatchObject({ stato: "VERIFICA_IN_CORSO", azione: "GESTISCI" });
    expect(con("NEEDS_CONFIGURATION", "UNKNOWN", false, true)).toMatchObject({ stato: "VERIFICA_IN_CORSO", azione: "RIPRENDI" });
  });

  it("un'anteprima collegata è «Collegato», e porta a parte il segno di anteprima", () => {
    const e = statoPerIlCliente({ ...base, betaAbilitata: true, installazione: { status: "ACTIVE", salute: "HEALTHY", sospesa: false } });
    expect(e).toMatchObject({ stato: "COLLEGATO", anteprima: true });
  });

  it("la verifica in corso finisce con l'esito, o dopo un minuto", () => {
    const t0 = new Date("2026-09-24T10:00:00Z");
    expect(verificaInCorso({ testStartedAt: t0, lastTestAt: null }, new Date(t0.getTime() + 5_000))).toBe(true);
    expect(verificaInCorso({ testStartedAt: t0, lastTestAt: new Date(t0.getTime() + 2_000) }, new Date(t0.getTime() + 5_000))).toBe(false);
    expect(verificaInCorso({ testStartedAt: t0, lastTestAt: null }, new Date(t0.getTime() + 61_000))).toBe(false);
    expect(verificaInCorso({ testStartedAt: null, lastTestAt: null })).toBe(false);
  });

  it("ogni stato tecnico finisce in uno degli stati del cliente", () => {
    const stati = new Set<string>();
    for (const fase of ["INTERNAL", "PRIVATE_BETA", "PUBLIC_BETA", "GENERAL_AVAILABILITY"] as const)
      for (const motivoTecnico of [null, "coming_soon", "platform_not_configured", "encryption_unavailable"] as const)
        for (const betaAbilitata of [true, false]) {
          stati.add(statoPerIlCliente({ ...base, fase, motivoTecnico, betaAbilitata }).stato);
          for (const status of STATI_INSTALLAZIONE)
            for (const salute of ["HEALTHY", "DEGRADED", "ERROR", "AUTH_REQUIRED", "UNKNOWN"] as const)
              stati.add(statoPerIlCliente({ ...base, fase, motivoTecnico, betaAbilitata, installazione: { status, salute, sospesa: false } }).stato);
        }
    expect([...stati].every((s) => (STATI_CLIENTE as readonly string[]).includes(s))).toBe(true);
    // I sette stati chiesti ci sono tutti, più «In pausa» e «Prossimamente».
    for (const s of ["NON_COLLEGATO", "CONFIGURAZIONE_NECESSARIA", "COLLEGATO", "ERRORE_CONNESSIONE", "CREDENZIALI_SCADUTE", "IN_ANTEPRIMA"]) {
      expect(stati, s).toContain(s);
    }
    expect(Object.values(ETICHETTA_STATO_CLIENTE)).toEqual(
      expect.arrayContaining(["Non collegato", "Configurazione necessaria", "Verifica in corso", "Collegato", "Errore di connessione", "Credenziali scadute", "In anteprima"]),
    );
  });

  it("la condizione e il passo da cui riprende il wizard", () => {
    expect(condizioneDi("REAUTH_REQUIRED", "AUTH_REQUIRED", false)).toBe("da_ricollegare");
    expect(condizioneDi("ACTIVE", "HEALTHY", true)).toBe("sospesa");
    expect(passoDaRiprendere({ status: "INSTALLING", credenzialiPresenti: false })).toBe(0);
    expect(passoDaRiprendere({ status: "NEEDS_CONFIGURATION", credenzialiPresenti: true })).toBe(1);
    expect(passoDaRiprendere({ status: "CONNECTED", credenzialiPresenti: true })).toBe(3);
  });
});

describe("gli interruttori di sincronizzazione", () => {
  it("solo i gruppi che il fornitore offre davvero", () => {
    const cic = voceDi("cassa-in-cloud")!;
    expect(gruppiDi(cic.capacita).map((g) => g.chiave)).toEqual(["tavoli", "menu", "ordini", "vendite"]);
    expect(gruppiDi([]).length).toBe(0);
  });

  it("dai gruppi alle capacità: le offerte, le sedi, e mai l'invio delle comande", () => {
    const cic = voceDi("cassa-in-cloud")!;
    const c = capacitaDaGruppi(cic.capacita, ["tavoli", "menu", "vendite"]);
    expect(new Set(c)).toEqual(new Set(["locations", "tables", "menu", "tax_rates", "payments.read"]));
    // Cassa in Cloud non ha l'elenco dei metodi di pagamento: non si accende.
    expect(c).not.toContain("payment_methods");
    expect(capacitaDaGruppi(cic.capacita, ["sconosciuto"])).toEqual([]);
  });

  it("ciò che ha acceso Foodtech resta acceso quando il cliente salva", () => {
    const cic = voceDi("cassa-in-cloud")!;
    const c = capacitaDaGruppi(cic.capacita, ["tavoli"], ["tables", "orders.write", "menu"]);
    expect(c).toContain("orders.write");
    expect(c).not.toContain("menu");
  });
});

describe("il modulo di ogni fornitore viene dal suo schema", () => {
  const campi = (slug: string) => {
    const v = vistaVoceCliente(voceDi(slug)!);
    return { accesso: v.campiAccesso.map((c) => c.chiave), sede: v.campiSede.map((c) => c.chiave), v };
  };

  it("Cassa in Cloud: solo la API Key, poi il punto vendita", () => {
    const { accesso, sede, v } = campi("cassa-in-cloud");
    expect(accesso).toEqual(["apiKey"]);
    expect(v.campiAccesso[0]).toMatchObject({ etichetta: "API Key", tipo: "segreto" });
    expect(sede).toEqual(["idSalesPoint"]);
    expect(v.aiuto?.titolo).toBe("Dove trovo la mia API Key?");
  });

  it("Tilby: il token, e l'ambiente fra le opzioni avanzate", () => {
    const { accesso, sede, v } = campi("tilby");
    expect(accesso).toEqual(["token", "ambiente"]);
    expect(v.campiAccesso[1]).toMatchObject({ avanzato: true, predefinito: "production" });
    expect(v.campiAccesso[1]!.opzioni!.map((o) => o.label)).toEqual(["Negozio di prova Tilby", "Il mio negozio"]);
    expect(sede).toEqual(["shopId"]);
  });

  it("Oracle Simphony: indirizzi, Client ID, utente e password; poi sede, revenue center, tipo di servizio", () => {
    const { accesso, sede, v } = campi("oracle-simphony");
    expect(accesso).toEqual(["sts", "auth", "clientId", "organizzazione", "utente", "password"]);
    expect(v.campiAccesso.map((c) => c.etichetta)).toEqual([
      "Indirizzo dell'ambiente Simphony", "Indirizzo di accesso", "Client ID", "Codice organizzazione", "Utente API", "Password",
    ]);
    expect(sede).toEqual(["destinazione", "tipoOrdine", "dipendente"]);
    expect(v.campiSede[0]!.dividi).toEqual(["Sede", "Revenue center"]);
  });

  it("Lightspeed: l'accesso con l'account, nessun campo", () => {
    const { accesso, v } = campi("lightspeed-k");
    expect(v.accesso).toBe("oauth");
    expect(accesso).toEqual([]);
  });

  it("nessuna voce del catalogo porta al cliente parole tecniche", () => {
    for (const v of CATALOGO) senzaParoleTecniche(vistaVoceCliente(v), v.slug);
  });

  it("Cassa in Cloud: il requisito del piano Enterprise solo nella guida «Dove trovo la mia API Key?»", () => {
    const v = vistaVoceCliente(voceDi("cassa-in-cloud")!);
    expect(v.aiuto!.paragrafi.join(" ")).toMatch(/Enterprise/);
    expect(JSON.stringify({ ...v, aiuto: null })).not.toMatch(/Enterprise/);
  });

  it("la prova detta al cliente: niente avvisi dell'adattatore, niente riferimento di correlazione", () => {
    const ok = provaPerIlCliente({
      ok: true,
      account: "Aurora",
      sede: "Torino",
      avvisi: ["STS risponde, ma il revenue center non risulta collegato (connectionStatus).", "Sede condivisa."],
      avvisiGruppo: ["Sede condivisa."],
    });
    expect(ok).toEqual({ ok: true, account: "Aurora", sede: "Torino", avvisi: ["Sede condivisa."], daControllare: true });
    const ko = provaPerIlCliente({ ok: false, titolo: "T", spiegazione: "S", azione: "ricollega", correlationId: "int_abc" });
    expect(JSON.stringify(ko)).not.toContain("int_abc");
  });
});

/* -------------------------------------------------------------------------- */
/*  Contro il database: Cassa in Cloud finto                                  */
/* -------------------------------------------------------------------------- */

const cassa = {
  chiavi: new Map<string, number[]>([
    ["chiave-A", [101, 102]],
    ["chiave-A-nuova", [101, 102]],
    ["chiave-C", [101]],
  ]),
  token: new Map<string, string>(),
  revocata: null as string | null,
  /** Cassa in Cloud giù (503) per tutto tranne il token. */
  giu: false,
  /** Le letture fatte, «GET /products»: dicono che cosa il motore ha chiesto davvero. */
  chiamate: [] as string[],
};

function risposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const fetchFinto = (async (url: string, init: RequestInit) => {
  const u = new URL(url);
  const h = (init.headers ?? {}) as Record<string, string>;
  if (u.pathname === "/apikey/token") {
    const { apiKey } = JSON.parse(String(init.body)) as { apiKey: string };
    if (!cassa.chiavi.has(apiKey)) return risposta(401, { error: "invalid api key" });
    const t = `tok-${apiKey}-${cassa.token.size}`;
    cassa.token.set(t, apiKey);
    return risposta(200, { access_token: t, expires_in: 3600, token_type: "Bearer" });
  }
  cassa.chiamate.push(`${init.method ?? "GET"} ${u.pathname}`);
  if (cassa.giu) return risposta(503, {});
  const chiave = cassa.token.get((h.Authorization ?? "").replace("Bearer ", ""));
  if (!chiave || chiave === cassa.revocata) return risposta(401, {});
  const sedi = cassa.chiavi.get(chiave)!;
  switch (`${init.method ?? "GET"} ${u.pathname}`) {
    case "GET /salespoint":
      return risposta(200, { salesPoint: FIXTURE.salespoint.salesPoint.filter((s) => sedi.includes(s.id)), totalCount: sedi.length });
    case "GET /risto/rooms": return risposta(200, FIXTURE.rooms);
    case "GET /risto/tables": return risposta(200, FIXTURE.tables);
    case "GET /categories": return risposta(200, FIXTURE.categories);
    case "GET /products": return risposta(200, FIXTURE.products);
    case "GET /salesmodes": return risposta(200, FIXTURE.salesModes);
    case "GET /taxes": return risposta(200, FIXTURE.taxes);
    case "GET /documents/orders": return risposta(200, { orders: [], totalCount: 0 });
    case "GET /documents/receipts": return risposta(200, { receipts: [], totalCount: 0 });
    case "GET /documents/bills": return risposta(200, { bills: [], totalCount: 0 });
    default: return risposta(404, { error: "InvalidId" });
  }
}) as unknown as typeof fetch;

type Locale = { orgId: string; venueId: string; attore: Attore; userId: string };

async function creaLocale(nome: string, conDati: boolean): Promise<Locale> {
  const org = await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const venue = await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const utente = await db.user.create({ data: { email: `${PREFISSO}${nome}-${Date.now()}@foodtech.test` } });
  if (conDati) {
    await db.table.create({ data: { venueId: venue.id, label: "12" } });
    const cat = await db.menuCategory.create({ data: { venueId: venue.id, name: "Bevande" } });
    await db.menuItem.create({ data: { venueId: venue.id, categoryId: cat.id, name: "Birra", priceCents: 500 } });
  }
  return { orgId: org.id, venueId: venue.id, userId: utente.id, attore: { venueId: venue.id, orgId: org.id, userId: utente.id } };
}

let A: Locale; // con accesso beta, dati Foodtech già presenti
let B: Locale; // senza accesso beta
let C: Locale; // con accesso beta, Foodtech vuoto (importazione iniziale)
const envPrima = { chiave: process.env.CHIAVE_CIFRATURA, segreto: process.env.NEXTAUTH_SECRET };

async function pulisci() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: PREFISSO } }, select: { id: true } });
  const venues = await db.venue.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { id: true } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
}

beforeAll(async () => {
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 7).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  usaFetchPerProve(fetchFinto);
  await pulisci();
  A = await creaLocale("a", true);
  B = await creaLocale("b", true);
  C = await creaLocale("c", false);
  for (const l of [A, C]) await impostaAccessoBeta({ venueId: l.venueId, slug: SLUG, abilitato: true, email: "prove@foodtech.test" });
});

afterAll(async () => {
  await pulisci();
  usaFetchPerProve(undefined);
  process.env.CHIAVE_CIFRATURA = envPrima.chiave;
  process.env.NEXTAUTH_SECRET = envPrima.segreto;
  await db.$disconnect();
});

beforeEach(() => {
  cassa.revocata = null;
  cassa.giu = false;
});

const inst = async (l: Locale) => (await trovaInstallazione(l.venueId, SLUG))!;
const sync = async (l: Locale) =>
  eseguiSincronizzazione({ installationId: (await inst(l)).id, venueId: l.venueId, operazione: "full", trigger: "MANUAL" });

/** Il wizard, con le stesse chiamate che fa l'interfaccia. */
async function wizard(l: Locale, chiave: string, sede = "101", gruppi: string[] = ["tavoli", "menu"]) {
  if (!(await trovaInstallazione(l.venueId, SLUG)) || (await inst(l)).status === "NOT_INSTALLED") await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, { apiKey: chiave }); // 1. accesso
  const opz = await opzioniConfigurazione(l.attore, SLUG, ORIGINE); // 2. verifica
  const scelta = opz.locations!.find((o) => o.value === sede)!;
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { idSalesPoint: sede }, etichette: { idSalesPoint: scelta.label } }); // 3. sede
  const prova = provaPerIlCliente(await provaConnessione(l.attore, SLUG, ORIGINE));
  expect(prova.ok).toBe(true);
  const voce = voceDi(SLUG)!;
  await salvaCapacita(l.attore, SLUG, capacitaDaGruppi(voce.capacita, gruppi), ORIGINE); // 4. sincronizzazione
  await attiva(l.attore, SLUG, ORIGINE);
}

describe("catalogo e pagina del cliente", () => {
  it("senza accesso beta: «In anteprima», «Richiedi attivazione»; Adyen «Prossimamente», «Avvisami»", async () => {
    const schede = await catalogoCliente(B.venueId, { stripe: false });
    expect(schede.find((s) => s.slug === SLUG)).toMatchObject({ stato: "IN_ANTEPRIMA", etichettaStato: "In anteprima", azione: "RICHIEDI_ATTIVAZIONE" });
    expect(schede.find((s) => s.slug === "adyen")).toMatchObject({ stato: "PROSSIMAMENTE", etichettaStato: "Prossimamente", azione: "AVVISAMI" });
    senzaParoleTecniche(schede, "catalogo");
    // Il requisito del piano sta nella guida della chiave, non sulle card.
    expect(JSON.stringify(schede)).not.toContain("Enterprise");
  });

  it("con accesso beta: «In anteprima», «Collega»", async () => {
    const schede = await catalogoCliente(A.venueId, { stripe: false });
    expect(schede.find((s) => s.slug === SLUG)).toMatchObject({ stato: "IN_ANTEPRIMA", azione: "COLLEGA" });
  });

  it("Lightspeed senza il client OAuth di Foodtech: in fase di attivazione, nessun modulo", async () => {
    const prima = process.env.LIGHTSPEED_K_CLIENT_ID;
    delete process.env.LIGHTSPEED_K_CLIENT_ID;
    const d = (await dettaglioCliente(A.venueId, "lightspeed-k"))!;
    expect(d).toMatchObject({ inAttivazione: true, azione: "RICHIEDI_ATTIVAZIONE" });
    if (prima !== undefined) process.env.LIGHTSPEED_K_CLIENT_ID = prima;
  });

  it("la pagina di un'integrazione non collegata non ha niente di tecnico", async () => {
    for (const slug of [SLUG, "tilby", "oracle-simphony", "lightspeed-k", "adyen"]) {
      senzaParoleTecniche(await dettaglioCliente(B.venueId, slug), slug);
    }
  });

  it("senza accesso beta non si collega un'anteprima, nemmeno chiamando il servizio", async () => {
    await expect(installa(B.attore, SLUG)).rejects.toMatchObject({ code: "integration_beta_required" });
    expect(await trovaInstallazione(B.venueId, SLUG)).toBeNull();
  });
});

describe("Richiedi attivazione", () => {
  it("crea la richiesta per il locale, una sola, e la mostra al Super Admin", async () => {
    const r = await richiediAttivazione({ venueId: B.venueId, userId: B.userId }, SLUG);
    expect(r).toMatchObject({ kind: "ACCESS", status: "PENDING", giaDisponibile: false });
    await richiediAttivazione({ venueId: B.venueId, userId: B.userId }, SLUG);
    const righe = await db.integrationAccessRequest.findMany({ where: { venueId: B.venueId, integrationSlug: SLUG } });
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ kind: "ACCESS", status: "PENDING", requestedById: B.userId });
    expect(righe[0]!.requestedAt).toBeInstanceOf(Date);

    const scheda = (await catalogoCliente(B.venueId, { stripe: false })).find((s) => s.slug === SLUG)!;
    expect(scheda.azione).toBe("RICHIESTA_INVIATA");
    const coda = (await richiesteAperte()).find((x) => x.venueId === B.venueId && x.slug === SLUG)!;
    expect(coda).toMatchObject({ integrazione: "Cassa in Cloud", tipo: "ACCESS", abilitabile: true });
    expect(coda.locale).toContain(PREFISSO);
  });

  it("nessuna richiesta parte verso il fornitore", async () => {
    const chiamatePrima = cassa.token.size;
    await richiediAttivazione({ venueId: B.venueId, userId: B.userId }, "tilby");
    expect(cassa.token.size).toBe(chiamatePrima);
  });

  it("«Abilita beta» concede l'accesso e chiude la richiesta: il cliente vede «Collega»", async () => {
    const coda = (await richiesteAperte()).find((x) => x.venueId === B.venueId && x.slug === SLUG)!;
    await approvaRichiesta(coda.id, "admin@foodtech.test");
    expect(await db.integrationBetaAccess.findUnique({ where: { venueId_integrationSlug: { venueId: B.venueId, integrationSlug: SLUG } } })).toMatchObject({ enabled: true });
    expect(await db.integrationAccessRequest.findUnique({ where: { id: coda.id } })).toMatchObject({ status: "APPROVED", resolvedByEmail: "admin@foodtech.test" });
    expect((await catalogoCliente(B.venueId, { stripe: false })).find((s) => s.slug === SLUG)!.azione).toBe("COLLEGA");
    // Già collegabile: chiedere non crea niente.
    expect(await richiediAttivazione({ venueId: B.venueId, userId: B.userId }, SLUG)).toMatchObject({ giaDisponibile: true });
  });

  it("«Avvisami» su una voce senza adattatore: si archivia, non si abilita", async () => {
    const r = await richiediAttivazione({ venueId: B.venueId, userId: B.userId }, "adyen");
    expect(r.kind).toBe("NOTIFY");
    expect((await catalogoCliente(B.venueId, { stripe: false })).find((s) => s.slug === "adyen")!.azione).toBe("AVVISO_ATTIVO");
    const coda = (await richiesteAperte()).find((x) => x.venueId === B.venueId && x.slug === "adyen")!;
    expect(coda.abilitabile).toBe(false);
    await expect(approvaRichiesta(coda.id, "admin@foodtech.test")).rejects.toMatchObject({ code: "validation_failed" });
    await archiviaRichiesta(coda.id, "admin@foodtech.test");
    expect((await catalogoCliente(B.venueId, { stripe: false })).find((s) => s.slug === "adyen")!.azione).toBe("AVVISAMI");
  });
});

describe("il wizard collega davvero", () => {
  it("API Key → verifica → punto vendita → sincronizzazione: installazione vera, «Collegata»", async () => {
    await wizard(A, "chiave-A");
    const i = await inst(A);
    expect(i).toMatchObject({ status: "ACTIVE", externalLocationId: "101", externalLocationName: "Torino Centro" });
    expect(new Set(i.enabledCapabilities)).toEqual(new Set(["locations", "tables", "menu", "tax_rates"]));
    expect(await db.integrationCredential.count({ where: { installationId: i.id } })).toBe(1);

    // Collegata subito, e la sincronizzazione è un'altra cosa: in attesa.
    const prima = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(prima).toMatchObject({ stato: "COLLEGATO" });
    expect(prima.installazione!.sincronizzazione).toBe("in_attesa");
    expect((await catalogoCliente(A.venueId, { stripe: false })).find((s) => s.slug === SLUG)!.riga).toBe("Torino Centro · Prima sincronizzazione in attesa");

    await sync(A);
    const d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d).toMatchObject({ stato: "COLLEGATO", etichettaStato: "Collegato", azione: "GESTISCI" });
    expect(d.installazione!.sincronizzazione).toBe("riuscita");
    expect(d.installazione).toMatchObject({ condizione: "attiva", sede: "Torino Centro", gruppiAccesi: ["tavoli", "menu"] });
    expect(d.installazione!.ultimaSyncRiuscitaIl).not.toBeNull();
    // Tavoli: «12» abbinato da solo, «99» da collegare.
    expect(d.elementi.find((e) => e.tipo === "TABLE")).toMatchObject({ totale: 2, daCollegare: 1 });
    // Foodtech non è vuoto: niente proposta di importazione.
    expect(d.importabile).toBeNull();
  });

  it("il segreto non torna mai al browser, e nemmeno i dettagli tecnici", async () => {
    const i = await inst(A);
    const d = (await dettaglioCliente(A.venueId, SLUG, { aggiornamentiDa: { origine: ORIGINE } }))!;
    const testo = JSON.stringify([d, await catalogoCliente(A.venueId, { stripe: false })]);
    for (const s of ["chiave-A", "tok-chiave-A", "secretCiphertext", "apiKey\":\"", "lastError", "correlationId"]) expect(testo, s).not.toContain(s);
    // L'unico pezzo dell'indirizzo segreto che esce è quello da incollare, e solo a chi configura.
    expect(d.aggiornamenti!.indirizzo).toContain(i.webhookKey);
    expect(JSON.stringify(await dettaglioCliente(A.venueId, SLUG))).not.toContain(i.webhookKey);
    senzaParoleTecniche(await dettaglioCliente(A.venueId, SLUG), "dettaglio collegata");
  });

  it("chiave revocata: «Credenziali scadute»; ricollegata con una chiave nuova torna «Collegato»", async () => {
    cassa.revocata = "chiave-A";
    await sync(A);
    let d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d.stato).toBe("CREDENZIALI_SCADUTE");
    expect(d.installazione).toMatchObject({ condizione: "da_ricollegare", passo: 0 });
    expect(d.installazione!.problema).toMatchObject({ azione: "ricollega" });
    expect(d.installazione!.problema!.titolo).toMatch(/Cassa in Cloud|API Key/);

    // Ricollega: il wizard dal primo passo, con la configurazione di prima.
    await connettiConCampi(A.attore, SLUG, { apiKey: "chiave-A-nuova" });
    d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d.installazione).toMatchObject({ condizione: "in_configurazione", passo: 1, configurazione: { idSalesPoint: "101" } });
    await salvaConfigurazione(A.attore, SLUG, { configurazione: d.installazione!.configurazione, etichette: { idSalesPoint: "Torino Centro" } });
    expect((await provaConnessione(A.attore, SLUG, ORIGINE)).ok).toBe(true);
    await attiva(A.attore, SLUG, ORIGINE);
    // Ricollegata: «Collegata», prima sincronizzazione in attesa — non «richiede attenzione».
    d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d.stato).toBe("COLLEGATO");
    expect(d.installazione).toMatchObject({ sincronizzazione: "in_attesa", problema: null });
    await sync(A);
    expect((await dettaglioCliente(A.venueId, SLUG))!.installazione!.sincronizzazione).toBe("riuscita");
  });

  it("la prima sincronizzazione fallisce: «Errore di connessione», con la frase e il gesto giusti", async () => {
    await attiva(A.attore, SLUG, ORIGINE).catch(() => undefined);
    // Una sincronizzazione nuova dopo un'attivazione: il fornitore è giù.
    await db.integrationInstallation.update({ where: { id: (await inst(A)).id }, data: { activatedAt: new Date() } });
    cassa.giu = true;
    await sync(A);
    const d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d.stato).toBe("ERRORE_CONNESSIONE");
    expect(d.installazione).toMatchObject({ condizione: "da_controllare", sincronizzazione: "non_riuscita" });
    expect(d.installazione!.problema).toMatchObject({ titolo: "Cassa in Cloud non risponde", azione: "riprova" });
    cassa.giu = false;
    await sync(A);
    expect((await dettaglioCliente(A.venueId, SLUG))!).toMatchObject({ stato: "COLLEGATO" });
  });

  it("un interruttore spento non si sincronizza, e resta spento dopo disconnessione e ricollegamento", async () => {
    const voce = voceDi(SLUG)!;
    // Il cliente spegne «Menu e prodotti».
    await salvaCapacita(A.attore, SLUG, capacitaDaGruppi(voce.capacita, ["tavoli"], (await inst(A)).enabledCapabilities), ORIGINE);
    cassa.chiamate = [];
    await sync(A);
    expect(cassa.chiamate).toContain("GET /risto/tables");
    expect(cassa.chiamate.filter((c) => /products|categories|taxes|salesmodes/.test(c))).toEqual([]);
    expect((await dettaglioCliente(A.venueId, SLUG))!.installazione!.gruppiAccesi).toEqual(["tavoli"]);

    // Disconnessa e ricollegata: la scelta torna nel wizard, e nessuno la cambia da solo.
    await disinstalla(A.attore, SLUG, ORIGINE);
    await installa(A.attore, SLUG);
    const riaperta = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(riaperta.installazione).toMatchObject({ gruppiAccesi: [], gruppiScelti: ["tavoli"] });
    await wizard(A, "chiave-A-nuova", "101", riaperta.installazione!.gruppiScelti!);
    cassa.chiamate = [];
    await sync(A);
    expect(cassa.chiamate.filter((c) => /products|categories|taxes/.test(c))).toEqual([]);
    expect((await inst(A)).enabledCapabilities.sort()).toEqual(["locations", "tables"]);
  });

  it("disconnetti: via credenziali e collegamenti, il cliente vede di nuovo «Collega»", async () => {
    const id = (await inst(A)).id;
    await disinstalla(A.attore, SLUG, ORIGINE);
    expect(await db.integrationCredential.count({ where: { installationId: id } })).toBe(0);
    expect(await db.externalEntityMapping.count({ where: { installationId: id } })).toBe(0);
    const d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d.installazione).toBeNull();
    expect(d.azione).toBe("COLLEGA");
    // Tavoli e menu di Foodtech restano.
    expect(await db.table.count({ where: { venueId: A.venueId } })).toBe(1);
  });
});

describe("importazione iniziale", () => {
  it("Foodtech vuoto: propone e importa tavoli, categorie e prodotti, collegati all'originale", async () => {
    await wizard(C, "chiave-C");
    await sync(C);
    const d = (await dettaglioCliente(C.venueId, SLUG))!;
    expect(d.importabile).toEqual({ tavoli: 2, prodotti: 2, categorie: 1 });

    const e = await importaIniziale(C.attore, SLUG, { tavoli: true, menu: true });
    expect(e).toEqual({ tavoli: 2, prodotti: 2, categorie: 1 });
    const tavoli = await db.table.findMany({ where: { venueId: C.venueId }, include: { room: true }, orderBy: { label: "asc" } });
    expect(tavoli.map((t) => [t.label, t.seats, t.room?.name])).toEqual([
      ["12", 4, "Sala interna"],
      ["99", 2, "Sala interna"],
    ]);
    const margherita = await db.menuItem.findFirstOrThrow({ where: { venueId: C.venueId, name: "Margherita" }, include: { MenuCategory: true } });
    expect(margherita).toMatchObject({ priceCents: 850 });
    expect(margherita.MenuCategory.name).toBe("Pizze");
    const libere = await db.externalEntityMapping.count({
      where: { installationId: (await inst(C)).id, internalId: null, entityType: { in: ["TABLE", "PRODUCT", "CATEGORY"] } },
    });
    expect(libere).toBe(0);

    // Una volta pieno, Foodtech non propone più niente, e un secondo import si rifiuta.
    expect((await dettaglioCliente(C.venueId, SLUG))!.importabile).toBeNull();
    await expect(importaIniziale(C.attore, SLUG, { tavoli: true, menu: false })).rejects.toMatchObject({ code: "conflict" });
    // Una sincronizzazione dopo non stacca ciò che è stato importato.
    await sync(C);
    expect(
      await db.externalEntityMapping.count({ where: { installationId: (await inst(C)).id, internalId: null, entityType: "TABLE" } }),
    ).toBe(0);
  });

  it("dove c'è già qualcosa non si importa: si collega", async () => {
    await expect(importaIniziale(A.attore, SLUG, { tavoli: true, menu: true })).rejects.toBeTruthy();
  });
});

describe("due esperienze separate", () => {
  const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("il Super Admin ha la vista tecnica e la console di certificazione in /admin/integrazioni/<slug>", () => {
    const admin = leggi("src/app/admin/integrazioni/[slug]/page.tsx");
    expect(admin).toContain("<ConsoleCertificazione");
    expect(admin).toContain("richiesteAperte");
    // Il layout di /admin risponde «non esiste» a chi non è Super Admin.
    expect(leggi("src/app/admin/layout.tsx")).toMatch(/superAdminCorrente\(\)[\s\S]*notFound\(\)/);
  });

  it("le pagine e i componenti del cliente non montano la console né leggono la vista interna", () => {
    const cliente = [
      "src/app/(app)/settings/integrations/page.tsx",
      "src/app/(app)/settings/integrations/[slug]/page.tsx",
      "src/app/api/integrations/[slug]/route.ts",
      "src/app/api/integrations/route.ts",
      "src/components/integrations/catalogo-integrazioni.tsx",
      "src/components/integrations/wizard-collegamento.tsx",
      "src/components/integrations/gestione-integrazione.tsx",
      "src/components/integrations/presentazione-integrazione.tsx",
    ].map(leggi);
    for (const s of cliente) {
      expect(s).not.toMatch(/console-certificazione|ConsoleCertificazione/);
      expect(s).not.toMatch(/from "@\/server\/integrations\/vista"/);
    }
  });
});
