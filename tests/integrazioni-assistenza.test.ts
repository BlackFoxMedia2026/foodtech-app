import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  connettiConCampi,
  disinstalla,
  installa,
  provaConnessione,
  trovaInstallazione,
  usaFetchPerProve,
  type Attore,
} from "@/server/integrations/installazioni";
import { impostaAccessoBeta } from "@/server/integrations/certificazione/accesso";
import { apriConsegna, chiediAssistenza, creaConsegna, impronta, revocaDelega, assistenzeAperte } from "@/server/integrations/assistenza";
import { attoreAdmin, eseguiAzioneAdmin } from "@/server/integrations/azioni-admin";
import { cercaLocali, schedaLocaleAdmin } from "@/server/integrations/vista-assistenza";
import { dettaglioCliente } from "@/server/integrations/vista-cliente";

/**
 * **L'assistenza Foodtech sulle integrazioni, contro il database vero.**
 *
 * Con WhatsApp Business e una Graph API finta (le risposte hanno la forma
 * della documentazione): l'unica integrazione di marketing che si collega
 * senza variabili della piattaforma, quindi percorre davvero tutto il
 * servizio — cifratura, stati, verifica.
 *
 * Che cosa fissano:
 * - senza delega l'assistenza **verifica** ma non configura; con la delega
 *   sì; revocata o scaduta, di nuovo no; mai su un altro locale;
 * - la scheda dell'assistenza non porta segreti, né l'indirizzo dei webhook,
 *   né i dati di un altro ristorante;
 * - il collegamento di consegna vale solo per i membri del locale, una volta,
 *   per un tempo; nel database c'è solo la sua impronta;
 * - «Verifica in corso» mentre la verifica gira, «Credenziali scadute»
 *   quando Meta rifiuta il token, e la disconnessione cancella le credenziali.
 */

const db = new PrismaClient();
const PREFISSO = "test-assist-";
const SLUG = "whatsapp-business";
const ORIGINE = "https://app.foodtech.test";
const WABA = { A: "100000000000001", B: "200000000000002" };
const NUMERO = { A: "110000000000001", B: "220000000000002" };

if (!/dev|test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Queste prove scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/* Meta finta: due account, due token. Un token revocato risponde 190. */
const meta = { revocati: new Set<string>(), durantePrendi: null as null | (() => Promise<void>) };
const TOKEN: Record<string, keyof typeof WABA> = { "tok-A": "A", "tok-B": "B" };

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const fetchFinto = (async (url: string, init: RequestInit = {}) => {
  const u = new URL(url);
  const h = (init.headers ?? {}) as Record<string, string>;
  const token = (h.Authorization ?? "").replace("Bearer ", "");
  const chi = TOKEN[token];
  if (!chi || meta.revocati.has(token)) return json(400, { error: { message: "Error validating access token", type: "OAuthException", code: 190 } });
  if (meta.durantePrendi) await meta.durantePrendi();
  const waba = WABA[chi];
  const numero = NUMERO[chi];
  if (u.pathname.endsWith(`/${waba}`)) return json(200, { id: waba, name: `Account ${chi}` });
  if (u.pathname.endsWith(`/${waba}/phone_numbers`)) {
    return json(200, { data: [{ id: numero, display_phone_number: `+39 000 ${chi}`, verified_name: `Locale ${chi}`, quality_rating: "GREEN", code_verification_status: "VERIFIED" }] });
  }
  if (u.pathname.endsWith(`/${numero}`)) return json(200, { id: numero, display_phone_number: `+39 000 ${chi}`, verified_name: `Locale ${chi}`, quality_rating: "GREEN", code_verification_status: "VERIFIED" });
  // Un account di un altro: Meta risponde come a un oggetto che non esiste per questo token.
  return json(400, { error: { message: "Unsupported get request", code: 100, error_subcode: 33 } });
}) as unknown as typeof fetch;

type Locale = { orgId: string; venueId: string; userId: string; attore: Attore; nome: string };
let A: Locale;
let B: Locale;
let EMAIL_ADMIN: string;
const envPrima = { chiave: process.env.CHIAVE_CIFRATURA };

async function creaLocale(nome: string): Promise<Locale> {
  const t = Date.now();
  const org = await db.organization.create({ data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${t}` } });
  const venue = await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}Locale ${nome}`, slug: `${PREFISSO}${nome}-${t}` } });
  const utente = await db.user.create({ data: { email: `${PREFISSO}${nome}-${t}@foodtech.test` } });
  await db.venueMembership.create({ data: { userId: utente.id, venueId: venue.id, role: "MANAGER" } });
  return { orgId: org.id, venueId: venue.id, userId: utente.id, nome: venue.name, attore: { venueId: venue.id, orgId: org.id, userId: utente.id } };
}

