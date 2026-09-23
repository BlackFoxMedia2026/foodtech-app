import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registraVocePerProve, type VoceCatalogo } from "@/server/integrations/registry";
import { registraAdattatorePerProve } from "@/server/integrations/adapters";
import type { IntegrationAdapter, PosIntegrationAdapter } from "@/server/integrations/adapters/tipi";
import { ErroreIntegrazione } from "@/server/integrations/errori";
import {
  attiva,
  connettiConCampi,
  contestoFresco,
  disattiva,
  disinstalla,
  installa,
  provaConnessione,
  riattiva,
  salvaCapacita,
  salvaConfigurazione,
  trovaInstallazione,
  type Attore,
} from "@/server/integrations/installazioni";
import { eseguiSincronizzazione, lavoroSincronizzazione } from "@/server/integrations/sync";
import { riceviWebhook } from "@/server/integrations/webhooks";
import { abbinaAMano } from "@/server/integrations/mappature";
import { leggiSegreti } from "@/server/integrations/credenziali";
import { catalogoPerLocale, dettaglioPerLocale } from "@/server/integrations/vista";

/**
 * **La piattaforma integrazioni, dall'installazione alla disinstallazione,
 * contro il database vero.**
 *
 * L'adattatore è finto (`prova-cassa`) e il suo comportamento si comanda da
 * qui: risponde, rifiuta l'accesso, è giù, chiede di rallentare. Tutto il
 * resto — servizio, stati, cifratura, mappature, sincronizzazione, webhook,
 * coda — è il codice vero. È il modo di provare la piattaforma senza un
 * account presso un fornitore, e di provare i casi che con un fornitore vero
 * non si riescono a provocare a comando.
 */

const db = new PrismaClient();
const PREFISSO = "test-int-";
const SLUG = "prova-cassa";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Queste prove scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/* -------------------------------------------------------------------------- */
/*  L'adattatore finto                                                        */
/* -------------------------------------------------------------------------- */

type Modo = "ok" | "401" | "503" | "429" | "422";
const stato = {
  prova: "ok" as Modo,
  sync: "ok" as Modo,
  rinnovo: "ok" as "ok" | "morto",
  chiaviViste: [] as string[],
  rinnovi: 0,
  tokenRinnovoUsati: new Set<string>(),
};

function errore(m: Modo): ErroreIntegrazione | null {
  if (m === "401") return new ErroreIntegrazione("AUTH_EXPIRED", "401", { status: 401 });
  if (m === "503") return new ErroreIntegrazione("PROVIDER_UNAVAILABLE", "503", { status: 503 });
  if (m === "429") return new ErroreIntegrazione("RATE_LIMITED", "429", { status: 429, riprovaTraSecondi: 30 });
  if (m === "422") return new ErroreIntegrazione("VALIDATION", "422", { status: 422 });
  return null;
}

