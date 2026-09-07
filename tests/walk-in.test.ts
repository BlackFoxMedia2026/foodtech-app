import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findTablesForWalkIn, seatWalkIn, countWalkInsToday } from "@/server/walk-in";
import { findFreeTables } from "@/server/table-search";

/**
 * Il walk-in è il gesto più frettoloso di una serata, ed è anche quello che
 * può fare più danni: accomodare due gruppi sullo stesso tavolo significa
 * mandarne via uno.
 *
 * Qui si verifica che passi dalle stesse regole di tutti gli altri canali, e
 * che «quali tavoli sono liberi» sia una sola risposta condivisa con la lista
 * d'attesa.
 */

const db = new PrismaClient();
const PREFISSO = "test-wi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let tavolo2 = "";
let tavolo6 = "";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
  });
  venueId = venue.id;
  const room = await db.room.create({ data: { venueId, name: "Sala" } });
  tavolo2 = (await db.table.create({ data: { venueId, roomId: room.id, label: "K2", seats: 2 } })).id;
  tavolo6 = (await db.table.create({ data: { venueId, roomId: room.id, label: "K6", seats: 6 } })).id;

  // Servizio continuato: così "adesso" cade sempre dentro un turno, a
  // qualunque ora girino i test.
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: { venueId, name: "Continuato", weekday, startMinute: 0, endMinute: 24 * 60 - 1, capacity: 40 },
    });
  }
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("tavoli liberi", () => {
  it("propone il più piccolo che basta, escludendo i troppo piccoli", async () => {
    const perDue = await findTablesForWalkIn(venueId, 2);
    expect(perDue.tables.map((t) => t.label)).toEqual(["K2", "K6"]);

    const perSei = await findTablesForWalkIn(venueId, 6);
    expect(perSei.tables.map((t) => t.label)).toEqual(["K6"]);
  });

  it("un gruppo più grande di ogni tavolo non trova niente", async () => {
    const esito = await findTablesForWalkIn(venueId, 20);
    expect(esito.tables).toHaveLength(0);
    // Prima qui si diceva `all_busy`, cioè «tutti i tavoli abbastanza grandi
    // sono occupati»: falso, di quella misura non ne esiste nemmeno uno. Sono
    // due situazioni con due rimedi diversi — aspettare, o unire i tavoli.
    expect(esito.reason).toBe("no_table_that_big");
  });

  it("la ricerca è la stessa che usa la lista d'attesa", async () => {
    // Stessa funzione, stesso risultato: se un giorno divergono, è un bug.
    const daWalkIn = await findTablesForWalkIn(venueId, 2);
    const diretta = await findFreeTables(venueId, { partySize: 2, startsAt: new Date() });
    expect(daWalkIn.tables.map((t) => t.label)).toEqual(diretta.tables.map((t) => t.label));
  });
});

describe("accomodare", () => {
  it("crea una prenotazione già seduta, senza scheda ospite se il nome non c'è", async () => {
    const booking = await seatWalkIn(venueId, { partySize: 2, tableId: tavolo2 });

    expect(booking.status).toBe("SEATED");
    expect(booking.source).toBe("WALK_IN");
    expect(booking.tableId).toBe(tavolo2);
    expect(booking.seatedAt).not.toBeNull();
    // Un «Tavolo 7, due persone» nel CRM è rumore: senza nome non si crea.
    expect(booking.guestId).toBeNull();

    await db.booking.delete({ where: { id: booking.id } });
  });

  it("con il nome crea e collega la scheda ospite", async () => {
    const booking = await seatWalkIn(venueId, {
      partySize: 2,
      tableId: tavolo2,
      guestName: "Giulia Ferri",
      phone: "+390001",
    });

    expect(booking.guest?.firstName).toBe("Giulia");
    expect(booking.guest?.lastName).toBe("Ferri");

    await db.booking.delete({ where: { id: booking.id } });
    await db.guest.deleteMany({ where: { id: booking.guestId! } });
  });

  it("rifiuta un tavolo già occupato, con il motivo in chiaro", async () => {
    const primo = await seatWalkIn(venueId, { partySize: 2, tableId: tavolo2 });

    await expect(seatWalkIn(venueId, { partySize: 2, tableId: tavolo2 })).rejects.toThrow();

    // E quel tavolo non compare più fra i liberi.
    const esito = await findTablesForWalkIn(venueId, 2);
    expect(esito.tables.map((t) => t.label)).not.toContain("K2");

    await db.booking.delete({ where: { id: primo.id } });
  });

  it("rifiuta più persone dei posti del tavolo", async () => {
    await expect(seatWalkIn(venueId, { partySize: 6, tableId: tavolo2 })).rejects.toThrow();
  });

  it("rifiuta un ingresso senza tavolo", async () => {
    await expect(seatWalkIn(venueId, { partySize: 2 })).rejects.toThrow();
    await expect(seatWalkIn(venueId, { partySize: 0, tableId: tavolo2 })).rejects.toThrow();
  });

  it("non accomoda su un tavolo di un altro ristorante", async () => {
    const org = await db.organization.create({
      data: { name: `${PREFISSO}altro`, slug: `${PREFISSO}altro-${Date.now()}` },
    });
    const altro = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    const suoTavolo = await db.table.create({ data: { venueId: altro.id, label: "X1", seats: 4 } });

    await expect(seatWalkIn(venueId, { partySize: 2, tableId: suoTavolo.id })).rejects.toThrow();
  });
});

describe("conteggio della serata", () => {
  it("conta i walk-in di oggi e ignora quelli annullati", async () => {
    const da = new Date();
    da.setHours(0, 0, 0, 0);
    const a = new Date();
    a.setHours(23, 59, 59, 999);

    const partenza = await countWalkInsToday(venueId, da, a);

    const uno = await seatWalkIn(venueId, { partySize: 2, tableId: tavolo2 });
    const due = await seatWalkIn(venueId, { partySize: 4, tableId: tavolo6 });
    expect(await countWalkInsToday(venueId, da, a)).toBe(partenza + 2);

    await db.booking.update({ where: { id: due.id }, data: { status: "CANCELLED" } });
    expect(await countWalkInsToday(venueId, da, a)).toBe(partenza + 1);

    await db.booking.deleteMany({ where: { id: { in: [uno.id, due.id] } } });
  });
});