async function pulisci() {
  const orgs = await db.organization.findMany({ where: { name: { startsWith: PREFISSO } }, select: { id: true } });
  const venues = await db.venue.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { id: true } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  await db.auditLog.deleteMany({ where: { orgId: { in: orgs.map((o) => o.id) } } });
  await db.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
}

const admin = () => attoreAdmin(A.venueId, EMAIL_ADMIN);
const adminSu = (l: Locale) => attoreAdmin(l.venueId, EMAIL_ADMIN);
const codice = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "nessun errore";
};

/** Il cliente collega WhatsApp con il suo token, come nel wizard. */
async function collega(l: Locale, token: string, chi: keyof typeof WABA) {
  const i = await trovaInstallazione(l.venueId, SLUG);
  if (!i || i.status === "NOT_INSTALLED") await installa(l.attore, SLUG);
  await connettiConCampi(l.attore, SLUG, { tokenSistema: token, wabaId: WABA[chi] });
}

beforeAll(async () => {
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 9).toString("base64");
  usaFetchPerProve(fetchFinto);
  await pulisci();
  A = await creaLocale("a");
  B = await creaLocale("b");
  EMAIL_ADMIN = `${PREFISSO}admin-${Date.now()}@foodtech.test`;
  await db.user.create({ data: { email: EMAIL_ADMIN } });
  // L'anteprima si apre solo ad A: B resta senza beta.
  await impostaAccessoBeta({ venueId: A.venueId, slug: SLUG, abilitato: true, email: EMAIL_ADMIN });
});

afterAll(async () => {
  await pulisci();
  usaFetchPerProve(undefined);
  process.env.CHIAVE_CIFRATURA = envPrima.chiave;
  await db.$disconnect();
});

beforeEach(() => {
  meta.revocati.clear();
  meta.durantePrendi = null;
});