const adattatore: PosIntegrationAdapter = {
  slug: SLUG,
  versione: "0.0.1",
  minutiSyncProgrammata: 60,
  async connetti({ campi }) {
    if (campi.apiKey === "sbagliata") throw new ErroreIntegrazione("AUTH_INVALID", "chiave rifiutata");
    return {
      kind: "API_KEY",
      segreti: { apiKey: campi.apiKey!, refresh: `r-${campi.apiKey}-0` },
      scopes: ["tutto"],
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenExpiresAt: null,
    };
  },
  async rinnovaAutenticazione(ctx) {
    stato.rinnovi++;
    if (stato.rinnovo === "morto") throw new ErroreIntegrazione("AUTH_EXPIRED", "invalid_grant", { status: 400 });
    // Come Lightspeed: ogni token di rinnovo vale una volta sola.
    const vecchio = ctx.segreti.refresh!;
    if (stato.tokenRinnovoUsati.has(vecchio)) throw new ErroreIntegrazione("AUTH_EXPIRED", "invalid_grant", { status: 400 });
    stato.tokenRinnovoUsati.add(vecchio);
    await new Promise((r) => setTimeout(r, 30));
    return {
      kind: "API_KEY",
      segreti: { ...ctx.segreti, refresh: `r-${ctx.segreti.apiKey}-${stato.rinnovi}` },
      scopes: ["tutto"],
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenExpiresAt: null,
    };
  },
  async provaConnessione(ctx) {
    stato.chiaviViste.push(ctx.segreti.apiKey!);
    const e = errore(stato.prova);
    if (e) throw e;
    return {
      account: { externalId: "acc", nome: "Account di prova" },
      sedi: [
        { externalId: "L1", nome: "Sede Uno", account: null },
        { externalId: "L2", nome: "Sede Due", account: null },
      ],
      avvisi: [],
    };
  },
  async opzioniConfigurazione() {
    return { locations: [{ value: "L1", label: "Sede Uno" }] };
  },
  async attiva(ctx) {
    return { segretiAggiunti: { webhookPassword: `pw-${ctx.installazione.id}` } };
  },
  async sincronizza(ctx) {
    stato.chiaviViste.push(ctx.segreti.apiKey!);
    /* Una chiamata vera dura; senza questa pausa la prova «due
       sincronizzazioni insieme» diventava casuale: sotto carico la prima
       finiva prima che la seconda partisse, e allora partono entrambe — che è
       il comportamento giusto, ma non quello da provare. */
    await new Promise((r) => setTimeout(r, 150));
    const e = errore(stato.sync);
    if (e) throw e;
    return {
      entita: [
        { tipo: "TABLE", externalId: "e1", etichetta: "12" },
        { tipo: "TABLE", externalId: "e2", etichetta: "99" },
      ],
      scartati: [],
    };
  },
  verificaWebhook(ctx, w) {
    return !!ctx.segreti.webhookPassword && w.intestazioni.get("x-prova") === ctx.segreti.webhookPassword;
  },
  riceviWebhook(_ctx, w) {
    const b = JSON.parse(w.corpo) as { id: string; rif: string; sede?: string };
    return {
      idEvento: b.id,
      tipo: "order.status",
      sedeExternalId: b.sede ?? null,
      evento: { tipo: "pos.order.status", riferimento: b.rif, externalId: "X", stato: "ACCEPTED", motivo: null },
    };
  },
  pos: {},
};

const voce: VoceCatalogo = {
  id: "int_prova_cassa",
  slug: SLUG,
  nome: "Cassa di prova",
  fornitore: "Prova",
  categoria: "POS",
  descrizione: "Solo per le prove.",
  logo: { monogramma: "Pr" },
  implementazione: "IN_DEVELOPMENT",
  disponibilita: "PREVIEW",
  autenticazione: { modalita: "API_KEY", verificata: true },
  capacita: ["tables", "menu"],
  webhook: { eventi: ["order.status"], autenticazione: "intestazione" },
  configurazione: [
    { chiave: "apiKey", etichetta: "Chiave", tipo: "segreto", obbligatorio: true },
    { chiave: "sede", etichetta: "Sede", tipo: "scelta", obbligatorio: true, opzioniDa: "locations" },
  ],
  dati: { legge: [], scrive: [], permessi: [] },
  documentazione: null,
  versioneAdattatore: "0.0.1",
  requisitiPiattaforma: [],
  mancaPerOperare: ["niente, è una prova"],
};

/* -------------------------------------------------------------------------- */
/*  I locali                                                                  */
/* -------------------------------------------------------------------------- */

type Locale = { orgId: string; venueId: string; attore: Attore; tavolo12: string; nome: string };

async function creaLocale(nome: string, orgId?: string): Promise<Locale> {
  const org =
    orgId ??
    (await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` } })).id;
  const venue = await db.venue.create({
    data: { orgId: org, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` },
  });
  const tavolo = await db.table.create({ data: { venueId: venue.id, label: "Tavolo 12" } });
  return {
    orgId: org,
    venueId: venue.id,
    attore: { venueId: venue.id, orgId: org, userId: `utente-${nome}` },
    tavolo12: tavolo.id,
    nome: venue.name,
  };
}

const ORIGINE = "https://app.foodtech.test";
let A: Locale;
let A2: Locale;
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
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 3).toString("base64");
  process.env.NEXTAUTH_SECRET = "segreto-di-prova";
  annulla.push(registraVocePerProve(voce), registraAdattatorePerProve(adattatore as IntegrationAdapter));
  await pulisci();
  A = await creaLocale("a");
  A2 = await creaLocale("a2", A.orgId);
  B = await creaLocale("b");
  // Anteprime: si installano solo con l'accesso beta concesso da Foodtech (certificazione/accesso.ts).
  for (const l of [A, A2, B]) await impostaAccessoBeta({ venueId: l.venueId, slug: SLUG, abilitato: true, email: "prove@foodtech.test" });
});

