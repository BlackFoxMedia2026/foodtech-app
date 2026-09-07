import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  FINESTRA_ATTRIBUZIONE_GIORNI,
  getCampaignAttribution,
  listCampaignsWithResults,
} from "@/server/campaigns";
import { createBooking } from "@/server/bookings";

vi.mock("next/headers", () => ({
  headers: () => new Headers({ host: "prova.tavolo.local", "x-forwarded-proto": "https" }),
}));

/**
 * L'attribuzione: quante prenotazioni ha portato una campagna.
 *
 * È il numero che un ristoratore usa per decidere se rifare una campagna,
 * quindi le prove guardano soprattutto **cosa non deve contare**: le
 * prenotazioni arrivate mesi dopo, quelle disdette, e quelle attribuite a una
 * campagna che non è di quel locale — perché il valore arriva da un link, e
 * un link lo può modificare chiunque.
 */

const db = new PrismaClient();
const PREFISSO = "test-attr-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
const INVIO = new Date("2026-09-01T10:00:00.000Z");

async function campagna(nome: string, venue = venueId) {
  return db.campaign.create({
    data: { venueId: venue, name: `${PREFISSO}${nome}`, subject: "Ciao", body: "<p>ciao</p>", segment: {} },
  });
}

/** Segna la campagna come partita: l'istante d'invio è il primo messaggio. */
async function inviata(campaignId: string, quando = INVIO, venue = venueId) {
  await db.messageLog.create({
    data: {
      venueId: venue,
      campaignId,
      channel: "EMAIL",
      toAddress: `${PREFISSO}x@test.local`,
      status: "SENT",
      createdAt: quando,
    },
  });
  await db.campaign.update({ where: { id: campaignId }, data: { status: "SENT", sentCount: 1 } });
}

async function prenotazioneDa(campaignId: string | null, quando: Date, coperti = 2, venue = venueId) {
  return db.booking.create({
    data: {
      venueId: venue,
      campaignId,
      partySize: coperti,
      startsAt: new Date(quando.getTime() + 5 * 86_400_000),
      createdAt: quando,
      status: "CONFIRMED",
      source: "WIDGET",
    },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  venueId = (
    await db.venue.create({
      data: {
        orgId: org.id,
        name: `${PREFISSO}locale`,
        slug: `${PREFISSO}v${Date.now()}`,
        avgSpendCents: 5500,
      },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
}, 60_000);

afterEach(async () => {
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.messageLog.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.campaign.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("cosa conta", () => {
  it("una prenotazione nata dal link conta, con i suoi coperti e la stima in euro", async () => {
    const c = await campagna("autunno");
    await inviata(c.id);
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + 2 * 86_400_000), 4);
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + 5 * 86_400_000), 2);

    const resa = await getCampaignAttribution(venueId, c.id);
    expect(resa.bookings).toBe(2);
    expect(resa.covers).toBe(6);
    // Sei coperti per 55 euro: è una stima dichiarata, non un incasso.
    expect(resa.revenueCents).toBe(6 * 5500);
    expect(resa.sentAt?.toISOString()).toBe(INVIO.toISOString());
  });

  it("senza scontrino medio dichiarato non c'è nessuna cifra in euro", async () => {
    const c = await campagna("altrove", altroVenueId);
    await inviata(c.id, INVIO, altroVenueId);
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + 86_400_000), 3, altroVenueId);

    const resa = await getCampaignAttribution(altroVenueId, c.id);
    expect(resa.covers).toBe(3);
    // Meglio niente che una cifra inventata.
    expect(resa.revenueCents).toBeNull();
  });

  it("una campagna non ancora partita non ha meriti", async () => {
    const c = await campagna("bozza");
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + 86_400_000));
    const resa = await getCampaignAttribution(venueId, c.id);
    expect(resa.sentAt).toBeNull();
    expect(resa.bookings).toBe(0);
  });
});

