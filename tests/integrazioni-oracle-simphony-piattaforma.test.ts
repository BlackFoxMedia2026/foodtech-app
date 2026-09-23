import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { createHmac } from "node:crypto";
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
import { usaRisolutorePerProve } from "@/server/integrations/indirizzi";
import { HOST_AUTH, HOST_STS, ORACLE } from "./fixture-oracle-simphony";
import { creaOracleFinto } from "./oracle-finto";

/**
 * **Oracle Simphony dentro la piattaforma, contro il database vero.**
 *
 * L'adattatore è quello vero; Oracle no (`oracle-finto.ts`, sugli schemi
 * dello swagger ufficiale), con **un API account per locale**. Tutto il resto
 * — servizio, cifratura, mappature, sincronizzazione, notifiche, coda, invio
 * delle comande, ripiego sul conto chiuso — è il codice di produzione.
 * Nessuna chiamata esce da qui.
 */

const db = new PrismaClient();
const PREFISSO = "test-oracle-";
const SLUG = "oracle-simphony";
// Un dominio .com in HTTPS: Oracle consegna le notifiche solo così.
const ORIGINE = "https://app.foodtech.com";
const CAPACITA = ["locations", "tables", "menu", "tax_rates", "payment_methods", "orders.read", "orders.write"];

if (!/dev|test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Queste prove scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const oracle = creaOracleFinto();
const CAMPI_A = { sts: HOST_STS, auth: HOST_AUTH, clientId: "client-A", organizzazione: "tfoinc", utente: "api-a", password: "segreta-A" };
const CAMPI_B = { ...CAMPI_A, clientId: "client-B", utente: "api-b", password: "segreta-B" };

type Locale = { venueId: string; attore: Attore; b2: string; antipasto: string; primo: string; tiramisu: string; caffe: string };

async function creaLocale(nome: string): Promise<Locale> {
  const org = await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const venue = await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } });
  const b2 = await db.table.create({ data: { venueId: venue.id, label: "B2" } });
  const cat = await db.menuCategory.create({ data: { venueId: venue.id, name: "Cucina" } });
  const piatto = (name: string) => db.menuItem.create({ data: { venueId: venue.id, categoryId: cat.id, name, priceCents: 1000 } });
  const [a, p, t, c] = await Promise.all([piatto("Antipasto della casa"), piatto("Primo del giorno"), piatto("Tiramisù"), piatto("Caffè")]);
  return { venueId: venue.id, attore: { venueId: venue.id, orgId: org.id, userId: `u-${nome}` }, b2: b2.id, antipasto: a.id, primo: p.id, tiramisu: t.id, caffe: c.id };
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
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 3).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  usaFetchPerProve(oracle.fetchFinto);
  usaRisolutorePerProve(async () => ["20.50.60.70"]);
  await pulisci();
  A = await creaLocale("a");
  B = await creaLocale("b");
  // Anteprime: si installano solo con l'accesso beta concesso da Foodtech (certificazione/accesso.ts).
  for (const l of [A, B]) await impostaAccessoBeta({ venueId: l.venueId, slug: SLUG, abilitato: true, email: "prove@foodtech.test" });
});

afterAll(async () => {
  await pulisci();
  usaFetchPerProve(undefined);
  usaRisolutorePerProve(undefined);
  process.env.CHIAVE_CIFRATURA = envPrima.chiave;
  process.env.NEXTAUTH_SECRET = envPrima.segreto;
  await db.$disconnect();
});

beforeEach(() => {
  oracle.stato.guasto = null;
  oracle.stato.guastoSoloCheck = false;
  oracle.stato.posCollegato = true;
  oracle.stato.ritardoCheckMs = 0;
});

const inst = async (l: Locale) => (await trovaInstallazione(l.venueId, SLUG))!;
const sync = async (l: Locale) => eseguiSincronizzazione({ installationId: (await inst(l)).id, venueId: l.venueId, operazione: "full", trigger: "MANUAL" });