afterAll(async () => {
  await pulisci();
  annulla.forEach((f) => f());
  process.env.CHIAVE_CIFRATURA = envPrima.chiave;
  process.env.NEXTAUTH_SECRET = envPrima.segreto;
  await db.$disconnect();
});

beforeEach(() => {
  stato.prova = "ok";
  stato.sync = "ok";
  stato.rinnovo = "ok";
  stato.chiaviViste = [];
});

/** Porta un locale fino ad ACTIVE, con la sua chiave. */
async function finoAdAttiva(l: Locale, chiave: string, sede = "L1") {
  await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, { apiKey: chiave });
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { sede }, etichette: { sede: "Sede Uno" } });
  const p = await provaConnessione(l.attore, SLUG, ORIGINE);
  expect(p.ok).toBe(true);
  await salvaCapacita(l.attore, SLUG, ["tables"], ORIGINE);
  return attiva(l.attore, SLUG, ORIGINE);
}

async function installazione(l: Locale) {
  return (await trovaInstallazione(l.venueId, SLUG))!;
}

/* -------------------------------------------------------------------------- */

describe("il percorso completo", () => {
  it("installa → autenticazione → configurazione → prova → capacità → attiva", async () => {
    const i0 = await installa(A.attore, SLUG);
    expect(i0.status).toBe("INSTALLING");

    // Prima dell'autenticazione non si configura niente di utile, e non si attiva.
    await expect(attiva(A.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "invalid_transition" });

    await connettiConCampi(A.attore, SLUG, { apiKey: "chiave-segreta-A" });
    expect((await installazione(A)).status).toBe("NEEDS_CONFIGURATION");

    await salvaConfigurazione(A.attore, SLUG, { configurazione: { sede: "L1" }, etichette: { sede: "Sede Uno" } });
    await expect(attiva(A.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "invalid_transition" });

    const prova = await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(prova).toMatchObject({ ok: true, account: "Account di prova", sede: "Sede Uno" });
    expect((await installazione(A)).status).toBe("CONNECTED");

    // Capacità non offerte dalla voce: rifiutate.
    await expect(salvaCapacita(A.attore, SLUG, ["orders.write"], ORIGINE)).rejects.toMatchObject({
      code: "validation_failed",
    });
    await salvaCapacita(A.attore, SLUG, ["tables"], ORIGINE);

    const dopo = await attiva(A.attore, SLUG, ORIGINE);
    expect(dopo.status).toBe("ACTIVE");
    expect(dopo.activatedAt).not.toBeNull();

    // La prima importazione è in coda, e una sola.
    const lavori = await db.backgroundJob.findMany({ where: { venueId: A.venueId, kind: "integration.sync" } });
    expect(lavori).toHaveLength(1);
    expect((lavori[0]!.payload as { trigger: string }).trigger).toBe("INITIAL_IMPORT");
  });

  it("la sincronizzazione scrive le mappature, abbina solo il certo, e lascia il registro", async () => {
    const i = await installazione(A);
    const e = await eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" });
    expect(e).toMatchObject({ eseguita: true, riuscita: true, riusciti: 2 });

    const mappe = await db.externalEntityMapping.findMany({ where: { installationId: i.id }, orderBy: { externalId: "asc" } });
    expect(mappe.map((m) => [m.externalId, m.internalId])).toEqual([
      ["e1", A.tavolo12], // «12» con «Tavolo 12»
      ["e2", null], // «99» da noi non c'è
    ]);

    // Rifarla non crea doppioni.
    await eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "SCHEDULED" });
    expect(await db.externalEntityMapping.count({ where: { installationId: i.id } })).toBe(2);

    const log = await db.integrationSyncLog.findMany({ where: { installationId: i.id } });
    expect(log.every((l) => l.status === "SUCCEEDED" && l.correlationId.startsWith("int_"))).toBe(true);
    const dopo = await installazione(A);
    expect(dopo.status).toBe("ACTIVE");
    expect(dopo.healthStatus).toBe("HEALTHY");
    expect(dopo.lastSuccessfulSyncAt).not.toBeNull();
  });

  it("due sincronizzazioni insieme: ne parte una", async () => {
    const i = await installazione(A);
    const [x, y] = await Promise.all([
      eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" }),
      eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" }),
    ]);
    const eseguite = [x, y].filter((r) => r.eseguita);
    expect(eseguite).toHaveLength(1);
    expect([x, y].some((r) => !r.eseguita && r.motivo === "gia_in_corso")).toBe(true);
    expect((await installazione(A)).status).toBe("ACTIVE");
  });
});

