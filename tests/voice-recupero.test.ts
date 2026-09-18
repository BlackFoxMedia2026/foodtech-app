import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  componiLicenza,
  testoDaFirmare,
  type ContenutoLicenza,
} from "@/lib/licenza-centralino";
import {
  chiudiChiamateAppese,
  registraEventoChiamata,
} from "@/server/chiamate";
import {
  GRAZIA_MINUTI,
  notificaChiamatePerse,
  spegniNotificaChiamata,
} from "@/server/voice/recupero";
import { apriRichiamata } from "@/server/voice/richiamate";

/**
 * Il recupero delle chiamate perse.
 *
 * Quello che conta qui non è che la notifica si scriva: è **quando non si
 * scrive**. Una campanella che segnala lavori già fatti si smette di aprire, e
 * allora non serve più nemmeno quando ha ragione.
 */

const db = new PrismaClient();
const PREFISSO = "test-recupero-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

const coppia = generateKeyPairSync("ed25519");
const PUBBLICA = coppia.publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

let venueId = "";
let ospiteId = "";

function licenza(venue: string): string {
  const contenuto: ContenutoLicenza = { v: 1, l: venue, n: "Prova" };
  const firma = sign(
    null,
    Buffer.from(testoDaFirmare(contenuto), "utf8"),
    coppia.privateKey,
  ).toString("base64url");
  return componiLicenza(contenuto, firma);
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  const v = await db.venue.create({
    data: {
      orgId: org.id,
      name: unico,
      slug: unico,
      timezone: "Europe/Rome",
      phoneLicenseActivatedAt: new Date(),
    },
  });
  venueId = v.id;
  await db.venue.update({
    where: { id: venueId },
    data: { phoneLicenseKey: licenza(venueId) },
  });
  const g = await db.guest.create({
    data: {
      venueId,
      firstName: "Marco",
      lastName: "Perso",
      phone: "+393471114455",
    },
  });
  ospiteId = g.id;
}, 60_000);

beforeEach(() => {
  process.env.CENTRALINO_CHIAVE_PUBBLICA = PUBBLICA;
});