describe("cosa NON conta", () => {
  it("una prenotazione arrivata mesi dopo non è merito della campagna", async () => {
    const c = await campagna("vecchia");
    await inviata(c.id);
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + (FINESTRA_ATTRIBUZIONE_GIORNI + 10) * 86_400_000));

    const resa = await getCampaignAttribution(venueId, c.id);
    expect(resa.bookings).toBe(0);
    // Ma non si nasconde: si dice che esistono e che non le contiamo.
    expect(resa.fuoriFinestra).toBe(1);
  });

  it("una prenotazione fatta prima dell'invio non conta", async () => {
    const c = await campagna("prima");
    await inviata(c.id);
    await prenotazioneDa(c.id, new Date(INVIO.getTime() - 3 * 86_400_000));
    const resa = await getCampaignAttribution(venueId, c.id);
    expect(resa.bookings).toBe(0);
  });

  it("una disdetta è arrivata dalla campagna ma non ha portato nessuno a tavola", async () => {
    const c = await campagna("disdetta");
    await inviata(c.id);
    const b = await prenotazioneDa(c.id, new Date(INVIO.getTime() + 86_400_000), 4);
    await db.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });

    const resa = await getCampaignAttribution(venueId, c.id);
    expect(resa.bookings).toBe(0);
    expect(resa.covers).toBe(0);
  });

  it("chi non si è presentato nemmeno", async () => {
    const c = await campagna("assente");
    await inviata(c.id);
    const b = await prenotazioneDa(c.id, new Date(INVIO.getTime() + 86_400_000), 4);
    await db.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW" } });
    expect((await getCampaignAttribution(venueId, c.id)).bookings).toBe(0);
  });

  it("le prenotazioni senza campagna non finiscono su nessuna campagna", async () => {
    const c = await campagna("pulita");
    await inviata(c.id);
    await prenotazioneDa(null, new Date(INVIO.getTime() + 86_400_000));
    expect((await getCampaignAttribution(venueId, c.id)).bookings).toBe(0);
  });

  it("la campagna di un altro locale non si legge da qui", async () => {
    const c = await campagna("altrui", altroVenueId);
    await inviata(c.id, INVIO, altroVenueId);
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + 86_400_000), 4, altroVenueId);

    // Chiesta col locale sbagliato: nessun invio trovato, nessun merito.
    const resa = await getCampaignAttribution(venueId, c.id);
    expect(resa.sentAt).toBeNull();
    expect(resa.bookings).toBe(0);
  });
});

describe("la creazione registra la campagna solo se le viene passata", () => {
  it("senza campagna la prenotazione nasce senza attribuzione", async () => {
    const b = await createBooking(venueId, {
      guest: { firstName: "Senza", email: `${PREFISSO}s@test.local`, phone: "+39 000" },
      partySize: 2,
      startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      source: "WIDGET",
    });
    expect(b.campaignId).toBeNull();
  });

  it("la campagna arriva dalle opzioni, non dal corpo della richiesta", async () => {
    const c = await campagna("verificata");
    // Anche se il corpo la contiene, `BookingInput` non la conosce: entra solo
    // da `BookingWriteOptions`, cioè da codice server dopo la verifica.
    const b = await createBooking(
      venueId,
      {
        guest: { firstName: "Con", email: `${PREFISSO}c@test.local`, phone: "+39 001" },
        partySize: 2,
        startsAt: new Date(Date.now() + 31 * 86_400_000).toISOString(),
        source: "WIDGET",
        campaignId: "inventata-dal-client",
      },
      { campaignId: c.id }
    );
    expect(b.campaignId).toBe(c.id);
  });
});

describe("l'elenco delle campagne", () => {
  it("porta il conteggio giusto per ognuna, con una lettura sola", async () => {
    const a = await campagna("prima-campagna");
    const b = await campagna("seconda-campagna");
    await inviata(a.id);
    await inviata(b.id);

    await prenotazioneDa(a.id, new Date(INVIO.getTime() + 86_400_000));
    await prenotazioneDa(a.id, new Date(INVIO.getTime() + 2 * 86_400_000));
    await prenotazioneDa(b.id, new Date(INVIO.getTime() + 3 * 86_400_000));
    // Fuori finestra: non deve contarsi da nessuna parte.
    await prenotazioneDa(b.id, new Date(INVIO.getTime() + (FINESTRA_ATTRIBUZIONE_GIORNI + 5) * 86_400_000));

    const elenco = await listCampaignsWithResults(venueId);
    expect(elenco.find((c) => c.id === a.id)?.attribuite).toBe(2);
    expect(elenco.find((c) => c.id === b.id)?.attribuite).toBe(1);
  });

  it("una campagna mai partita mostra zero, non un numero preso da altrove", async () => {
    const c = await campagna("bozza-elenco");
    await prenotazioneDa(c.id, new Date(INVIO.getTime() + 86_400_000));
    const elenco = await listCampaignsWithResults(venueId);
    expect(elenco.find((x) => x.id === c.id)?.attribuite).toBe(0);
  });
});

describe("lo stato di una campagna programmata", () => {
  it("passata l'ora non dice più «partirà»", async () => {
    const { statoCampagna } = await import("@/lib/campaign-status");
    const ora = new Date("2026-09-07T21:00:00Z");

    // Prima dell'ora: è in programma, e lo è davvero.
    const futura = statoCampagna("SCHEDULED", new Date("2026-09-08T10:00:00Z"), ora);
    expect(futura.label).toBe("Programmata");

    // Dopo: l'ordine di invio è stato dato, l'esito non ci torna indietro.
    // Prima restava «Programmata · partirà all'ora indicata» per sempre.
    const passata = statoCampagna("SCHEDULED", new Date("2026-09-06T10:00:00Z"), ora);
    expect(passata.label).toBe("Consegnata al fornitore");
    expect(passata.hint).toContain("pannello del fornitore");

    // Gli altri stati non li tocca, e senza data non deduce niente.
    expect(statoCampagna("SENT", null, ora).label).toBe("Inviata");
    expect(statoCampagna("SCHEDULED", null, ora).label).toBe("Programmata");
    expect(statoCampagna("DRAFT", new Date("2026-01-01T00:00:00Z"), ora).label).toBe("Bozza");
  });
});