describe("nessun segreto esce", () => {
  it("nel database la chiave è cifrata, e legata all'installazione", async () => {
    const i = await installazione(A);
    const riga = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: i.id } });
    expect(riga.secretCiphertext).not.toContain("chiave-segreta-A");
    expect(riga.secretCiphertext.startsWith("v1l:")).toBe(true);
    expect(riga.venueId).toBe(A.venueId);
  });

  it("le viste per il browser non contengono chiavi, password del webhook né la chiave dell'indirizzo", async () => {
    const i = await installazione(A);
    const d = JSON.stringify(await dettaglioPerLocale(A.venueId, SLUG, true));
    const c = JSON.stringify(await catalogoPerLocale(A.venueId, { stripe: false }));
    for (const segreto of ["chiave-segreta-A", `pw-${i.id}`, i.webhookKey, "secretCiphertext", "lastError\""]) {
      expect(d, segreto).not.toContain(segreto);
      expect(c, segreto).not.toContain(segreto);
    }
    expect(d).toContain("\"presenti\":true");
  });

  it("senza chiave di cifratura non si installa niente", async () => {
    process.env.CHIAVE_CIFRATURA = "";
    try {
      await expect(installa(B.attore, SLUG)).rejects.toMatchObject({ code: "integration_encryption_unavailable" });
    } finally {
      process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 3).toString("base64");
    }
  });
});

describe("isolamento fra ristoranti", () => {
  it("il locale B non vede e non tocca l'installazione di A", async () => {
    const iA = await installazione(A);
    expect(await trovaInstallazione(B.venueId, SLUG)).toBeNull();
    await expect(provaConnessione(B.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "not_found" });
    await expect(disattiva(B.attore, SLUG)).rejects.toMatchObject({ code: "not_found" });
    await expect(disinstalla(B.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "not_found" });

    // Le credenziali di A lette «come B» non esistono.
    expect(await leggiSegreti({ id: iA.id, venueId: B.venueId })).toBeNull();

    // Una mappatura di A non si cambia passando dal locale B.
    const m = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: iA.id, entityType: "TABLE", externalId: "e2" } });
    await expect(abbinaAMano({ id: iA.id, venueId: B.venueId }, m.id, null)).rejects.toMatchObject({ code: "not_found" });
    // E un tavolo di B non si abbina a una mappatura di A.
    await expect(abbinaAMano(iA, m.id, B.tavolo12)).rejects.toMatchObject({ code: "not_found" });
    // Il tavolo giusto sì, e diventa una scelta manuale.
    await abbinaAMano(iA, m.id, null);
    expect((await db.externalEntityMapping.findUniqueOrThrow({ where: { id: m.id } })).manual).toBe(true);
  });

  it("B installa la stessa integrazione con il suo account: due installazioni, due chiavi", async () => {
    await finoAdAttiva(B, "chiave-segreta-B", "L2");
    const iA = await installazione(A);
    const iB = await installazione(B);
    expect(iB.id).not.toBe(iA.id);

    stato.chiaviViste = [];
    await eseguiSincronizzazione({ installationId: iA.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" });
    await eseguiSincronizzazione({ installationId: iB.id, venueId: B.venueId, operazione: "full", trigger: "MANUAL" });
    expect(stato.chiaviViste).toEqual(["chiave-segreta-A", "chiave-segreta-B"]);

    // Una sincronizzazione con l'id di A e il locale di B non trova niente.
    expect(
      await eseguiSincronizzazione({ installationId: iA.id, venueId: B.venueId, operazione: "full", trigger: "MANUAL" }),
    ).toEqual({ eseguita: false, motivo: "non_trovata" });

    // La credenziale di A copiata sotto l'installazione di B non si decifra.
    const credA = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: iA.id } });
    const credB = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: iB.id } });
    await db.integrationCredential.update({ where: { id: credB.id }, data: { secretCiphertext: credA.secretCiphertext } });
    await expect(leggiSegreti(iB)).rejects.toThrow("sigillo_non_valido");
    await db.integrationCredential.update({ where: { id: credB.id }, data: { secretCiphertext: credB.secretCiphertext } });
  });

  it("stesso gruppo, stessa sede del fornitore: si avvisa; gruppi diversi: silenzio", async () => {
    await installa(A2.attore, SLUG);
    await connettiConCampi(A2.attore, SLUG, { apiKey: "chiave-A2" });
    await salvaConfigurazione(A2.attore, SLUG, { configurazione: { sede: "L1" } });
    const p = await provaConnessione(A2.attore, SLUG, ORIGINE);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.avvisi.join(" ")).toContain(A.nome);

    // B usa L2; se usasse L1 non gli si direbbe che l'ha anche un altro cliente.
    await salvaConfigurazione(B.attore, SLUG, { configurazione: { sede: "L1" } });
    const pb = await provaConnessione(B.attore, SLUG, ORIGINE);
    if (pb.ok) expect(pb.avvisi.join(" ")).not.toContain(A.nome);
    await salvaConfigurazione(B.attore, SLUG, { configurazione: { sede: "L2" } });
    await provaConnessione(B.attore, SLUG, ORIGINE);
    await attiva(B.attore, SLUG, ORIGINE);
  });
});

