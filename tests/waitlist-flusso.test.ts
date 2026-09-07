import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  addToWaitlist,
  closeWaitlistEntry,
  confirmWaitlistEntry,
  expireStaleOffers,
  findTablesForEntry,
  listWaitlist,
  notifyWaitlistEntry,
  seatWaitlistEntry,
  suggestEntriesForTable,
  waitlistSummary,
  WaitlistError,
} from "@/server/waitlist";

/**
 * Il flusso della lista d'attesa contro un database vero.
 *
 * Verifica soprattutto le due promesse che rendono la funzione utile invece
 * che decorativa: **i tavoli proposti sono davvero liberi** (glielo chiede il
 * motore di disponibilità, non una regola scritta a parte) e **accomodare crea
 * una prenotazione vera**, con lo stesso controllo che vale per ogni altro
 * canale.
 */

const db = new PrismaClient();
const PREFISSO = "test-wl-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let tavolo2: string;
let tavolo6: string;

/** Un orario dentro il turno di cena, per non dipendere dall'ora in cui girano i test. */
function cena(offsetGiorni = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetGiorni);
  d.setHours(20, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
  });
  venueId = venue.id;

  const room = await db.room.create({ data: { venueId, name: "Sala" } });
  const t2 = await db.table.create({ data: { venueId, roomId: room.id, label: "W2", seats: 2 } });
  const t6 = await db.table.create({ data: { venueId, roomId: room.id, label: "W6", seats: 6 } });
  tavolo2 = t2.id;
  tavolo6 = t6.id;

  // Turno di cena tutti i giorni: senza turni il locale non avrebbe vincoli
  // di orario e il test non proverebbe la condizione "locale chiuso".
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: { venueId, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 40 },
    });
  }
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("entrare in coda", () => {
  it("chi arriva prima sta prima", async () => {
    const primo = await addToWaitlist(venueId, { guestName: "Primo", partySize: 2 });
    const secondo = await addToWaitlist(venueId, { guestName: "Secondo", partySize: 2 });
    expect(secondo.position).toBeGreaterThan(primo.position);

    const coda = await listWaitlist(venueId);
    expect(coda.map((e) => e.guestName)).toEqual(["Primo", "Secondo"]);

    await closeWaitlistEntry(venueId, primo.id, "LEFT");
    await closeWaitlistEntry(venueId, secondo.id, "LEFT");
  });

  it("rifiuta un ingresso senza nome", async () => {
    await expect(addToWaitlist(venueId, { guestName: "", partySize: 2 })).rejects.toThrow();
  });

  it("il riassunto conta persone, non righe", async () => {
    const a = await addToWaitlist(venueId, { guestName: "Coppia", partySize: 2 });
    const b = await addToWaitlist(venueId, { guestName: "Tavolata", partySize: 6 });
    const s = await waitlistSummary(venueId);
    expect(s.inAttesa).toBe(2);
    expect(s.personeInCoda).toBe(8);
    await closeWaitlistEntry(venueId, a.id, "LEFT");
    await closeWaitlistEntry(venueId, b.id, "LEFT");
  });
});

describe("tavoli proposti", () => {
  it("fuori dal servizio dice che il locale è chiuso, invece di 'nessun tavolo'", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Mattiniero", partySize: 2 });
    const mattina = new Date();
    mattina.setHours(10, 0, 0, 0);

    const esito = await findTablesForEntry(venueId, entry.id, { now: mattina });
    expect(esito.tables).toHaveLength(0);
    expect(esito.reason).toBe("venue_closed");

    await closeWaitlistEntry(venueId, entry.id, "LEFT");
  });

  it("propone il tavolo più piccolo che basta, non il primo che trova", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Coppia", partySize: 2 });
    const esito = await findTablesForEntry(venueId, entry.id, { now: cena() });

    expect(esito.reason).toBeNull();
    expect(esito.tables.map((t) => t.label)).toEqual(["W2", "W6"]);

    await closeWaitlistEntry(venueId, entry.id, "LEFT");
  });

  it("non propone tavoli troppo piccoli", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Tavolata", partySize: 6 });
    const esito = await findTablesForEntry(venueId, entry.id, { now: cena() });
    expect(esito.tables.map((t) => t.label)).toEqual(["W6"]);
    await closeWaitlistEntry(venueId, entry.id, "LEFT");
  });
});