afterEach(async () => {
  if (originale === undefined) delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
  else process.env.CENTRALINO_CHIAVE_PUBBLICA = originale;
  await db.notification.deleteMany({ where: { venueId } });
  await db.voiceCallback.deleteMany({ where: { venueId } });
  await db.phoneCallEvent.deleteMany({ where: { call: { venueId } } });
  await db.phoneCall.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

/** Una chiamata persa, arrivata `minuti` fa. */
async function persa(minuti: number, telefono = "+393471114455") {
  const quando = new Date(Date.now() - minuti * 60 * 1000);
  const r = await registraEventoChiamata(venueId, {
    externalId: `${PREFISSO}${Math.random()}`,
    phone: telefono,
    stato: "MISSED",
    quando,
  });
  /* `registraEventoChiamata` mette `startedAt` all'ora che le si passa, ma il
     primo evento di una chiamata vera è lo squillo: qui si parte già persa, e
     l'ora è quella. */
  await db.phoneCall.update({
    where: { id: r.id },
    data: { startedAt: quando, endedAt: quando },
  });
  return r.id;
}

function notifiche() {
  return db.notification.findMany({
    where: { venueId, kind: "MISSED_CALL" },
    select: { title: true, body: true, meta: true, readAt: true, link: true },
  });
}

describe("il recupero delle chiamate perse", () => {
  it("non dice niente nei primi minuti", async () => {
    await persa(2);
    const esito = await notificaChiamatePerse();
    /* Il caso che conta: persa alle 20:03 in pieno servizio e richiamata alle
       20:05. Una notifica per un lavoro già fatto vale meno di nessuna
       notifica, e tre di quelle insegnano a non aprire più la campanella. */
    expect(esito.notificate).toBe(0);
    expect(await notifiche()).toHaveLength(0);
  });

  it("dopo la grazia lo dice, col nome e l'ora", async () => {
    const id = await persa(GRAZIA_MINUTI + 5);
    const esito = await notificaChiamatePerse();
    expect(esito.notificate).toBe(1);

    const [n] = await notifiche();
    expect(n?.title).toContain("Marco Perso");
    expect(n?.title).toMatch(/alle \d{2}:\d{2}/);
    expect(n?.link).toBe("/telefono");
    expect((n?.meta as { callId?: string })?.callId).toBe(id);
  });

  it("un numero che non conosciamo lo dice diversamente", async () => {
    await persa(GRAZIA_MINUTI + 5, "+393479998877");
    await notificaChiamatePerse();
    const [n] = await notifiche();
    expect(n?.title).toContain("Chiamata senza risposta");
    expect(n?.body).toContain("+39 347 9998877");
  });

  it("non si ripete al giro dopo", async () => {
    await persa(GRAZIA_MINUTI + 5);
    await notificaChiamatePerse();
    /* Il giro passa ogni minuto: senza il controllo su quelle già scritte, la
       stessa chiamata comparirebbe quarantotto volte all'ora. */
    const secondo = await notificaChiamatePerse();
    expect(secondo.notificate).toBe(0);
    expect(await notifiche()).toHaveLength(1);
  });

  it("chi è già in coda da richiamare non si notifica", async () => {
    const id = await persa(GRAZIA_MINUTI + 5);
    await apriRichiamata(venueId, { callId: id });
    const esito = await notificaChiamatePerse();
    expect(esito.notificate).toBe(0);
  });

  it("troppo vecchia non si notifica: richiamare non ha più senso", async () => {
    await persa(60 * 60); // due giorni e mezzo
    const esito = await notificaChiamatePerse();
    expect(esito.notificate).toBe(0);
  });

  it("senza licenza valida il telefono non notifica niente", async () => {
    await persa(GRAZIA_MINUTI + 5);
    /* Non si guarda solo se la chiave c'è: si riverifica la firma. Un locale
       che ha smesso di pagare non deve continuare a ricevere le notifiche di
       una funzione che non ha più. */
    delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
    const esito = await notificaChiamatePerse();
    expect(esito.notificate).toBe(0);
  });

  it("la notifica si spegne quando qualcuno se ne occupa", async () => {
    const id = await persa(GRAZIA_MINUTI + 5);
    await notificaChiamatePerse();
    expect((await notifiche())[0]?.readAt).toBeNull();

    await apriRichiamata(venueId, { callId: id });
    /* Non cancellata: quella telefonata è successa, e l'ora resta leggibile.
       Solo non chiede più niente. */
    const dopo = await notifiche();
    expect(dopo).toHaveLength(1);
    expect(dopo[0]?.readAt).not.toBeNull();
  });

  it("spegnere una notifica che non c'è non è un errore", async () => {
    await expect(
      spegniNotificaChiamata(venueId, "chiamata-che-non-esiste"),
    ).resolves.toBeUndefined();
  });
});

describe("le chiamate che il centralino non ha mai chiuso", () => {
  it("dopo un'ora si chiudono, e si vede che non sono finite bene", async () => {
    const r = await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}appesa-${Math.random()}`,
      phone: "+393471114455",
      stato: "RINGING",
    });
    await db.phoneCall.update({
      where: { id: r.id },
      data: { startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    });

    const quante = await chiudiChiamateAppese();
    expect(quante).toBeGreaterThanOrEqual(1);

    const riga = await db.phoneCall.findUniqueOrThrow({
      where: { id: r.id },
      select: { status: true, outcome: true, endedAt: true },
    });
    /* `FAILED` e non un esito vuoto: questa chiamata non è finita, si è persa
       per strada — e nessuno potrà mai dire com'è andata. Lasciarla senza
       esito la metterebbe fra quelle da chiudere a mano. */
    expect(riga.status).toBe("ENDED");
    expect(riga.outcome).toBe("FAILED");
    expect(riga.endedAt).not.toBeNull();
  });

  it("una chiamata di adesso non si tocca", async () => {
    const r = await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}viva-${Math.random()}`,
      phone: "+393471114455",
      stato: "RINGING",
    });
    await chiudiChiamateAppese();
    const riga = await db.phoneCall.findUniqueOrThrow({
      where: { id: r.id },
      select: { status: true },
    });
    expect(riga.status).toBe("RINGING");
  });
});
