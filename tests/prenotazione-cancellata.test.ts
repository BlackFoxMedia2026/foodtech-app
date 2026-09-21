import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking, deleteBooking, listBookings, updateBooking } from "@/server/bookings";
import { endOfDay, startOfDay } from "@/lib/utils";
import { checkAvailability } from "@/server/availability";
import { storiaPrenotazione } from "@/server/storia-prenotazione";
import { cercaNelLocale } from "@/server/ricerca";

/**
 * Cancellare una prenotazione: la riga resta, e non la vede nessuno.
 *
 * Era mezza funzione. `deletedAt` e `deletedBy` stavano nello schema dal
 * principio, venti letture filtravano le righe cancellate, e **nessuno le
 * scriveva**: il cestino cancellava davvero. Con la cancellazione vera la
 * storia sparisce, i `BookingEvent` se li porta la cascata, e conti e
 * pagamenti restano senza prenotazione — il denaro incassato smette di essere
 * collegato alla sera in cui e entrato.
 *
 * Questi test tengono insieme le due meta, che vanno sempre insieme: la riga
 * resta **e** nessuno la mostra. Una meta sola e peggio di niente — mezza
 * perche il cestino non cancella piu, e mezza perche le prenotazioni
 * cancellate ricomparirebbero in agenda.
 */

const db = new PrismaClient();
const PREFISSO = "test-cancellate-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const ATTORE = { userId: "u-prova", email: null, orgId: "", venueId: "" };

let orgId = "";
let venueId = "";
let guestId = "";
/** Domani alle 20:00 in punto: un orario che sta dentro ogni turno di cena. */
let quando = new Date();

async function pulisci() {
  await db.auditLog.deleteMany({ where: { Organization: { name: { startsWith: PREFISSO } } } });
  await db.booking.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.guest.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.shift.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

beforeEach(async () => {
  await pulisci();
  const unico = `${PREFISSO}${Date.now()}-${Math.random()}`;
  orgId = (await db.organization.create({ data: { name: `${PREFISSO}org`, slug: unico } })).id;
  venueId = (
    await db.venue.create({
      data: {
        orgId,
        name: `${PREFISSO}locale`,
        slug: `v-${unico}`,
        active: true,
        timezone: "Europe/Rome",
      },
    })
  ).id;
  guestId = (
    await db.guest.create({
      data: { venueId, firstName: "Mario", lastName: "Cancellata", phone: "3331119999" },
    })
  ).id;
  ATTORE.orgId = orgId;
  ATTORE.venueId = venueId;

  /*
    Il locale ha orari e tavoli, e non e un dettaglio del preparativo: senza
    turni `checkAvailability` non ha nessuna capienza da confrontare, e la
    prova «il posto torna libero» passerebbe verde senza poter diventare
    rossa.
  */
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: { venueId, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 8 },
    });
  }

  const domani = new Date();
  domani.setDate(domani.getDate() + 1);
  domani.setHours(20, 0, 0, 0);
  quando = domani;
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

async function prenota(persone = 2) {
  return createBooking(venueId, {
    guestId,
    partySize: persone,
    startsAt: quando.toISOString(),
    status: "CONFIRMED",
  });
}

describe("la riga resta", () => {
  it("cancellare scrive deletedAt e chi l'ha fatto, invece di togliere la riga", async () => {
    const b = await prenota();
    await deleteBooking(venueId, b.id, ATTORE);

    /* La lettura grezza: la riga c'e ancora, e sa quando e da chi. E l'unico
       modo di rimettere in piedi una prenotazione cancellata per sbaglio. */
    const riga = await db.booking.findUnique({ where: { id: b.id } });
    expect(riga).not.toBeNull();
    expect(riga!.deletedAt).toBeInstanceOf(Date);
    expect(riga!.deletedBy).toBe("u-prova");
  });

  it("due clic sul cestino non cancellano due volte", async () => {
    /* La condizione sta dentro la scrittura: la seconda non trova piu una
       prenotazione non cancellata, e lo dice. */
    const b = await prenota();
    await deleteBooking(venueId, b.id, ATTORE);
    await expect(deleteBooking(venueId, b.id, ATTORE)).rejects.toThrow("not_found");

    expect(
      await db.auditLog.count({ where: { action: "booking.delete", entityId: b.id } }),
    ).toBe(1);
  });

  it("non si cancella la prenotazione di un altro locale", async () => {
    const b = await prenota();
    const unico = `${PREFISSO}altro-${Date.now()}`;
    const org2 = await db.organization.create({ data: { name: `${PREFISSO}org2`, slug: unico } });
    const v2 = await db.venue.create({
      data: { orgId: org2.id, name: `${PREFISSO}altro`, slug: `v-${unico}`, timezone: "Europe/Rome" },
    });

    await expect(deleteBooking(v2.id, b.id, ATTORE)).rejects.toThrow("not_found");
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).deletedAt).toBeNull();
  });
});