describe("la delega del cliente", () => {
  it("senza delega l'assistenza verifica davvero la connessione, ma non configura", async () => {
    await collega(A, "tok-A", "A");
    const a = await admin();
    const esito = (await eseguiAzioneAdmin(a, { azione: "prova", slug: SLUG }, ORIGINE)) as { ok: boolean; account: string | null };
    expect(esito).toMatchObject({ ok: true, account: "Account A" });
    expect(await codice(eseguiAzioneAdmin(a, { azione: "opzioni", slug: SLUG }, ORIGINE))).toBe("delegation_required");
    expect(await codice(eseguiAzioneAdmin(a, { azione: "configura", slug: SLUG, configurazione: { phoneNumberId: NUMERO.A } }, ORIGINE))).toBe(
      "delegation_required",
    );
    // La verifica dell'assistenza resta nel registro, con l'email di chi l'ha fatta.
    const r = await db.auditLog.findFirst({ where: { venueId: A.venueId, action: "integration.admin_action", actorEmail: EMAIL_ADMIN } });
    expect(r?.diff).toMatchObject({ azione: "prova", delega: false });
  });

  it("con la delega l'assistenza sceglie il numero, verifica e attiva: il cliente vede «Collegato»", async () => {
    await chiediAssistenza(A.attore, SLUG, { nota: "Non so dove si sceglie il numero", delega: true });
    const a = await admin();
    const o = (await eseguiAzioneAdmin(a, { azione: "opzioni", slug: SLUG }, ORIGINE)) as { opzioni: { locations: { value: string }[] } };
    expect(o.opzioni.locations.map((x) => x.value)).toEqual([NUMERO.A]);
    await eseguiAzioneAdmin(a, { azione: "configura", slug: SLUG, configurazione: { phoneNumberId: NUMERO.A }, etichette: { phoneNumberId: "Locale A" } }, ORIGINE);
    expect(((await eseguiAzioneAdmin(a, { azione: "prova", slug: SLUG }, ORIGINE)) as { ok: boolean }).ok).toBe(true);
    await eseguiAzioneAdmin(a, { azione: "gruppi", slug: SLUG, gruppi: ["profilo"] }, ORIGINE);
    await eseguiAzioneAdmin(a, { azione: "attiva", slug: SLUG }, ORIGINE);

    const d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d).toMatchObject({ stato: "COLLEGATO", anteprima: true });
    // Il nome del numero lo riscrive la verifica, con le parole di Meta.
    expect(d.installazione).toMatchObject({ sede: "Locale A · +39 000 A", ultimaVerificaOk: true });
    expect(d.installazione!.ultimaVerificaIl).not.toBeNull();
    expect(d.installazione!.funzionalita).toEqual([{ etichetta: "Controllare da Foodtech lo stato del profilo collegato", stato: "attiva" }]);
    expect(d.assistenza).toMatchObject({ aperta: true, nota: "Non so dove si sceglie il numero" });
    expect(d.assistenza!.delegaFinoAl).not.toBeNull();
    expect((await assistenzeAperte()).some((x) => x.venueId === A.venueId && x.slug === SLUG && x.delegaFinoAl)).toBe(true);
  });

  it("revocata o scaduta, la delega non vale più", async () => {
    const a = await admin();
    expect((await revocaDelega(A.attore, SLUG)).revocata).toBe(true);
    expect(await codice(eseguiAzioneAdmin(a, { azione: "sincronizza", slug: SLUG }, ORIGINE))).toBe("delegation_required");

    await chiediAssistenza(A.attore, SLUG, { delega: true });
    await db.integrationAssistance.updateMany({ where: { venueId: A.venueId, integrationSlug: SLUG }, data: { delegatedUntil: new Date(Date.now() - 1000) } });
    expect(await codice(eseguiAzioneAdmin(a, { azione: "disattiva", slug: SLUG }, ORIGINE))).toBe("delegation_required");
    expect((await dettaglioCliente(A.venueId, SLUG))!.assistenza?.delegaFinoAl ?? null).toBeNull();
  });

  it("la delega di A non vale su B, e l'assistenza non disconnette mai", async () => {
    await chiediAssistenza(A.attore, SLUG, { delega: true });
    const b = await adminSu(B);
    expect(await codice(eseguiAzioneAdmin(b, { azione: "installa", slug: SLUG }, ORIGINE))).toBe("delegation_required");
    const a = await admin();
    expect(await codice(eseguiAzioneAdmin(a, { azione: "disinstalla", slug: SLUG } as never, ORIGINE))).toBe("validation_failed");
    expect((await trovaInstallazione(A.venueId, SLUG))!.status).not.toBe("NOT_INSTALLED");
  });

  it("un amministratore senza utente Foodtech non agisce", async () => {
    expect(await codice(attoreAdmin(A.venueId, "nessuno@altrove.test"))).toBe("forbidden");
  });
});