async function finoAdAttiva(l: Locale, campi: typeof CAMPI_A, destinazione: string) {
  await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, campi);
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { destinazione, tipoOrdine: `${destinazione}:1`, dipendente: "900" } });
  expect(await provaConnessione(l.attore, SLUG, ORIGINE)).toMatchObject({ ok: true });
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

function notifica(corpo: unknown, chiave: string, keyId: string) {
  const testo = JSON.stringify(corpo);
  return { corpo: testo, intestazioni: new Headers({ digest: createHmac("sha256", Buffer.from(chiave, "base64")).update(testo).digest("base64"), "key-id": keyId }) };
}

/* -------------------------------------------------------------------------- */

describe("installazione con l'API account", () => {
  it("password sbagliata: niente di salvato, la frase è quella di Simphony", async () => {
    await installa(A.attore, SLUG);
    await expect(connettiConCampi(A.attore, SLUG, { ...CAMPI_A, password: "no" })).rejects.toMatchObject({
      code: "integration_auth_invalid",
      message: expect.stringMatching(/Accesso a Simphony rifiutato/),
    });
    expect(await db.integrationCredential.count({ where: { installationId: (await inst(A)).id } })).toBe(0);
  });

  it("un OpenID Provider fuori dai domini ammessi: la password non parte nemmeno", async () => {
    const prima = oracle.stato.chiamate.length;
    await expect(connettiConCampi(A.attore, SLUG, { ...CAMPI_A, auth: "https://raccoglitore.example.com" })).rejects.toMatchObject({
      code: "integration_invalid_configuration",
    });
    expect(oracle.stato.chiamate.length).toBe(prima);
  });

  it("accesso → RVC e tipo d'ordine → dipendente → prova → attiva, con le notifiche registrate", async () => {
    await connettiConCampi(A.attore, SLUG, CAMPI_A);
    const i = await inst(A);
    expect(i.status).toBe("NEEDS_CONFIGURATION");
    const riga = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: i.id } });
    for (const s of ["segreta-A", "id-client-A", "rt-client-A", "api-a", HOST_STS]) expect(riga.secretCiphertext, s).not.toContain(s);
    // I campi dell'autenticazione non finiscono in chiaro nella configurazione.
    expect(JSON.stringify(i.configuration)).not.toContain("client-A");

    await salvaConfigurazione(A.attore, SLUG, {
      configurazione: { destinazione: "fdmnh144:42", tipoOrdine: "fdmnh144:42:1", dipendente: "900" },
      etichette: { destinazione: "Ristorante Torino · Sala" },
    });
    expect(await provaConnessione(A.attore, SLUG, ORIGINE)).toMatchObject({ ok: true, account: "TFO Inc", sede: "Sala" });
    await salvaCapacita(A.attore, SLUG, CAPACITA, ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
    const dopo = await inst(A);
    expect(dopo.status).toBe("ACTIVE");
    expect(dopo.externalLocationId).toBe("fdmnh144:42");
    expect(oracle.stato.registrazioni.has("client-A")).toBe(true);
    expect(oracle.stato.iscrizioni.filter((s) => s.clientId === "client-A")).toHaveLength(4);
    expect((dopo.metadata as { sottoscrizioni: unknown[] }).sottoscrizioni).toHaveLength(4);
  });

  it("un secondo locale con un altro API account e un altro revenue center", async () => {
    await finoAdAttiva(B, CAMPI_B, "milano01:7");
    expect((await inst(B)).externalLocationId).toBe("milano01:7");
  });

  it("POS scollegato: la prova riesce, ma lo dice", async () => {
    oracle.stato.posCollegato = false;
    const r = await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(r).toMatchObject({ ok: true });
    expect((r as { avvisi: string[] }).avvisi.join(" ")).toMatch(/non risulta collegato al POS/);
  });
});

