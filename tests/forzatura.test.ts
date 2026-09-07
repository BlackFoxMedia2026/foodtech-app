import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking } from "@/server/bookings";
import { AvailabilityError } from "@/server/availability";
import { BookingAssignError, assignBookingToTable } from "@/server/booking-floor";

/**
 * La forzatura: accettare una prenotazione oltre orari, capienza o posti del
 * tavolo.
 *
 * `skipAvailabilityCheck` era predisposto da luglio e non aveva interfaccia:
 * la decisione rimasta aperta era «serve, e a quali condizioni?». La risposta
 * scritta qui: serve, ma solo da codice server, con un motivo, e con una
 * traccia nel registro. Questi test difendono le tre condizioni.
 */

const db = new PrismaClient();
const PREFISSO = "test-force-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";
let tavolo2 = "";

/** Un orario dentro il turno, e uno fuori. */
function dentroServizio(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}
function fuoriServizio(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(4, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  orgId = org.id;
  const venue = await db.venue.create({
    data: { orgId, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
  });
  venueId = venue.id;
  tavolo2 = (await db.table.create({ data: { venueId, label: "F2", seats: 2 } })).id;
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: { venueId, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 10 },
    });
  }
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const attore = () => ({
  userId: "test-user",
  email: "prova@tavolo.test",
  orgId,
  venueId,
});

describe("senza forzatura", () => {
  it("rifiuta un orario in cui il locale è chiuso", async () => {
    await expect(
      createBooking(venueId, {
        guest: { firstName: "Notte" },
        partySize: 2,
        startsAt: fuoriServizio(),
        source: "PHONE",
      }),
    ).rejects.toThrow(AvailabilityError);
  });

  it("rifiuta più persone dei posti del tavolo", async () => {
    await expect(
      createBooking(venueId, {
        guest: { firstName: "Troppi" },
        partySize: 6,
        startsAt: dentroServizio(),
        tableId: tavolo2,
        source: "PHONE",
      }),
    ).rejects.toThrow(AvailabilityError);
  });
});

describe("con forzatura", () => {
  it("accetta l'orario fuori servizio e lo registra con il motivo", async () => {
    const booking = await createBooking(
      venueId,
      { guest: { firstName: "Notte" }, partySize: 2, startsAt: fuoriServizio(), source: "PHONE" },
      { skipAvailabilityCheck: true, forceReason: "after-hours concordato", actor: attore() },
    );

    expect(booking.id).toBeTruthy();

    const riga = await db.auditLog.findFirst({
      where: { entityId: booking.id, action: "booking.create_forced" },
    });
    expect(riga).not.toBeNull();
    expect(riga?.actorEmail).toBe("prova@tavolo.test");
    expect((riga?.diff as Record<string, unknown>)?.motivoForzatura).toBe("after-hours concordato");

    await db.booking.delete({ where: { id: booking.id } });
  });

  it("accetta un tavolo più piccolo del gruppo", async () => {
    const booking = await createBooking(
      venueId,
      {
        guest: { firstName: "Stretti" },
        partySize: 6,
        startsAt: dentroServizio(),
        tableId: tavolo2,
        source: "PHONE",
      },
      { skipAvailabilityCheck: true, forceReason: "tavolo unito a mano", actor: attore() },
    );
    expect(booking.tableId).toBe(tavolo2);
    expect(booking.partySize).toBe(6);
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("senza motivo la registrazione resta una creazione normale, non una forzatura", async () => {
    // Il motivo lo pretende la route: qui si verifica che l'azione registrata
    // dipenda dal motivo, così una forzatura non può passare inosservata nel
    // registro.
    const booking = await createBooking(
      venueId,
      { guest: { firstName: "Regolare" }, partySize: 2, startsAt: dentroServizio(), source: "PHONE" },
      { actor: attore() },
    );

    const forzata = await db.auditLog.findFirst({
      where: { entityId: booking.id, action: "booking.create_forced" },
    });
    const normale = await db.auditLog.findFirst({
      where: { entityId: booking.id, action: "booking.create" },
    });
    expect(forzata).toBeNull();
    expect(normale).not.toBeNull();

    await db.booking.delete({ where: { id: booking.id } });
  });
});

describe("forzare l'assegnazione di un tavolo troppo piccolo", () => {
  /** Una prenotazione per quattro, in orario, senza tavolo. */
  async function perQuattro() {
    return createBooking(
      venueId,
      {
        guest: { firstName: "Gruppo", lastName: "Grande" },
        partySize: 4,
        startsAt: dentroServizio().toISOString(),
        source: "PHONE",
      },
      { skipAvailabilityCheck: true, forceReason: "prova" },
    );
  }

  it("senza forzatura si rifiuta e dice quanti posti mancano", async () => {
    const b = await perQuattro();
    await expect(assignBookingToTable(venueId, b.id, tavolo2)).rejects.toMatchObject({
      code: "capacity_mismatch",
      detail: { tableSeats: 2, partySize: 4 },
    });
  });

  it("forzare senza motivo non basta più", async () => {
    const b = await perQuattro();
    // Prima passava: il registro segnava «forzata» e non il perché, cioè
    // proprio la parte che serve a chi controlla dopo.
    await expect(assignBookingToTable(venueId, b.id, tavolo2, { force: true })).rejects.toMatchObject({
      code: "reason_required",
    });
    await expect(
      assignBookingToTable(venueId, b.id, tavolo2, { force: true, forceReason: "   " }),
    ).rejects.toBeInstanceOf(BookingAssignError);

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.tableId).toBeNull();
  });

  it("con il motivo assegna, e il motivo finisce nel registro", async () => {
    const b = await perQuattro();
    const attore = { userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null };

    const assegnata = await assignBookingToTable(venueId, b.id, tavolo2, {
      force: true,
      forceReason: "aggiungiamo una sedia, due sono bambini",
      actor: attore,
    });
    expect(assegnata.tableId).toBe(tavolo2);

    const riga = await db.auditLog.findFirstOrThrow({
      where: { venueId, action: "booking.assign_table_forced", entityId: b.id },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(riga.diff)).toContain("aggiungiamo una sedia");
  });
});
