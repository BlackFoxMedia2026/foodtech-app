import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem } from "@/server/menu";
import { addLine, closeOrder, openOrderForBooking } from "@/server/orders";
import { getFoodCost } from "@/server/food-cost";

/**
 * Il costo del cibo.
 *
 * La tentazione, in un calcolo così, è **estrapolare**: se il costo è
 * dichiarato su metà dei piatti venduti, la percentuale «del locale» si
 * ottiene moltiplicando quella metà per due. Sarebbe una moltiplicazione, non
 * una misura, e farebbe alzare i prezzi sbagliati.
 *
 * Queste prove fissano il contrario: la percentuale vale **solo sulla parte
 * coperta**, la copertura si dichiara, e quello che non sappiamo resta in un
 * elenco a parte invece di sparire.
 */

const db = new PrismaClient();
const PREFISSO = "test-fc-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let categoriaId = "";
const DA = new Date("2026-09-01T00:00:00.000Z");
const A = new Date("2026-09-30T23:59:59.000Z");

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
  altroVenueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` } })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.orderItem.deleteMany({ where: { Order: { venueId: { in: [venueId, altroVenueId] } } } });
  await db.order.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuItemCost.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuItem.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuCategory.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const piatto = (nome: string, prezzo: number, costo?: number) =>
  createItem(venueId, {
    categoryId: categoriaId,
    name: nome,
    priceCents: prezzo,
    ...(costo != null ? { costCents: costo } : {}),
  });

/** Un conto chiuso dentro il periodo, con le righe indicate. */
async function contoChiuso(righe: { menuItemId?: string; name?: string; priceCents?: number; quantity?: number }[]) {
  const b = await db.booking.create({
    data: { venueId, partySize: 2, startsAt: new Date("2026-09-10T19:00:00.000Z"), status: "SEATED", source: "PHONE" },
  });
  const c = await openOrderForBooking(venueId, b.id);
  for (const r of righe) await addLine(venueId, c.id, r);
  const chiuso = await closeOrder(venueId, c.id);
  // La chiusura mette `completedAt` ad adesso: la si riporta dentro il periodo.
  await db.order.update({
    where: { id: chiuso.id },
    data: { completedAt: new Date("2026-09-10T22:00:00.000Z") },
  });
  return chiuso;
}

/* -------------------------------------------------------------------------- */

describe("senza conti chiusi", () => {
  it("non c'è niente da calcolare, e non si finge", async () => {
    const r = await getFoodCost(venueId, DA, A);
    expect(r.conti).toBe(0);
    expect(r.incassoCents).toBe(0);
    expect(r.foodCostPct).toBeNull();
    expect(r.coperturaPct).toBe(0);
  });

  it("un conto ancora aperto non è un incasso", async () => {
    const p = await piatto("Tagliatelle", 1400, 400);
    const b = await db.booking.create({
      data: { venueId, partySize: 2, startsAt: new Date("2026-09-10T19:00:00.000Z"), status: "SEATED", source: "PHONE" },
    });
    const c = await openOrderForBooking(venueId, b.id);
    await addLine(venueId, c.id, { menuItemId: p.id });

    const r = await getFoodCost(venueId, DA, A);
    expect(r.conti).toBe(0);
  });
});

describe("il calcolo, quando i costi ci sono tutti", () => {
  it("costo, margine e percentuale sul venduto", async () => {
    const p = await piatto("Tagliatelle", 1000, 300);
    await contoChiuso([{ menuItemId: p.id, quantity: 2 }]);

    const r = await getFoodCost(venueId, DA, A);
    expect(r.incassoCents).toBe(2000);
    expect(r.costoCents).toBe(600);
    expect(r.margineCents).toBe(1400);
    expect(r.foodCostPct).toBe(30);
    expect(r.coperturaPct).toBe(100);
  });

  it("somma le righe dello stesso piatto su conti diversi", async () => {
    const p = await piatto("Tagliatelle", 1000, 300);
    await contoChiuso([{ menuItemId: p.id, quantity: 2 }]);
    await contoChiuso([{ menuItemId: p.id, quantity: 3 }]);

    const r = await getFoodCost(venueId, DA, A);
    expect(r.conti).toBe(2);
    expect(r.piatti).toHaveLength(1);
    expect(r.piatti[0].quantita).toBe(5);
    expect(r.piatti[0].incassoCents).toBe(5000);
  });

  it("i piatti vanno dal margine più alto al più basso", async () => {
    const grasso = await piatto("Grasso", 3000, 500);
    const magro = await piatto("Magro", 1000, 800);
    await contoChiuso([{ menuItemId: magro.id }, { menuItemId: grasso.id }]);

    const r = await getFoodCost(venueId, DA, A);
    // In cima quello che tiene su il conto, in fondo quello che lo affonda.
    expect(r.piatti.map((p) => p.name)).toEqual(["Grasso", "Magro"]);
    expect(r.piatti[0].marginePct).toBe(83);
    expect(r.piatti[1].marginePct).toBe(20);
  });
});

describe("quello che non sappiamo non si estrapola", () => {
  it("la percentuale vale sulla parte coperta, e la copertura si dichiara", async () => {
    const conCosto = await piatto("Con costo", 1000, 300);
    const senza = await piatto("Senza costo", 1000);
    await contoChiuso([{ menuItemId: conCosto.id }, { menuItemId: senza.id }]);

    const r = await getFoodCost(venueId, DA, A);
    expect(r.incassoCents).toBe(2000);
    // Il costo noto è 300 su 1000 di incasso coperto: 30%, non 15% dei 2000.
    expect(r.incassoCopertoCents).toBe(1000);
    expect(r.foodCostPct).toBe(30);
    expect(r.coperturaPct).toBe(50);
  });

  it("i piatti senza costo restano in un elenco a parte, non spariscono", async () => {
    const senza = await piatto("Senza costo", 1200);
    await contoChiuso([{ menuItemId: senza.id, quantity: 2 }]);

    const r = await getFoodCost(venueId, DA, A);
    expect(r.piatti).toHaveLength(0);
    expect(r.senzaCosto).toHaveLength(1);
    expect(r.senzaCosto[0].incassoCents).toBe(2400);
    expect(r.senzaCosto[0].costoCents).toBeNull();
    // Nessun costo dichiarato: nessuna percentuale, nemmeno zero.
    expect(r.foodCostPct).toBeNull();
  });

  it("il fuori carta si conta come tale: un costo non può averlo", async () => {
    const p = await piatto("Con costo", 1000, 400);
    await contoChiuso([{ menuItemId: p.id }, { name: "Zuppa del giorno", priceCents: 700 }]);

    const r = await getFoodCost(venueId, DA, A);
    expect(r.incassoCents).toBe(1700);
    expect(r.fuoriCartaCents).toBe(700);
    // La riga a mano non entra né fra i coperti né fra quelli da completare:
    // non c'è nessun costo da mettere.
    expect(r.incassoCopertoCents).toBe(1000);
    expect(r.senzaCosto).toHaveLength(0);
  });
});

describe("confini", () => {
  it("fuori dal periodo non si conta", async () => {
    const p = await piatto("Tagliatelle", 1000, 300);
    const c = await contoChiuso([{ menuItemId: p.id }]);
    await db.order.update({
      where: { id: c.id },
      data: { completedAt: new Date("2026-08-01T20:00:00.000Z") },
    });

    expect((await getFoodCost(venueId, DA, A)).conti).toBe(0);
  });

  it("i conti di un altro locale non entrano", async () => {
    const p = await piatto("Tagliatelle", 1000, 300);
    await contoChiuso([{ menuItemId: p.id }]);
    expect((await getFoodCost(altroVenueId, DA, A)).conti).toBe(0);
  });
});
