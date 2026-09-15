import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ricevi, traduciEvento } from "@/server/dem/eventi";
import { eleggibili, soppresso } from "@/server/dem/destinatari";

/**
 * Cosa succede quando gli esiti tornano indietro.
 *
 * Tre cose devono reggere, e sono quelle che rompono le statistiche quando non
 * reggono: **lo stesso evento due volte conta una volta**, un rimbalzo
 * definitivo toglie l'indirizzo dalle campagne future, e una segnalazione di
 * spam lo toglie subito e per sempre — ma **solo per quel locale**.
 */

const db = new PrismaClient();
const PREFISSO = "test-ev-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueA = "";
let venueB = "";
let campagnaA = "";

async function creaLocale(nome: string) {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}-${Math.random()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}-${Math.random()}` },
  });
  return venue.id;
}

async function creaDestinatario(opts: {
  venueId: string;
  campaignId: string;
  email: string;
  messageId: string;
  guestId?: string;
}) {
  return db.campaignRecipient.create({
    data: {
      campaignId: opts.campaignId,
      venueId: opts.venueId,
      email: opts.email,
      firstName: "Mario",
      status: "SENT",
      sentAt: new Date(),
      providerMessageId: opts.messageId,
      ...(opts.guestId && { guestId: opts.guestId }),
    },
  });
}

function eventoSes(tipo: string, messageId: string, extra: Record<string, unknown> = {}) {
  return {
    eventType: tipo,
    mail: { messageId, timestamp: "2026-09-15T10:00:00.000Z" },
    ...extra,
  };
}

beforeAll(async () => {
  venueA = await creaLocale("a");
  venueB = await creaLocale("b");
}, 60_000);

afterEach(async () => {
  await db.campaignEvent.deleteMany({ where: { venueId: { in: [venueA, venueB] } } });
  await db.campaignRecipient.deleteMany({ where: { venueId: { in: [venueA, venueB] } } });
  await db.campaign.deleteMany({ where: { venueId: { in: [venueA, venueB] } } });
  await db.demSuppression.deleteMany({ where: { venueId: { in: [venueA, venueB] } } });
  await db.consentLog.deleteMany({ where: { venueId: { in: [venueA, venueB] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueA, venueB] } } });
});

afterAll(async () => {
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function creaCampagna(venueId: string) {
  const c = await db.campaign.create({
    data: { venueId, name: `${PREFISSO}c`, subject: "Ciao", segment: {}, status: "SENT", sentCount: 1 },
  });
  return c.id;
}

describe("la traduzione", () => {
  it("riconosce un rimbalzo definitivo da uno temporaneo", () => {
    const permanente = traduciEvento(
      eventoSes("Bounce", "m1", { bounce: { bounceType: "Permanent", bounceSubType: "General" } }),
    );
    const temporaneo = traduciEvento(
      eventoSes("Bounce", "m2", { bounce: { bounceType: "Transient", bounceSubType: "MailboxFull" } }),
    );
    expect(permanente?.definitivo).toBe(true);
    expect(temporaneo?.definitivo).toBe(false);
  });

  it("scarta quello che non sa leggere invece di inventarselo", () => {
    expect(traduciEvento({ eventType: "QualcosaDiNuovo", mail: { messageId: "m" } })).toBeNull();
    expect(traduciEvento({ eventType: "Delivery" })).toBeNull();
    expect(traduciEvento(null)).toBeNull();
  });

  it("due aperture distinte hanno chiavi distinte, la stessa apertura no", () => {
    const a = traduciEvento(eventoSes("Open", "m1", { open: { timestamp: "2026-09-15T10:00:00.000Z" } }));
    const b = traduciEvento(eventoSes("Open", "m1", { open: { timestamp: "2026-09-15T10:00:00.000Z" } }));
    const c = traduciEvento(eventoSes("Open", "m1", { open: { timestamp: "2026-09-15T11:30:00.000Z" } }));
    expect(a?.chiave).toBe(b?.chiave);
    expect(a?.chiave).not.toBe(c?.chiave);
  });
});

describe("lo stesso evento consegnato due volte", () => {
  it("conta una volta sola", async () => {
    campagnaA = await creaCampagna(venueA);
    await creaDestinatario({ venueId: venueA, campaignId: campagnaA, email: `${PREFISSO}uno@test.local`, messageId: "msg-1" });

    const evento = eventoSes("Delivery", "msg-1", { delivery: { timestamp: "2026-09-15T10:05:00.000Z" } });

    expect(await ricevi([evento])).toBe(1);
    // Riconsegnato: chi spedisce promette «almeno una volta», non «una volta».
    expect(await ricevi([evento])).toBe(0);
    expect(await ricevi([evento])).toBe(0);

    const campagna = await db.campaign.findUniqueOrThrow({ where: { id: campagnaA } });
    expect(campagna.deliveredCount).toBe(1);
    expect(await db.campaignEvent.count({ where: { campaignId: campagnaA } })).toBe(1);
  });

  it("l'apertura conta la persona una volta, anche se apre tre volte", async () => {
    campagnaA = await creaCampagna(venueA);
    const dest = await creaDestinatario({
      venueId: venueA,
      campaignId: campagnaA,
      email: `${PREFISSO}due@test.local`,
      messageId: "msg-2",
    });

    await ricevi([
      eventoSes("Open", "msg-2", { open: { timestamp: "2026-09-15T10:00:00.000Z" } }),
      eventoSes("Open", "msg-2", { open: { timestamp: "2026-09-15T12:00:00.000Z" } }),
      eventoSes("Open", "msg-2", { open: { timestamp: "2026-09-16T09:00:00.000Z" } }),
    ]);

    const campagna = await db.campaign.findUniqueOrThrow({ where: { id: campagnaA } });
    // La pagina dei risultati dice «quante persone l'hanno aperta».
    expect(campagna.openedCount).toBe(1);
    // Il conteggio per persona resta, per le metriche che lo vogliono.
    const aggiornato = await db.campaignRecipient.findUniqueOrThrow({ where: { id: dest.id } });
    expect(aggiornato.openCount).toBe(3);
    expect(aggiornato.openedAt?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });
});

describe("rimbalzi", () => {
  it("un rimbalzo definitivo sopprime l'indirizzo", async () => {
    campagnaA = await creaCampagna(venueA);
    await creaDestinatario({ venueId: venueA, campaignId: campagnaA, email: `${PREFISSO}morto@test.local`, messageId: "msg-3" });

    await ricevi([
      eventoSes("Bounce", "msg-3", {
        bounce: { bounceType: "Permanent", bounceSubType: "General", timestamp: "2026-09-15T10:01:00.000Z" },
      }),
    ]);

    expect(await soppresso(venueA, `${PREFISSO}morto@test.local`)).toBe(true);
    const campagna = await db.campaign.findUniqueOrThrow({ where: { id: campagnaA } });
    expect(campagna.bouncedCount).toBe(1);
  });

  it("un rimbalzo temporaneo si registra e non blocca nessuno", async () => {
    campagnaA = await creaCampagna(venueA);
    await creaDestinatario({ venueId: venueA, campaignId: campagnaA, email: `${PREFISSO}piena@test.local`, messageId: "msg-4" });

    await ricevi([
      eventoSes("Bounce", "msg-4", {
        bounce: { bounceType: "Transient", bounceSubType: "MailboxFull", timestamp: "2026-09-15T10:01:00.000Z" },
      }),
    ]);

    // Una casella piena un martedì non è un cliente da perdere per sempre.
    expect(await soppresso(venueA, `${PREFISSO}piena@test.local`)).toBe(false);
    expect(await db.campaignEvent.count({ where: { campaignId: campagnaA, type: "BOUNCE" } })).toBe(1);
  });
});

describe("segnalazioni di spam", () => {
  it("tolgono il consenso, sopprimono l'indirizzo e restano nel registro", async () => {
    const guest = await db.guest.create({
      data: { venueId: venueA, firstName: "Mario", email: `${PREFISSO}spam@test.local`, marketingOptIn: true },
    });
    campagnaA = await creaCampagna(venueA);
    await creaDestinatario({
      venueId: venueA,
      campaignId: campagnaA,
      email: `${PREFISSO}spam@test.local`,
      messageId: "msg-5",
      guestId: guest.id,
    });

    await ricevi([
      eventoSes("Complaint", "msg-5", {
        complaint: { complaintFeedbackType: "abuse", timestamp: "2026-09-15T10:02:00.000Z" },
      }),
    ]);

    expect(await soppresso(venueA, `${PREFISSO}spam@test.local`)).toBe(true);
    const dopo = await db.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(dopo.marketingOptIn).toBe(false);
    expect(dopo.unsubscribedAt).not.toBeNull();
    // La scheda cliente resta: chi ha segnalato lo spam è ancora un cliente.
    expect(dopo.firstName).toBe("Mario");
    // E resta la prova di quando e perché il consenso è caduto.
    expect(await db.consentLog.count({ where: { guestId: guest.id, granted: false } })).toBe(1);
  });
});

describe("isolamento fra locali", () => {
  it("un indirizzo soppresso per un locale resta scrivibile per un altro", async () => {
    campagnaA = await creaCampagna(venueA);
    const indirizzo = `${PREFISSO}condiviso@test.local`;
    await creaDestinatario({ venueId: venueA, campaignId: campagnaA, email: indirizzo, messageId: "msg-6" });

    await ricevi([
      eventoSes("Complaint", "msg-6", { complaint: { complaintFeedbackType: "abuse" } }),
    ]);

    expect(await soppresso(venueA, indirizzo)).toBe(true);
    // Il Cliente B non deve pagare la lista sporca del Cliente A.
    expect(await soppresso(venueB, indirizzo)).toBe(false);

    const candidato = [{ id: "g1", email: indirizzo, marketingOptIn: true }];
    expect((await eleggibili(venueA, candidato)).destinatari).toHaveLength(0);
    expect((await eleggibili(venueB, candidato)).destinatari).toHaveLength(1);
  });

  it("un evento per un messaggio che non è nostro non tocca niente", async () => {
    campagnaA = await creaCampagna(venueA);
    const nuovi = await ricevi([eventoSes("Delivery", "messaggio-di-nessuno")]);
    expect(nuovi).toBe(0);
    expect(await db.campaignEvent.count({ where: { venueId: venueA } })).toBe(0);
  });
});

describe("disiscrizione con un clic", () => {
  it("sopprime l'indirizzo e toglie il consenso, senza cancellare il cliente", async () => {
    const guest = await db.guest.create({
      data: { venueId: venueA, firstName: "Lucia", email: `${PREFISSO}basta@test.local`, marketingOptIn: true },
    });
    campagnaA = await creaCampagna(venueA);
    await creaDestinatario({
      venueId: venueA,
      campaignId: campagnaA,
      email: `${PREFISSO}basta@test.local`,
      messageId: "msg-7",
      guestId: guest.id,
    });

    await ricevi([eventoSes("Subscription", "msg-7")]);

    expect(await soppresso(venueA, `${PREFISSO}basta@test.local`)).toBe(true);
    const dopo = await db.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(dopo.marketingOptIn).toBe(false);
    expect(await db.guest.count({ where: { id: guest.id } })).toBe(1);
    const campagna = await db.campaign.findUniqueOrThrow({ where: { id: campagnaA } });
    expect(campagna.unsubscribedCount).toBe(1);
  });
});
