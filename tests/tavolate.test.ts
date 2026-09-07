import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  BookingAssignError,
  assignBookingToTable,
  combineTablesForBooking,
  splitTablesForBooking,
} from "@/server/booking-floor";

/**
 * Unire e dividere i tavoli.
 *
 * `combinedTableIds` esisteva già e tutta l'applicazione lo rispettava — la
 * sala mostra la tavolata su ogni tavolo che occupa, la disponibilità non li
 * offre ad altri — ma **crearla si poteva solo dal database**.
 *
 * Le prove guardano soprattutto i modi di sbagliare che costano una serata:
 * dare a due gruppi lo stesso tavolo, dimenticare un tavolo attaccato a una
 * prenotazione spostata altrove, o accorpare mezza sala per undici persone
 * senza che nessuno se ne accorga.
 */

const db = new PrismaClient();
const PREFISSO = "test-tav-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
let salaId = "";
let altraSalaId = "";
/** Tre tavoli da quattro nella sala principale, uno da due non unibile. */
let t1 = "";
let t2 = "";
let t3 = "";
let fisso = "";
/** Un tavolo in un'altra sala. */
let altrove = "";

const ORA = new Date("2026-09-10T19:00:00.000Z");

async function prenotazione(coperti: number, quando = ORA, venue = venueId) {
  return db.booking.create({
    data: { venueId: venue, partySize: coperti, startsAt: quando, durationMin: 105, status: "CONFIRMED", source: "PHONE" },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  orgId = org.id;
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
  altroVenueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` } })
  ).id;

  salaId = (await db.room.create({ data: { venueId, name: `${PREFISSO}principale` } })).id;
  altraSalaId = (await db.room.create({ data: { venueId, name: `${PREFISSO}dehors` } })).id;

  const crea = async (label: string, seats: number, roomId: string, combinable = true) =>
    (await db.table.create({ data: { venueId, roomId, label: `${PREFISSO}${label}`, seats, combinable } })).id;

  t1 = await crea("1", 4, salaId);
  t2 = await crea("2", 4, salaId);
  t3 = await crea("3", 4, salaId);
  fisso = await crea("separe", 2, salaId, false);
  altrove = await crea("D1", 4, altraSalaId);
}, 60_000);

/** Chi compie l'azione: senza attore il registro non scrive niente, per scelta. */
const attore = () => ({ userId: "u1", email: "prova@test.local", orgId, venueId, ip: null, userAgent: null });

beforeEach(async () => {
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("unire", () => {
  it("il primo tavolo è quello principale, gli altri gli accostati", async () => {
    const b = await prenotazione(8);
    const dopo = await combineTablesForBooking(venueId, b.id, [t1, t2]);
    expect(dopo.tableId).toBe(t1);
    expect(dopo.combinedTableIds).toEqual([t2]);
  });

  it("con un tavolo solo non si unisce niente: c'è l'assegnazione normale", async () => {
    const b = await prenotazione(4);
    await expect(combineTablesForBooking(venueId, b.id, [t1])).rejects.toThrow("needs_two_tables");
  });

  it("un tavolo ripetuto non conta due volte", async () => {
    const b = await prenotazione(8);
    // Due tocchi sullo stesso tavolo non fanno una tavolata da otto posti.
    await expect(combineTablesForBooking(venueId, b.id, [t1, t1])).rejects.toThrow("needs_two_tables");
  });

  it("una tavolata sta in una sala sola", async () => {
    const b = await prenotazione(8);
    await expect(combineTablesForBooking(venueId, b.id, [t1, altrove])).rejects.toThrow("different_rooms");
  });

  it("un tavolo dichiarato non unibile resta fuori", async () => {
    const b = await prenotazione(6);
    // `Table.combinable` esisteva nello schema e non lo leggeva nessuno.
    await expect(combineTablesForBooking(venueId, b.id, [t1, fisso])).rejects.toThrow("not_combinable");
  });

  it("i tavoli di un altro locale non esistono da qui", async () => {
    const b = await prenotazione(8);
    const suo = await db.table.create({
      data: { venueId: altroVenueId, label: `${PREFISSO}altrui`, seats: 4 },
    });
    await expect(combineTablesForBooking(venueId, b.id, [t1, suo.id])).rejects.toThrow("table_not_found");
  });
});

describe("i posti devono bastare, o serve un motivo", () => {
  it("se non bastano, si rifiuta", async () => {
    const b = await prenotazione(11);
    await expect(combineTablesForBooking(venueId, b.id, [t1, t2])).rejects.toThrow("capacity_mismatch");
  });

  it("forzare senza scrivere il motivo non basta", async () => {
    const b = await prenotazione(11);
    await expect(
      combineTablesForBooking(venueId, b.id, [t1, t2], { force: true }),
    ).rejects.toThrow("reason_required");
    await expect(
      combineTablesForBooking(venueId, b.id, [t1, t2], { force: true, forceReason: "   " }),
    ).rejects.toThrow("reason_required");
  });

  it("col motivo si può, e il motivo finisce nel registro", async () => {
    const b = await prenotazione(11);
    const dopo = await combineTablesForBooking(venueId, b.id, [t1, t2], {
      force: true,
      forceReason: "si accontentano, restano poco",
      actor: attore(),
    });
    expect(dopo.combinedTableIds).toEqual([t2]);

    const riga = await db.auditLog.findFirst({
      where: { entityId: b.id, action: "booking.combine_tables_forced" },
      orderBy: { createdAt: "desc" },
    });
    expect(riga).not.toBeNull();
    expect(JSON.stringify(riga?.diff)).toContain("si accontentano");
  });
});

describe("nessun tavolo a due gruppi", () => {
  it("un tavolo già assegnato a un'altra prenotazione non si unisce", async () => {
    const altra = await prenotazione(4);
    await assignBookingToTable(venueId, altra.id, t2);

    const b = await prenotazione(8);
    await expect(combineTablesForBooking(venueId, b.id, [t1, t2])).rejects.toThrow("table_conflict");
  });

  it("un tavolo occupato come ACCOSTATO di un'altra tavolata non si riassegna", async () => {
    // È il difetto che c'era: la verifica guardava solo `tableId`, quindi il
    // secondo tavolo di una tavolata risultava libero e si poteva dare a
    // qualcun altro. Il motore di disponibilità lo sapeva, questa strada no.
    const tavolata = await prenotazione(8);
    await combineTablesForBooking(venueId, tavolata.id, [t1, t2]);

    const b = await prenotazione(4);
    await expect(assignBookingToTable(venueId, b.id, t2)).rejects.toThrow("table_conflict");
  });

  it("e non si unisce nemmeno dentro un'altra tavolata", async () => {
    const tavolata = await prenotazione(8);
    await combineTablesForBooking(venueId, tavolata.id, [t1, t2]);

    const b = await prenotazione(8);
    await expect(combineTablesForBooking(venueId, b.id, [t2, t3])).rejects.toThrow("table_conflict");
  });

  it("a un'ora che non si sovrappone invece si può", async () => {
    const prima = await prenotazione(8, new Date("2026-09-10T12:00:00.000Z"));
    await combineTablesForBooking(venueId, prima.id, [t1, t2]);

    const dopo = await prenotazione(8, new Date("2026-09-10T20:00:00.000Z"));
    const esito = await combineTablesForBooking(venueId, dopo.id, [t1, t2]);
    expect(esito.combinedTableIds).toEqual([t2]);
  });
});

describe("dividere", () => {
  it("resta il tavolo principale, gli altri tornano liberi", async () => {
    const b = await prenotazione(8);
    await combineTablesForBooking(venueId, b.id, [t1, t2]);

    const dopo = await splitTablesForBooking(venueId, b.id);
    expect(dopo.tableId).toBe(t1);
    expect(dopo.combinedTableIds).toEqual([]);

    // E il tavolo liberato si può dare a qualcun altro.
    const altra = await prenotazione(4);
    const assegnata = await assignBookingToTable(venueId, altra.id, t2);
    expect(assegnata.tableId).toBe(t2);
  });

  it("il registro dice quali tavoli sono stati liberati", async () => {
    const b = await prenotazione(8);
    await combineTablesForBooking(venueId, b.id, [t1, t2]);
    await splitTablesForBooking(venueId, b.id, { actor: attore() });

    const riga = await db.auditLog.findFirst({
      where: { entityId: b.id, action: "booking.split_tables" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(riga?.diff)).toContain(t2);
  });

  it("dividere una prenotazione senza tavolata non rompe niente", async () => {
    const b = await prenotazione(4);
    await assignBookingToTable(venueId, b.id, t1);
    const dopo = await splitTablesForBooking(venueId, b.id);
    expect(dopo.combinedTableIds).toEqual([]);
  });

  it("la prenotazione di un altro locale non si tocca", async () => {
    const altrui = await prenotazione(4, ORA, altroVenueId);
    await expect(splitTablesForBooking(venueId, altrui.id)).rejects.toThrow(BookingAssignError);
  });
});

describe("spostare una tavolata su un tavolo solo", () => {
  it("scioglie la tavolata invece di lasciare tavoli attaccati", async () => {
    // Senza questo, spostando la prenotazione sul tavolo 3 il tavolo 2
    // restava occupato da una prenotazione che non c'era più: un tavolo
    // fantasma per il resto della serata.
    const b = await prenotazione(8);
    await combineTablesForBooking(venueId, b.id, [t1, t2]);

    const spostata = await assignBookingToTable(venueId, b.id, t3, { force: true });
    expect(spostata.tableId).toBe(t3);
    expect(spostata.combinedTableIds).toEqual([]);

    const altra = await prenotazione(4);
    await expect(assignBookingToTable(venueId, altra.id, t2)).resolves.toBeTruthy();
  });
});

describe("«nessun tavolo» dice quale nessun tavolo", () => {
  it("distingue «non ne esistono di quella misura» da «sono tutti occupati»", async () => {
    const { findFreeTables } = await import("@/server/table-search");

    // Nel locale di prova i tavoli sono da quattro: per dodici persone non
    // esiste nessun tavolo, e non è la stessa cosa che averli occupati.
    const dodici = await findFreeTables(venueId, { partySize: 12, startsAt: ORA });
    expect(dodici.tables).toHaveLength(0);
    expect(dodici.reason).toBe("no_table_that_big");

    // Con `includeSmaller` invece i tavoli da unire ci sono.
    const daUnire = await findFreeTables(venueId, { partySize: 12, startsAt: ORA, includeSmaller: true });
    expect(daUnire.tables.length).toBeGreaterThan(0);
    // E il séparé non unibile non compare.
    expect(daUnire.tables.map((t) => t.tableId)).not.toContain(fisso);
  });
});