describe("e non la vede nessuno", () => {
  it("sparisce dalla lista del giorno", async () => {
    const b = await prenota();
    const giorno = { from: startOfDay(quando), to: endOfDay(quando) };
    expect((await listBookings(venueId, giorno)).map((x) => x.id)).toContain(b.id);

    await deleteBooking(venueId, b.id, ATTORE);
    expect((await listBookings(venueId, giorno)).map((x) => x.id)).not.toContain(b.id);
  });

  it("libera il posto in agenda: il tavolo torna prenotabile", async () => {
    /* E la meta che rende utile il cestino. Se la disponibilita continuasse a
       contare una prenotazione cancellata, il locale avrebbe cancellato una
       riga e non riavrebbe il posto — cioe il cestino non servirebbe a niente. */
    /* Otto coperti su una capienza di otto: il turno e pieno. */
    const b = await prenota(8);
    const pieno = await checkAvailability(venueId, {
      partySize: 4,
      startsAt: quando,
      durationMin: 105,
    });
    expect(pieno.available).toBe(false);

    await deleteBooking(venueId, b.id, ATTORE);
    const libero = await checkAvailability(venueId, {
      partySize: 4,
      startsAt: quando,
      durationMin: 105,
    });
    expect(libero.available).toBe(true);
  });

  it("non si modifica piu, nemmeno conoscendone l'identificativo", async () => {
    const b = await prenota();
    await deleteBooking(venueId, b.id, ATTORE);
    await expect(
      updateBooking(venueId, b.id, { partySize: 6 }, { actor: ATTORE }),
    ).rejects.toThrow();
  });

  it("non compare nella ricerca", async () => {
    const b = await prenota();
    const prima = await cercaNelLocale(venueId, "Cancellata");
    expect(prima.prenotazioni.map((p) => p.id)).toContain(b.id);

    await deleteBooking(venueId, b.id, ATTORE);
    const dopo = await cercaNelLocale(venueId, "Cancellata");
    expect(dopo.prenotazioni.map((p) => p.id)).not.toContain(b.id);
  });

  it("la sua storia non si racconta piu", async () => {
    /* Non solleva: risponde **niente**. La schermata del dettaglio risponde
       gia «non trovata», e una storia vuota e la risposta coerente per una
       riga che nessuno puo vedere. Quello che conta e che prima ci fosse: una
       storia vuota anche da viva vorrebbe dire un test che non prova nulla. */
    const b = await prenota();
    expect((await storiaPrenotazione(venueId, b.id, "Europe/Rome")).length).toBeGreaterThan(0);

    await deleteBooking(venueId, b.id, ATTORE);
    expect(await storiaPrenotazione(venueId, b.id, "Europe/Rome")).toEqual([]);
  });

  it("non conta piu come visita dell'ospite", async () => {
    /* I contatori della scheda sono quelli su cui il locale decide come
       trattare un cliente: una visita cancellata che resta contata e un
       cliente promosso per una prenotazione che non c'e piu. */
    const b = await db.booking.create({
      data: { venueId, guestId, partySize: 2, startsAt: new Date(Date.now() - 86_400_000), status: "COMPLETED" },
    });
    await db.guest.update({ where: { id: guestId }, data: { totalVisits: 1 } });

    await deleteBooking(venueId, b.id, ATTORE);
    expect((await db.guest.findUniqueOrThrow({ where: { id: guestId } })).totalVisits).toBe(0);
  });
});