describe("la scheda dell'assistenza", () => {
  it("niente segreti, niente indirizzo dei webhook, niente dati di un altro locale", async () => {
    await collega(B, "tok-B", "B").catch(() => undefined); // B non ha la beta: non si installa
    const s = (await schedaLocaleAdmin(A.venueId))!;
    const testo = JSON.stringify(s);
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    for (const vietato of ["tok-A", "tok-B", "secretCiphertext", i.webhookKey, B.venueId, B.nome]) {
      expect(testo, vietato).not.toContain(vietato);
    }
    const r = s.righe.find((x) => x.slug === SLUG)!;
    expect(r.installazione!.credenziali).toMatchObject({ tipo: "TOKEN" });
    expect(Object.keys(r.installazione!.credenziali!)).toEqual(["tipo", "permessi", "scadeAccesso", "scadeRinnovo", "ruotateIl", "versione"]);
    // B non ha la beta: la scheda lo dice, e senza beta non si prepara un collegamento.
    const sb = (await schedaLocaleAdmin(B.venueId))!.righe.find((x) => x.slug === SLUG)!;
    expect(sb).toMatchObject({ serveBeta: true, installazione: null });
  });

  it("la ricerca trova il locale per nome e per gruppo", async () => {
    expect((await cercaLocali(`${PREFISSO}Locale a`)).map((l) => l.venueId)).toEqual([A.venueId]);
    expect((await cercaLocali(`${PREFISSO}b`)).map((l) => l.venueId)).toContain(B.venueId);
  });
});