describe("accomodare", () => {
  it("crea una prenotazione vera e chiude la riga in coda", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Mario Rossi", partySize: 2, phone: "+390000" });
    const { entry: dopo, booking } = await seatWaitlistEntry(venueId, entry.id, {
      tableId: tavolo2,
      startsAt: cena(1),
    });

    expect(dopo.status).toBe("SEATED");
    expect(dopo.convertedBookingId).toBe(booking.id);
    expect(booking.tableId).toBe(tavolo2);
    expect(booking.partySize).toBe(2);
    expect(booking.source).toBe("WALK_IN");
    expect(booking.status).toBe("SEATED");

    // L'ospite è stato creato e collegato alla prenotazione.
    expect(booking.guest?.firstName).toBe("Mario");
    expect(booking.guest?.lastName).toBe("Rossi");

    // Ed è uscito dalla coda.
    const coda = await listWaitlist(venueId);
    expect(coda.find((e) => e.id === entry.id)).toBeUndefined();

    await db.booking.delete({ where: { id: booking.id } });
  });

  it("non accomoda due volte la stessa persona", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Bis", partySize: 2 });
    const { booking } = await seatWaitlistEntry(venueId, entry.id, { tableId: tavolo2, startsAt: cena(2) });

    await expect(
      seatWaitlistEntry(venueId, entry.id, { tableId: tavolo6, startsAt: cena(2) }),
    ).rejects.toThrow(WaitlistError);

    await db.booking.delete({ where: { id: booking.id } });
  });

  it("rifiuta un tavolo già occupato, con il motivo del motore di disponibilità", async () => {
    const quando = cena(3);
    const primo = await addToWaitlist(venueId, { guestName: "Occupa", partySize: 2 });
    const { booking } = await seatWaitlistEntry(venueId, primo.id, { tableId: tavolo2, startsAt: quando });

    const secondo = await addToWaitlist(venueId, { guestName: "Sovrappone", partySize: 2 });
    await expect(
      seatWaitlistEntry(venueId, secondo.id, { tableId: tavolo2, startsAt: quando }),
    ).rejects.toThrow();

    // E il tavolo non compare più fra i proponibili a quell'ora.
    const esito = await findTablesForEntry(venueId, secondo.id, { now: quando });
    expect(esito.tables.map((t) => t.label)).not.toContain("W2");

    await closeWaitlistEntry(venueId, secondo.id, "LEFT");
    await db.booking.delete({ where: { id: booking.id } });
  });
});

describe("offerta e scadenza", () => {
  it("avvisare genera un token e una scadenza", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Avvisato", partySize: 2 });
    const dopo = await notifyWaitlistEntry(venueId, entry.id, { via: "telefono" });

    expect(dopo.status).toBe("NOTIFIED");
    expect(dopo.offerToken).toBeTruthy();
    expect(dopo.offerExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(dopo.offerSentVia).toBe("telefono");

    await closeWaitlistEntry(venueId, entry.id, "LEFT");
  });

  it("l'offerta scaduta viene chiusa, e il posto torna agli altri", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Scaduto", partySize: 2 });
    await notifyWaitlistEntry(venueId, entry.id, { ttlMin: -1 });

    const chiuse = await expireStaleOffers(venueId);
    expect(chiuse).toBeGreaterThanOrEqual(1);

    const riletto = await db.waitlistEntry.findUnique({ where: { id: entry.id } });
    expect(riletto?.status).toBe("EXPIRED");
    expect(riletto?.offerToken).toBeNull();
  });

  it("confermare richiede un avviso prima", async () => {
    const entry = await addToWaitlist(venueId, { guestName: "Frettoloso", partySize: 2 });
    await expect(confirmWaitlistEntry(venueId, entry.id)).rejects.toThrow(WaitlistError);
    await closeWaitlistEntry(venueId, entry.id, "LEFT");
  });
});

describe("si è liberato un tavolo: chi ci sta?", () => {
  it("propone solo chi ci sta davvero, in ordine di coda", async () => {
    const coppia = await addToWaitlist(venueId, { guestName: "Coppia", partySize: 2 });
    const tavolata = await addToWaitlist(venueId, { guestName: "Tavolata", partySize: 6 });

    const perIlPiccolo = await suggestEntriesForTable(venueId, tavolo2, { now: cena(4) });
    expect(perIlPiccolo.map((e) => e.guestName)).toEqual(["Coppia"]);

    const perIlGrande = await suggestEntriesForTable(venueId, tavolo6, { now: cena(4) });
    expect(perIlGrande.map((e) => e.guestName)).toEqual(["Coppia", "Tavolata"]);

    await closeWaitlistEntry(venueId, coppia.id, "LEFT");
    await closeWaitlistEntry(venueId, tavolata.id, "LEFT");
  });

  it("un tavolo che non esiste non propone nessuno", async () => {
    await expect(suggestEntriesForTable(venueId, "non-esiste")).rejects.toThrow(WaitlistError);
  });
});

describe("isolamento fra locali", () => {
  it("non si tocca la coda di un altro ristorante", async () => {
    const org = await db.organization.create({
      data: { name: `${PREFISSO}altro`, slug: `${PREFISSO}altro-${Date.now()}` },
    });
    const altro = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    const suo = await addToWaitlist(altro.id, { guestName: "Loro", partySize: 2 });

    await expect(notifyWaitlistEntry(venueId, suo.id)).rejects.toThrow("non è più in lista");
    await expect(closeWaitlistEntry(venueId, suo.id, "CANCELLED")).rejects.toThrow();
    await expect(seatWaitlistEntry(venueId, suo.id, { tableId: tavolo2 })).rejects.toThrow();

    const riletto = await db.waitlistEntry.findUnique({ where: { id: suo.id } });
    expect(riletto?.status).toBe("WAITING");
  });
});