describe("webhook", () => {
  async function manda(l: Locale, corpo: object, intestazione?: string) {
    const i = await installazione(l);
    return riceviWebhook({
      slug: SLUG,
      chiave: i.webhookKey,
      corpo: JSON.stringify(corpo),
      intestazioni: new Headers({ "x-prova": intestazione ?? `pw-${i.id}` }),
    });
  }

  it("un evento si lavora una volta, anche se arriva cinque volte insieme", async () => {
    const esiti = await Promise.all(Array.from({ length: 5 }, () => manda(A, { id: "ev-1", rif: "ORD-1", sede: "L1" })));
    expect(esiti.filter((e) => e.status === 200 && !("ripetuto" in e.corpo && e.corpo.ripetuto))).toHaveLength(1);
    expect(esiti.filter((e) => "ripetuto" in e.corpo && e.corpo.ripetuto)).toHaveLength(4);

    const i = await installazione(A);
    const righe = await db.webhookEvent.findMany({ where: { installationId: i.id, providerEventId: `${i.id}:ev-1` } });
    expect(righe).toHaveLength(1);
    expect(righe[0]!.status).toBe("PROCESSED");
    const ordine = await db.externalEntityMapping.findFirstOrThrow({ where: { installationId: i.id, entityType: "ORDER" } });
    expect(ordine.externalId).toBe("ORD-1");
  });

  it("lo stesso id evento da due locali diversi sono due eventi", async () => {
    const r = await manda(B, { id: "ev-1", rif: "ORD-B", sede: "L2" });
    expect(r.status).toBe(200);
    expect("ripetuto" in r.corpo && r.corpo.ripetuto).toBeFalsy();
  });

  it("senza la prova del fornitore: 401 e niente scritto", async () => {
    const r = await manda(A, { id: "ev-falso", rif: "X" }, "password-sbagliata");
    expect(r.status).toBe(401);
    expect(await db.webhookEvent.count({ where: { providerEventId: { endsWith: ":ev-falso" } } })).toBe(0);
  });

  it("con la password di B all'indirizzo di A: 401", async () => {
    const iB = await installazione(B);
    const r = await manda(A, { id: "ev-incrociato", rif: "X" }, `pw-${iB.id}`);
    expect(r.status).toBe(401);
  });

  it("a una chiave che non esiste, o allo slug sbagliato: 404", async () => {
    const i = await installazione(A);
    expect((await riceviWebhook({ slug: SLUG, chiave: "inesistente", corpo: "{}", intestazioni: new Headers() })).status).toBe(404);
    expect((await riceviWebhook({ slug: "lightspeed-k", chiave: i.webhookKey, corpo: "{}", intestazioni: new Headers() })).status).toBe(404);
  });

  it("un evento di un'altra sede si conserva e non si lavora", async () => {
    const r = await manda(A, { id: "ev-sede", rif: "ORD-X", sede: "L9" });
    expect(r.corpo).toMatchObject({ ignorato: "sede_diversa" });
    const i = await installazione(A);
    expect(await db.externalEntityMapping.count({ where: { installationId: i.id, externalId: "ORD-X" } })).toBe(0);
  });
});