describe("il collegamento per le credenziali", () => {
  it("nel database solo l'impronta; vale per i membri del locale, una volta sola", async () => {
    const c = await creaConsegna({ venueId: A.venueId, slug: SLUG, email: EMAIL_ADMIN, origine: ORIGINE });
    const codiceLink = c.url.split("/").pop()!;
    expect(c.url).toBe(`${ORIGINE}/api/integrations/consegna/${codiceLink}`);
    const riga = (await db.integrationCredentialHandoff.findUnique({ where: { id: c.id } }))!;
    expect(riga.tokenHash).toBe(impronta(codiceLink));
    expect(JSON.stringify(riga)).not.toContain(codiceLink);

    expect(await apriConsegna(codiceLink, { userId: B.userId })).toEqual({ ok: false, motivo: "non_membro" });
    expect(await apriConsegna(codiceLink, { userId: A.userId })).toEqual({ ok: true, venueId: A.venueId, slug: SLUG });
    expect((await db.integrationCredentialHandoff.findUnique({ where: { id: c.id } }))!.openedById).toBe(A.userId);

    // Il cliente inserisce le credenziali nel wizard: il collegamento ha fatto il suo lavoro.
    await connettiConCampi(A.attore, SLUG, { tokenSistema: "tok-A", wabaId: WABA.A });
    expect((await db.integrationCredentialHandoff.findUnique({ where: { id: c.id } }))!.completedAt).not.toBeNull();
    expect(await apriConsegna(codiceLink, { userId: A.userId })).toEqual({ ok: false, motivo: "usato" });
  });

  it("uno nuovo spegne il vecchio; scaduto non apre; un codice inventato non apre", async () => {
    const vecchio = await creaConsegna({ venueId: A.venueId, slug: SLUG, email: EMAIL_ADMIN, origine: ORIGINE });
    const nuovo = await creaConsegna({ venueId: A.venueId, slug: SLUG, email: EMAIL_ADMIN, origine: ORIGINE });
    expect(await apriConsegna(vecchio.url.split("/").pop()!, { userId: A.userId })).toEqual({ ok: false, motivo: "revocato" });
    await db.integrationCredentialHandoff.update({ where: { id: nuovo.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await apriConsegna(nuovo.url.split("/").pop()!, { userId: A.userId })).toEqual({ ok: false, motivo: "scaduto" });
    expect(await apriConsegna("x".repeat(32), { userId: A.userId })).toEqual({ ok: false, motivo: "sconosciuto" });
    expect(await apriConsegna("../../etc", { userId: A.userId })).toEqual({ ok: false, motivo: "sconosciuto" });
  });

  it("verso un'anteprima non abilitata sul locale non si prepara: sarebbe un vicolo cieco", async () => {
    expect(await codice(creaConsegna({ venueId: B.venueId, slug: SLUG, email: EMAIL_ADMIN, origine: ORIGINE }))).toBe("integration_beta_required");
  });
});

describe("durate e controlli lato server", () => {
  it("la delega dura 7 giorni esatti, il collegamento 72 ore esatte", async () => {
    const t = new Date("2026-10-01T09:00:00Z");
    const r = await chiediAssistenza(A.attore, SLUG, { delega: true }, t);
    expect(r.delegatedUntil!.getTime() - t.getTime()).toBe(7 * 86_400_000);
    const c = await creaConsegna({ venueId: A.venueId, slug: SLUG, email: EMAIL_ADMIN, origine: ORIGINE }, t);
    expect(new Date(c.scadeIl).getTime() - t.getTime()).toBe(72 * 3_600_000);
  });

  it("creazione e apertura del collegamento restano nel registro di audit", async () => {
    const c = await creaConsegna({ venueId: A.venueId, slug: SLUG, email: EMAIL_ADMIN, origine: ORIGINE, audit: (await admin()).audit });
    await apriConsegna(c.url.split("/").pop()!, { userId: A.userId });
    const azioni = (await db.auditLog.findMany({ where: { venueId: A.venueId, action: { in: ["integration.handoff_created", "integration.handoff_opened"] } } })).map((r) => r.action);
    expect(azioni).toEqual(expect.arrayContaining(["integration.handoff_created", "integration.handoff_opened"]));
    // Il codice del collegamento non finisce nel registro.
    const tutto = JSON.stringify(await db.auditLog.findMany({ where: { venueId: A.venueId } }));
    expect(tutto).not.toContain(c.url.split("/").pop()!);
  });

  it("B non ha chiesto niente: nessuna azione di configurazione passa, qualunque sia", async () => {
    const b = await adminSu(B);
    for (const corpo of [
      { azione: "installa" as const, slug: SLUG },
      { azione: "opzioni" as const, slug: SLUG },
      { azione: "configura" as const, slug: SLUG, configurazione: { phoneNumberId: NUMERO.B } },
      { azione: "gruppi" as const, slug: SLUG, gruppi: ["profilo"] },
      { azione: "attiva" as const, slug: SLUG },
      { azione: "sincronizza" as const, slug: SLUG },
      { azione: "riattiva" as const, slug: SLUG },
      { azione: "disattiva" as const, slug: SLUG },
    ]) {
      expect(await codice(eseguiAzioneAdmin(b, corpo, ORIGINE)), corpo.azione).toBe("delegation_required");
    }
    expect(await trovaInstallazione(B.venueId, SLUG)).toBeNull();
  });
});

describe("gli stati che vede il cliente, dal vero", () => {
  it("«Verifica in corso» mentre Meta risponde; poi l'esito, con data e ora", async () => {
    let durante: string | null = null;
    meta.durantePrendi = async () => {
      meta.durantePrendi = null;
      durante = (await dettaglioCliente(A.venueId, SLUG))!.stato;
    };
    await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(durante).toBe("VERIFICA_IN_CORSO");
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    expect(i.testStartedAt).toBeNull();
    expect(i.lastTestAt).not.toBeNull();
  });

  it("Meta rifiuta il token: «Credenziali scadute», con il gesto «ricollega»", async () => {
    meta.revocati.add("tok-A");
    const e = await provaConnessione(A.attore, SLUG, ORIGINE);
    expect(e.ok).toBe(false);
    const d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d.stato).toBe("CREDENZIALI_SCADUTE");
    expect(d.installazione!.problema).toMatchObject({ titolo: "Token WhatsApp non più valido", azione: "ricollega" });
    expect(d.installazione!.ultimaVerificaOk).toBe(false);
  });

  it("disconnettere cancella le credenziali; il cliente può ricollegare", async () => {
    const i = (await trovaInstallazione(A.venueId, SLUG))!;
    await disinstalla(A.attore, SLUG, ORIGINE);
    expect(await db.integrationCredential.count({ where: { installationId: i.id } })).toBe(0);
    const d = (await dettaglioCliente(A.venueId, SLUG))!;
    expect(d).toMatchObject({ stato: "IN_ANTEPRIMA", azione: "COLLEGA", installazione: null });
  });
});
