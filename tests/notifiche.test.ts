import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking, updateBooking } from "@/server/bookings";
import { redeemGiftCard, createGiftCard } from "@/server/gift-cards";

/**
 * Quando la campanella suona, e quando **non** deve suonare.
 *
 * `NotificationKind` dichiara venti categorie e per mesi ne sono state
 * scritte quattro: la campanella era quasi sempre vuota. Ora ne scrive otto,
 * e la parte difficile non è farla suonare — è non farla suonare a vuoto.
 *
 * Questi test difendono soprattutto i silenzi: una prenotazione presa al
 * telefono da chi è in sala, una disdetta per il mese prossimo, un cliente
 * abituale che si ricollega al Wi-Fi. Ognuno di quei casi, notificato,
 * renderebbe la campanella un posto da non guardare più.
 */

const db = new PrismaClient();
const PREFISSO = "test-notif-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";

/** Un orario di oggi che non dipende dall'ora in cui girano i test. */
const ADESSO = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
    })
  ).id;
  guestId = (await db.guest.create({ data: { venueId, firstName: "Nadia", lastName: "Sala" } })).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.notification.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
});

function fra(ore: number): string {
  return new Date(ADESSO.getTime() + ore * 3_600_000).toISOString();
}

async function notifiche(kind?: string) {
  return db.notification.findMany({ where: { venueId, ...(kind ? { kind: kind as never } : {}) } });
}

describe("una prenotazione che aspetta una decisione", () => {
  it("dal sito suona, e dice da dove arriva", async () => {
    await createBooking(venueId, {
      guest: { firstName: "Chi", lastName: "Prenota", email: `${PREFISSO}web@test.local`, phone: "+39 333 1" },
      partySize: 4,
      startsAt: fra(6),
      source: "WIDGET",
    });

    const avvisi = await notifiche("BOOKING_CREATED");
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].title).toContain("4");
    expect(avvisi[0].body).toContain("sito");
    expect(avvisi[0].link).toBe("/bookings?status=pending");
  });

  it("presa al telefono non suona: chi l'ha scritta era in sala", async () => {
    await createBooking(venueId, {
      guestId,
      partySize: 2,
      startsAt: fra(6),
      source: "PHONE",
    });
    expect(await notifiche("BOOKING_CREATED")).toHaveLength(0);
  });
});

describe("una disdetta", () => {
  it("per stasera suona, e dice quanti coperti si liberano", async () => {
    const b = await createBooking(venueId, { guestId, partySize: 6, startsAt: fra(5), source: "PHONE" });
    await updateBooking(venueId, b.id, { status: "CANCELLED" });

    const avvisi = await notifiche("BOOKING_CANCELLED");
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].title).toContain("6 coperti");
    expect(avvisi[0].title).toContain("Nadia");
  });

  it("per la settimana prossima no: oggi non cambia niente a nessuno", async () => {
    const b = await createBooking(venueId, { guestId, partySize: 2, startsAt: fra(24 * 7), source: "PHONE" });
    await updateBooking(venueId, b.id, { status: "CANCELLED" });
    expect(await notifiche("BOOKING_CANCELLED")).toHaveLength(0);
  });

  it("annullare due volte non suona due volte", async () => {
    const b = await createBooking(venueId, { guestId, partySize: 2, startsAt: fra(5), source: "PHONE" });
    await updateBooking(venueId, b.id, { status: "CANCELLED" });
    await updateBooking(venueId, b.id, { status: "CANCELLED" });
    expect(await notifiche("BOOKING_CANCELLED")).toHaveLength(1);
  });
});

describe("una gift card usata", () => {
  it("suona con l'importo e con quello che resta", async () => {
    const carta = await createGiftCard(venueId, { initialCents: 10000 });
    await redeemGiftCard(venueId, { code: carta.code, amountCents: 3000 });

    const avvisi = await notifiche("GIFT_CARD_REDEEMED");
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].title).toContain("30,00 €");
    expect(avvisi[0].body).toContain("70,00 €");
  });

  it("esaurendola, lo dice", async () => {
    const carta = await createGiftCard(venueId, { initialCents: 2000 });
    await redeemGiftCard(venueId, { code: carta.code, amountCents: 2000 });
    const avvisi = await notifiche("GIFT_CARD_REDEEMED");
    expect(avvisi[0].body).toContain("esaurita");
  });
});