describe("quando il fornitore non collabora", () => {
  it("fornitore giù durante una sincronizzazione: resta attiva, salute degradata, la coda riprova", async () => {
    const i = await installazione(A);
    stato.sync = "503";
    const e = await eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" });
    expect(e).toMatchObject({ eseguita: true, riuscita: false });
    const dopo = await installazione(A);
    expect(dopo.status).toBe("ACTIVE");
    expect(dopo.healthStatus).toBe("DEGRADED");
    expect(dopo.lastErrorCode).toBe("PROVIDER_UNAVAILABLE");

    const job = { id: "j", kind: "integration.sync", attempts: 1, maxAttempts: 4, yields: 0, venueId: A.venueId };
    await expect(
      lavoroSincronizzazione({ installationId: i.id, venueId: A.venueId, trigger: "MANUAL" }, job),
    ).rejects.toMatchObject({ codice: "PROVIDER_UNAVAILABLE" });

    const log = await db.integrationSyncLog.findFirstOrThrow({ where: { installationId: i.id }, orderBy: { startedAt: "desc" } });
    expect(log.trigger).toBe("MANUAL");
    expect(log.status).toBe("FAILED");
  });

  it("troppe richieste: si rimanda del tempo chiesto dal fornitore, e il tentativo dopo è un RETRY", async () => {
    const i = await installazione(A);
    stato.sync = "429";
    const job = { id: "j", kind: "integration.sync", attempts: 2, maxAttempts: 4, yields: 0, venueId: A.venueId };
    const r = await lavoroSincronizzazione({ installationId: i.id, venueId: A.venueId, trigger: "MANUAL" }, job);
    expect(r).toEqual({ again: true, delayMs: 30_000 });
    const log = await db.integrationSyncLog.findFirstOrThrow({ where: { installationId: i.id }, orderBy: { startedAt: "desc" } });
    expect(log.trigger).toBe("RETRY");
    expect(log.errorCode).toBe("RATE_LIMITED");
  });

  it("torna a funzionare: salute di nuovo sana", async () => {
    const i = await installazione(A);
    await eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" });
    expect((await installazione(A)).healthStatus).toBe("HEALTHY");
  });

  it("due rinnovi insieme con un token che vale una volta: nessuno dei due brucia l'accesso", async () => {
    const i = await installazione(A);
    await db.integrationCredential.update({
      where: { installationId: i.id },
      data: { accessTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    const prima = stato.rinnovi;
    const [c1, c2] = await Promise.all([contestoFresco(i, ORIGINE), contestoFresco(i, ORIGINE)]);
    // Uno solo chiama il fornitore; l'altro aspetta il suo token.
    expect(stato.rinnovi - prima).toBe(1);
    expect(c1.segreti.refresh).toBe(c2.segreti.refresh);
    const cred = await db.integrationCredential.findUniqueOrThrow({ where: { installationId: i.id } });
    expect(cred.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await installazione(A)).status).toBe("ACTIVE");
  });

  it("accesso scaduto e rinnovo rifiutato: «ricollega», non «riprova»", async () => {
    const i = await installazione(A);
    await db.integrationCredential.update({
      where: { installationId: i.id },
      data: { accessTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    stato.rinnovo = "morto";
    const e = await eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" });
    expect(e).toMatchObject({ eseguita: true, riuscita: false });
    const dopo = await installazione(A);
    expect(dopo.status).toBe("REAUTH_REQUIRED");
    expect(dopo.healthStatus).toBe("AUTH_REQUIRED");
    expect(dopo.healthMessage).toMatch(/Ricollega|non è più valido/);
    expect(dopo.healthMessage).not.toMatch(/invalid_grant|400/);

    // La coda non riprova un accesso scaduto: serve il ristoratore.
    const job = { id: "j", kind: "integration.sync", attempts: 1, maxAttempts: 4, yields: 0, venueId: A.venueId };
    expect(await lavoroSincronizzazione({ installationId: i.id, venueId: A.venueId, trigger: "MANUAL" }, job)).toEqual({
      done: true,
    });

    // Ricollegarsi rimette in piedi il percorso.
    stato.rinnovo = "ok";
    await connettiConCampi(A.attore, SLUG, { apiKey: "chiave-segreta-A" });
    expect((await installazione(A)).status).toBe("NEEDS_CONFIGURATION");
    await provaConnessione(A.attore, SLUG, ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
    expect((await installazione(A)).status).toBe("ACTIVE");
  });

  it("una prova che fallisce per l'accesso manda in «ricollega» con la frase giusta", async () => {
    stato.prova = "401";
    const p = await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(p).toMatchObject({ ok: false, titolo: "Connessione scaduta", azione: "ricollega" });
    expect((await installazione(A)).status).toBe("REAUTH_REQUIRED");
    // rimettiamo a posto
    stato.prova = "ok";
    await connettiConCampi(A.attore, SLUG, { apiKey: "chiave-segreta-A" });
    await provaConnessione(A.attore, SLUG, ORIGINE);
    await attiva(A.attore, SLUG, ORIGINE);
  });

  it("una chiave sbagliata non si salva", async () => {
    await expect(connettiConCampi(A2.attore, SLUG, { apiKey: "sbagliata" })).rejects.toMatchObject({
      code: "integration_auth_invalid",
    });
  });
});

describe("disattivare, disinstallare, reinstallare", () => {
  it("disattivata: niente sincronizzazioni, gli eventi si conservano e non si lavorano", async () => {
    await disattiva(A.attore, SLUG);
    const i = await installazione(A);
    expect(i.status).toBe("DISABLED");
    expect(
      await eseguiSincronizzazione({ installationId: i.id, venueId: A.venueId, operazione: "full", trigger: "MANUAL" }),
    ).toEqual({ eseguita: false, motivo: "non_attiva" });
    const r = await riceviWebhook({
      slug: SLUG,
      chiave: i.webhookKey,
      corpo: JSON.stringify({ id: "ev-spenta", rif: "ORD-S", sede: "L1" }),
      intestazioni: new Headers({ "x-prova": `pw-${i.id}` }),
    });
    expect(r.corpo).toMatchObject({ ignorato: "integrazione_disattivata" });
  });

  it("riattivare passa da una prova", async () => {
    stato.prova = "503";
    await expect(riattiva(A.attore, SLUG, ORIGINE)).rejects.toMatchObject({ code: "integration_provider_unavailable" });
    expect((await installazione(A)).status).toBe("DISABLED");
    stato.prova = "ok";
    await riattiva(A.attore, SLUG, ORIGINE);
    expect((await installazione(A)).status).toBe("ACTIVE");
  });

  it("disinstallare cancella credenziali e mappature, cambia l'indirizzo, e tiene il registro", async () => {
    const prima = await installazione(A);
    const logPrima = await db.integrationSyncLog.count({ where: { installationId: prima.id } });
    await disinstalla(A.attore, SLUG, ORIGINE);

    const dopo = await installazione(A);
    expect(dopo.status).toBe("NOT_INSTALLED");
    expect(dopo.webhookKey).not.toBe(prima.webhookKey);
    expect(dopo.configuration).toEqual({});
    expect(dopo.enabledCapabilities).toEqual([]);
    expect(await db.integrationCredential.count({ where: { installationId: prima.id } })).toBe(0);
    expect(await db.externalEntityMapping.count({ where: { installationId: prima.id } })).toBe(0);
    expect(await db.integrationSyncLog.count({ where: { installationId: prima.id } })).toBe(logPrima);

    // Il vecchio indirizzo dei webhook non vale più.
    const r = await riceviWebhook({ slug: SLUG, chiave: prima.webhookKey, corpo: "{}", intestazioni: new Headers() });
    expect(r.status).toBe(404);

    // L'installazione di B non ne risente.
    expect((await installazione(B)).status).toBe("ACTIVE");
  });

  it("reinstallare riparte da zero, sulla stessa riga", async () => {
    const prima = await installazione(A);
    const i = await installa(A.attore, SLUG);
    expect(i.id).toBe(prima.id);
    expect(i.status).toBe("INSTALLING");
    expect(await leggiSegreti(i)).toBeNull();
    await finoAdAttivaDaInstallata(A, "chiave-nuova-A");
    expect((await installazione(A)).status).toBe("ACTIVE");
  });
});

async function finoAdAttivaDaInstallata(l: Locale, chiave: string) {
  await connettiConCampi(l.attore, SLUG, { apiKey: chiave });
  await salvaConfigurazione(l.attore, SLUG, { configurazione: { sede: "L1" } });
  await provaConnessione(l.attore, SLUG, ORIGINE);
  await salvaCapacita(l.attore, SLUG, ["tables"], ORIGINE);
  await attiva(l.attore, SLUG, ORIGINE);
}