describe("importazione iniziale e mappature", () => {
  it("solo mappature, abbina il certo, non tocca Foodtech", async () => {
    expect(await sync(A)).toMatchObject({ eseguita: true, riuscita: true });
    const mappe = await db.externalEntityMapping.findMany({ where: { installationId: (await inst(A)).id } });
    const per = (t: string) => mappe.filter((m) => m.entityType === t);
    expect(per("TABLE").find((m) => m.externalId === "B2")!.internalId).toBe(A.b2);
    expect(per("TABLE").find((m) => m.externalId === "B3")!.internalId).toBeNull();
    expect(per("PRODUCT").find((m) => m.externalId === "101-1")!.internalId).toBe(A.antipasto);
    expect(per("PRODUCT").find((m) => m.externalId === "102-1")!.metadata).toMatchObject({ disponibile: false });
    expect(per("DISCOUNT")).toHaveLength(2);
    expect(per("SERVICE_CHARGE")).toHaveLength(1);
    expect(per("PAYMENT_METHOD")).toHaveLength(3);
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: A.antipasto } })).priceCents).toBe(1000);
  });
});

describe("isolamento", () => {
  it("ogni locale con il suo API account; i segreti non attraversano i locali né arrivano al browser", async () => {
    await sync(B);
    oracle.stato.chiamate.length = 0;
    await sync(A);
    await sync(B);
    const client = new Set(
      oracle.stato.chiamate.filter((c) => c.auth).map((c) => oracle.stato.idToken.get(c.auth!.replace("Bearer ", ""))),
    );
    expect(client).toEqual(new Set(["client-A", "client-B"]));
    expect(await leggiSegreti({ id: (await inst(A)).id, venueId: B.venueId })).toBeNull();
    const d = await dettaglioPerLocale(A.venueId, SLUG, true, { origine: ORIGINE });
    const c = await catalogoPerLocale(A.venueId, { stripe: false });
    const tutto = JSON.stringify([d, c]);
    const reg = oracle.stato.registrazioni.get("client-A")!;
    for (const s of ["segreta-A", "id-client-A", "rt-client-A", reg.hmacKey, "client-A", "secretCiphertext"]) expect(tutto, s).not.toContain(s);
  });
});

