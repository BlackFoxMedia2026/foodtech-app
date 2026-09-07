import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { deleteBooking, updateBooking } from "@/server/bookings";
import { assignBookingToTable, BookingAssignError } from "@/server/booking-floor";
import { deleteWaiter, updateWaiter } from "@/server/waiters";
import { getGuest, updateGuest } from "@/server/guests";
import { renameRoom } from "@/server/rooms";
import { markNotificationRead } from "@/server/notifications";

/**
 * Verifica che un ristorante non possa toccare i dati di un altro passando un
 * identificativo altrui.
 *
 * L'isolamento nel codice è già scritto bene — `venueId` arriva sempre dal
 * server e ogni funzione filtra prima di scrivere — ma è la garanzia su cui
 * poggia tutto il resto: se cede, cede la fiducia nel prodotto. Quindi va
 * verificata, non solo letta.
 *
 * Il criterio: chiamare ogni funzione con il locale A e l'identificativo di un
 * elemento del locale B. La risposta corretta è «non esiste», non «ecco».
 */

const db = new PrismaClient();
const PREFISSO = "test-iso-";

// Non deve poter girare su un database vero: queste prove scrivono e cancellano.
const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "I test di isolamento scrivono sul database. DATABASE_URL deve contenere 'dev' o 'test'. " +
      "Valore attuale non riconosciuto come ambiente di prova.",
  );
}

type Locale = {
  orgId: string;
  venueId: string;
  waiterId: string;
  guestId: string;
  bookingId: string;
  tableId: string;
  roomId: string;
  notificationId: string;
};

async function creaLocale(nome: string): Promise<Locale> {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}${nome}-${Date.now()}`, timezone: "Europe/Rome" },
  });
  const room = await db.room.create({ data: { venueId: venue.id, name: "Sala" } });
  const table = await db.table.create({
    data: { venueId: venue.id, roomId: room.id, label: `${nome}-1`, seats: 4 },
  });
  const waiter = await db.waiter.create({
    data: {
      venueId: venue.id,
      firstName: nome,
      lastName: "Prova",
      role: "Cameriere",
      birthday: new Date("1995-05-05T00:00:00.000Z"),
      phone: "+390000000",
    },
  });
  const guest = await db.guest.create({
    data: { venueId: venue.id, firstName: nome, lastName: "Ospite", email: `${PREFISSO}${nome}@test.local` },
  });
  const booking = await db.booking.create({
    data: {
      venueId: venue.id,
      guestId: guest.id,
      partySize: 2,
      startsAt: new Date("2026-11-10T19:00:00.000Z"),
      status: "CONFIRMED",
      source: "PHONE",
    },
  });
  const notification = await db.notification.create({
    data: { venueId: venue.id, kind: "BOOKING_CREATED", title: "Prova", body: "Prova" },
  });

  return {
    orgId: org.id,
    venueId: venue.id,
    waiterId: waiter.id,
    guestId: guest.id,
    bookingId: booking.id,
    tableId: table.id,
    roomId: room.id,
    notificationId: notification.id,
  };
}

let A: Locale;
let B: Locale;

beforeAll(async () => {
  A = await creaLocale("alfa");
  B = await creaLocale("beta");
}, 60_000);

afterAll(async () => {
  // In ordine inverso rispetto alle dipendenze; le cascate fanno il resto.
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("un locale non vede i dati di un altro", () => {
  it("non legge la scheda di un ospite altrui", async () => {
    await expect(getGuest(A.venueId, B.guestId)).resolves.toBeNull();
  });

  it("non modifica un ospite altrui", async () => {
    await expect(updateGuest(A.venueId, B.guestId, { firstName: "Rubato" })).rejects.toThrow("not_found");
    const ospite = await db.guest.findUnique({ where: { id: B.guestId } });
    expect(ospite?.firstName).toBe("beta");
  });

  it("non modifica un cameriere altrui", async () => {
    await expect(updateWaiter(A.venueId, B.waiterId, { firstName: "Rubato" })).rejects.toThrow("not_found");
    const cameriere = await db.waiter.findUnique({ where: { id: B.waiterId } });
    expect(cameriere?.firstName).toBe("beta");
  });

  it("non cancella un cameriere altrui", async () => {
    await expect(deleteWaiter(A.venueId, B.waiterId)).rejects.toThrow("not_found");
    expect(await db.waiter.findUnique({ where: { id: B.waiterId } })).not.toBeNull();
  });

  it("non modifica una prenotazione altrui", async () => {
    // partySize 8 e non 99: oltre il massimo consentito scatterebbe la
    // validazione prima del controllo sul locale, e il test non proverebbe
    // quello che dice di provare.
    await expect(updateBooking(A.venueId, B.bookingId, { partySize: 8 })).rejects.toThrow("not_found");
    const pren = await db.booking.findUnique({ where: { id: B.bookingId } });
    expect(pren?.partySize).toBe(2);
  });

  it("non cancella una prenotazione altrui", async () => {
    await expect(deleteBooking(A.venueId, B.bookingId)).rejects.toThrow("not_found");
    expect(await db.booking.findUnique({ where: { id: B.bookingId } })).not.toBeNull();
  });

  it("non rinomina una sala altrui", async () => {
    await expect(renameRoom(A.venueId, B.roomId, { name: "Rubata" })).rejects.toThrow();
    const sala = await db.room.findUnique({ where: { id: B.roomId } });
    expect(sala?.name).toBe("Sala");
  });

  it("non segna come letta una notifica altrui", async () => {
    await expect(markNotificationRead(A.venueId, "MANAGER", B.notificationId)).rejects.toThrow("not_found");
    const notifica = await db.notification.findUnique({ where: { id: B.notificationId } });
    expect(notifica?.readAt).toBeNull();
  });

  it("non assegna un tavolo altrui a una propria prenotazione", async () => {
    await expect(assignBookingToTable(A.venueId, A.bookingId, B.tableId)).rejects.toThrow(BookingAssignError);
    const pren = await db.booking.findUnique({ where: { id: A.bookingId } });
    expect(pren?.tableId).toBeNull();
  });

  it("non assegna un proprio tavolo a una prenotazione altrui", async () => {
    await expect(assignBookingToTable(A.venueId, B.bookingId, A.tableId)).rejects.toThrow(BookingAssignError);
    const pren = await db.booking.findUnique({ where: { id: B.bookingId } });
    expect(pren?.tableId).toBeNull();
  });
});

describe("dentro il proprio locale invece funziona", () => {
  // Controprova necessaria: senza questa, i test sopra passerebbero anche se
  // le funzioni fossero rotte e rifiutassero tutto.
  it("assegna un proprio tavolo a una propria prenotazione", async () => {
    const aggiornata = await assignBookingToTable(A.venueId, A.bookingId, A.tableId);
    expect(aggiornata.tableId).toBe(A.tableId);
  });

  it("modifica un proprio ospite", async () => {
    const aggiornato = await updateGuest(A.venueId, A.guestId, { firstName: "Alfa2" });
    expect(aggiornato.firstName).toBe("Alfa2");
  });

  it("legge una propria prenotazione e la modifica", async () => {
    const aggiornata = await updateBooking(A.venueId, A.bookingId, { notes: "nota di prova" });
    expect(aggiornata.notes).toBe("nota di prova");
  });
});
