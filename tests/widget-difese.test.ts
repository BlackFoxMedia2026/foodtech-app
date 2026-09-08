import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking } from "@/server/bookings";
import {
  CAMPO_TRAPPOLA,
  chiaveIdempotenza,
  giaFattaConQuestaChiave,
  giaPrenotatoUgualeIdentico,
  trappolaScattata,
} from "@/server/widget-defenses";

/**
 * Le difese del widget.
 *
 * Metà di questi test verifica che una difesa **funzioni**; l'altra metà, più
 * importante, che **non scatti dove non deve**. Un ristorante perde più da un
 * coperto rifiutato per sbaglio che da una prenotazione falsa da cancellare, e
 * una difesa che si mette in mezzo a un cliente vero va tolta, non tarata.
 */

const db = new PrismaClient();
const PREFISSO = "test-wid-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

const ADESSO = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();

const fra = (ore: number) => new Date(ADESSO.getTime() + ore * 3_600_000);

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

describe("il campo trappola", () => {
  it("scatta solo se qualcuno l'ha compilato", () => {
    expect(trappolaScattata({ [CAMPO_TRAPPOLA]: "https://spam.example" })).toBe(true);
    expect(trappolaScattata({ [CAMPO_TRAPPOLA]: "" })).toBe(false);
    expect(trappolaScattata({ [CAMPO_TRAPPOLA]: "   " })).toBe(false);
    // Il modulo di una persona non lo manda nemmeno, o lo manda vuoto.
    expect(trappolaScattata({})).toBe(false);
    expect(trappolaScattata(null)).toBe(false);
  });
});

describe("la chiave del tentativo", () => {
  it("una chiave sensata si tiene", () => {
    expect(chiaveIdempotenza({ idempotencyKey: "b3f1c8de-1111-2222-3333-444455556666" })).toBe(
      "b3f1c8de-1111-2222-3333-444455556666",
    );
  });

  it("una chiave assurda si ignora, e la prenotazione si fa comunque", () => {
    // Preferire una prenotazione senza difesa a una prenotazione rifiutata:
    // il cliente non c'entra niente con la chiave che il modulo ha mandato.
    expect(chiaveIdempotenza({ idempotencyKey: "corta" })).toBeNull();
    expect(chiaveIdempotenza({ idempotencyKey: "x".repeat(500) })).toBeNull();
    expect(chiaveIdempotenza({ idempotencyKey: 42 })).toBeNull();
    expect(chiaveIdempotenza({})).toBeNull();
  });

  it("riconosce la prenotazione già fatta da quel tentativo", async () => {
    const chiave = `${PREFISSO}chiave-1234567890`;
    const creata = await createBooking(
      venueId,
      {
        guest: { firstName: "Doppio", email: `${PREFISSO}doppio@test.local`, phone: "+39 333 1" },
        partySize: 2,
        startsAt: fra(5).toISOString(),
        source: "WIDGET",
      },
      { idempotencyKey: chiave },
    );

    const trovata = await giaFattaConQuestaChiave(venueId, chiave);
    expect(trovata?.id).toBe(creata.id);
  });

  it("la stessa chiave in un altro locale non è la stessa prenotazione", async () => {
    const chiave = `${PREFISSO}chiave-condivisa-1`;
    await createBooking(
      venueId,
      { guest: { firstName: "Qui" }, partySize: 2, startsAt: fra(5).toISOString(), source: "WIDGET" },
      { idempotencyKey: chiave },
    );
    expect(await giaFattaConQuestaChiave(altroVenueId, chiave)).toBeNull();
  });

  it("senza chiave non cerca niente: non è un motivo per rifiutare", async () => {
    expect(await giaFattaConQuestaChiave(venueId, null)).toBeNull();
  });
});

describe("il doppione identico", () => {
  async function prenota(email: string, ora: number, coperti = 2) {
    return createBooking(venueId, {
      guest: { firstName: "Chi", email, phone: "+39 333 9999" },
      partySize: coperti,
      startsAt: fra(ora).toISOString(),
      source: "WIDGET",
    });
  }

  it("stessa email, stesso orario, stessi coperti: è la stessa prenotazione", async () => {
    const email = `${PREFISSO}stessa@test.local`;
    const prima = await prenota(email, 6);

    const doppione = await giaPrenotatoUgualeIdentico(venueId, {
      email,
      startsAt: fra(6),
      partySize: 2,
    });
    expect(doppione?.id).toBe(prima.id);
  });

  it("un orario diverso **non** è un doppione: due amici allo stesso tavolo a due ore diverse", async () => {
    const email = `${PREFISSO}duevolte@test.local`;
    await prenota(email, 6);
    expect(
      await giaPrenotatoUgualeIdentico(venueId, { email, startsAt: fra(8), partySize: 2 }),
    ).toBeNull();
  });

  it("un numero di coperti diverso non è un doppione", async () => {
    const email = `${PREFISSO}piupersone@test.local`;
    await prenota(email, 6, 2);
    expect(
      await giaPrenotatoUgualeIdentico(venueId, { email, startsAt: fra(6), partySize: 4 }),
    ).toBeNull();
  });

  it("una prenotazione annullata non è un doppione: chi riprenota sta prenotando davvero", async () => {
    const email = `${PREFISSO}ripensata@test.local`;
    const prima = await prenota(email, 6);
    await db.booking.update({ where: { id: prima.id }, data: { status: "CANCELLED" } });

    expect(
      await giaPrenotatoUgualeIdentico(venueId, { email, startsAt: fra(6), partySize: 2 }),
    ).toBeNull();
  });

  it("senza email né telefono non si cerca: non si può riconoscere nessuno", async () => {
    expect(
      await giaPrenotatoUgualeIdentico(venueId, { startsAt: fra(6), partySize: 2 }),
    ).toBeNull();
  });

  it("si riconosce anche dal solo telefono", async () => {
    const prima = await createBooking(venueId, {
      guest: { firstName: "Solo", phone: "+39 348 111 2233" },
      partySize: 3,
      startsAt: fra(7).toISOString(),
      source: "WIDGET",
    });
    const doppione = await giaPrenotatoUgualeIdentico(venueId, {
      phone: "+39 348 111 2233",
      startsAt: fra(7),
      partySize: 3,
    });
    expect(doppione?.id).toBe(prima.id);
  });

  it("il doppione di un altro locale non conta", async () => {
    const email = `${PREFISSO}altrove@test.local`;
    await prenota(email, 6);
    expect(
      await giaPrenotatoUgualeIdentico(altroVenueId, { email, startsAt: fra(6), partySize: 2 }),
    ).toBeNull();
  });
});