describe("la comanda: check, round, conto chiuso", () => {
  it("20:10 B2: prima comanda → un check; ripetuta, resta uno", async () => {
    const i = await inst(A);
    const f = fornitoreIntegrazione({ ...i, nome: "Oracle" });
    const c1 = comanda(A, "cmd-1", [
      { menuItemId: A.antipasto, nome: "Antipasto della casa", quantita: 2 },
      { menuItemId: A.primo, nome: "Primo del giorno", quantita: 2 },
    ]);
    // Il primo è esaurito su Simphony ma la prova non lo blocca: la disponibilità è un'informazione, non un filtro.
    const e1 = await f.invia(c1);
    expect(e1).toMatchObject({ ok: true, presaInCarico: false });
    expect(await f.invia(c1)).toEqual(e1);
    expect(oracle.stato.postCheck).toBe(1);
    const check = [...oracle.stato.checks.values()][0]!;
    expect(check.header).toMatchObject({ tableName: "B2", guestCount: 2, orderTypeRef: 1, checkEmployeeRef: 900, rvcRef: 42 });
  });

  it("notifica CheckNotification «Submitted» firmata: arriva sul conto giusto; duplicata, una volta", async () => {
    const i = await inst(A);
    const checkRef = [...oracle.stato.checks.keys()][0]!;
    const reg = oracle.stato.registrazioni.get("client-A")!;
    const corpo = { messages: [{ ...ORACLE.notifica.check.messages[0]!, id: "n-1", resource: { ...ORACLE.notifica.check.messages[0]!.resource, checkRef } }] };
    const esiti = await Promise.all([1, 2, 3].map(() => riceviWebhook({ slug: SLUG, chiave: i.webhookKey, ...notifica(corpo, reg.hmacKey, reg.keyId) })));
    expect(esiti.filter((e) => e.status === 200)).toHaveLength(3);
    expect(esiti.filter((e) => "ripetuto" in e.corpo && e.corpo.ripetuto)).toHaveLength(2);
    const base = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-1" } });
    expect(base.metadata).toMatchObject({ preparazione: "Submitted", stato: "IN_PROGRESS" });
  });

  it("notifica con una firma sbagliata o di un altro revenue center", async () => {
    const i = await inst(A);
    const reg = oracle.stato.registrazioni.get("client-A")!;
    const falsa = notifica(ORACLE.notifica.configurazione, Buffer.alloc(32, 1).toString("base64"), reg.keyId);
    expect((await riceviWebhook({ slug: SLUG, chiave: i.webhookKey, ...falsa })).status).toBe(401);
    // ORACLE.notifica.configurazione è dell'RVC 26: conservata e ignorata.
    const altra = await riceviWebhook({ slug: SLUG, chiave: i.webhookKey, ...notifica(ORACLE.notifica.configurazione, reg.hmacKey, reg.keyId) });
    expect(altra.corpo).toMatchObject({ ignorato: "sede_diversa" });
  });

  it("20:40 B2 aggiunge dessert e caffè → round sullo stesso check, non un check nuovo", async () => {
    const i = await inst(A);
    const f = fornitoreIntegrazione({ ...i, nome: "Oracle" });
    const c2 = comanda(A, "cmd-2", [
      { menuItemId: A.tiramisu, nome: "Tiramisù", quantita: 2 },
      { menuItemId: A.caffe, nome: "Caffè", quantita: 2 },
    ]);
    expect(await f.invia(c2)).toMatchObject({ ok: true });
    await f.invia(c2);
    expect(oracle.stato.postCheck).toBe(1);
    expect(oracle.stato.postRound).toBe(1);
    const check = [...oracle.stato.checks.values()][0]!;
    expect(check.menuItems.map((r) => r.menuItemId)).toEqual([101, 102, 201, 202]);
    const m = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-2" } });
    expect(m.metadata).toMatchObject({ aggiuntaA: "ft-cmd-1", invio: { stato: "SYNCED", idEsterno: check.header.checkRef } });
  });

  it("il check viene pagato in cassa; la comanda dopo apre un check nuovo (nessuna notifica di chiusura documentata)", async () => {
    const i = await inst(A);
    const check = [...oracle.stato.checks.values()][0]!;
    check.header.status = "closed";
    const f = fornitoreIntegrazione({ ...i, nome: "Oracle" });
    expect(await f.invia(comanda(A, "cmd-3", [{ menuItemId: A.caffe, nome: "Caffè", quantita: 1 }]))).toMatchObject({ ok: true });
    expect(oracle.stato.postCheck).toBe(2);
    const m3 = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-3" } });
    expect(m3.metadata).toMatchObject({ contoPrecedenteChiuso: "ft-cmd-1", invio: { stato: "SYNCED" } });
    expect((m3.metadata as Record<string, unknown>).aggiuntaA).toBeUndefined();
    const base = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-1" } });
    expect(base.metadata).toMatchObject({ stato: "CLOSED" });
    // E la comanda successiva si aggiunge al check nuovo.
    await f.invia(comanda(A, "cmd-4", [{ menuItemId: A.tiramisu, nome: "Tiramisù", quantita: 1 }]));
    expect(oracle.stato.postCheck).toBe(2);
    const m4 = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-cmd-4" } });
    expect(m4.metadata).toMatchObject({ aggiuntaA: "ft-cmd-3" });
  });
});

describe("POS scollegato, STS giù, riprova", () => {
  const ordine = (riferimento: string, tavolo = "B4") => ({
    riferimento,
    tavolo,
    tavoloExternalId: tavolo,
    coperti: 2,
    cliente: null,
    nota: null,
    righe: [{ codiceProdotto: "202-1", nome: "Caffè", quantita: 1, prezzoUnitarioCents: null, note: null, datiProdotto: { menuItemId: 202, definitionSequence: 1 } }],
  });

  it("POS scollegato: PENDING_SYNC; torna collegato: la coda la manda — una volta", async () => {
    const i = await inst(A);
    oracle.stato.posCollegato = false;
    const prima = oracle.stato.postCheck;
    expect(await inviaOrdine(i, "giu-1", ordine("ft-giu-1"))).toEqual({ stato: "PENDING_SYNC", codiceErrore: "PROVIDER_UNAVAILABLE" });
    expect(oracle.stato.postCheck).toBe(prima);
    const riga = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER", externalId: "ft-giu-1" } });
    const lavoro = await db.backgroundJob.findUniqueOrThrow({ where: { dedupeKey: `integration.order:${riga.id}` } });
    const job = { id: lavoro.id, kind: lavoro.kind, attempts: 1, maxAttempts: 8, yields: 0, venueId: A.venueId };
    await expect(lavoroOrdine(lavoro.payload, job)).rejects.toThrow(/ordine_in_attesa/);
    oracle.stato.posCollegato = true;
    await lavoroOrdine(lavoro.payload, { ...job, attempts: 2 });
    expect(await statoInvio(i, "ft-giu-1")).toMatchObject({ stato: "SYNCED" });
    expect(oracle.stato.postCheck).toBe(prima + 1);
  });

  it("STS risponde 521 dopo 60 secondi: in attesa, riprovabile", async () => {
    const i = await inst(A);
    oracle.stato.guasto = "521";
    oracle.stato.guastoSoloCheck = true;
    expect(await inviaOrdine(i, "521-1", ordine("ft-521-1", "B3"))).toEqual({ stato: "PENDING_SYNC", codiceErrore: "PROVIDER_UNAVAILABLE" });
  });

  it("tre invii contemporanei della stessa comanda: un check solo", async () => {
    const i = await inst(A);
    oracle.stato.ritardoCheckMs = 150;
    const prima = oracle.stato.postCheck;
    await Promise.all([1, 2, 3].map(() => inviaOrdine(i, "conc-1", ordine("ft-conc-1", "B3"))));
    expect(oracle.stato.postCheck - prima).toBe(1);
  });

  it("STS giù o lento: sincronizzazione fallita, integrazione attiva e «da controllare»", async () => {
    for (const g of ["503", "timeout"] as const) {
      oracle.stato.guasto = g;
      expect(await sync(A)).toMatchObject({ eseguita: true, riuscita: false });
      const i = await inst(A);
      expect(i.status, g).toBe("ACTIVE");
      expect(i.healthStatus, g).toBe("DEGRADED");
    }
    oracle.stato.guasto = null;
    await sync(A);
    expect((await inst(A)).healthStatus).toBe("HEALTHY");
  });

  it("id_token revocato: «richiede attenzione»; ci si ricollega con la password", async () => {
    oracle.stato.guasto = "token_revocato";
    expect(await sync(A)).toMatchObject({ eseguita: true, riuscita: false });
    expect((await inst(A)).status).toBe("REAUTH_REQUIRED");
    oracle.stato.guasto = null;
    await connettiConCampi(A.attore, SLUG, CAMPI_A);
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

  it("disinstallata: via token, mappature, iscrizioni e registrazione presso Oracle; B non se ne accorge", async () => {
    const prima = await inst(A);
    await disinstalla(A.attore, SLUG, ORIGINE);
    expect(await db.integrationCredential.count({ where: { installationId: prima.id } })).toBe(0);
    expect(await db.externalEntityMapping.count({ where: { installationId: prima.id } })).toBe(0);
    expect(oracle.stato.iscrizioni.filter((s) => s.clientId === "client-A")).toHaveLength(0);
    expect(oracle.stato.registrazioni.has("client-A")).toBe(false);
    expect(oracle.stato.iscrizioni.filter((s) => s.clientId === "client-B")).toHaveLength(4);
    expect((await inst(B)).status).toBe("ACTIVE");
  });

  it("reinstallata da zero: indirizzo nuovo, chiave HMAC nuova", async () => {
    const prima = await inst(A);
    await finoAdAttiva(A, CAMPI_A, "fdmnh144:42");
    const dopo = await inst(A);
    expect(dopo.webhookKey).not.toBe(prima.webhookKey);
    const miei = oracle.stato.iscrizioni.filter((s) => s.clientId === "client-A");
    expect(miei).toHaveLength(4);
    expect(miei.every((s) => s.callbackUri.endsWith(`/${dopo.webhookKey}`))).toBe(true);
  });
});
