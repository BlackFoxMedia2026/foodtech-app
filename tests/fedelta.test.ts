import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem } from "@/server/menu";
import { addLine, closeOrder, incassoDelGiorno, openOrderForBooking } from "@/server/orders";
import {
  LoyaltyError,
  getSaldoFedelta,
  puntiDi,
  puntiPerCentesimi,
  regoleFedelta,
  rettificaPunti,
  riscattaPunti,
  setRegoleFedelta,
  valoreInCentesimi,
} from "@/server/loyalty";

/**
 * La raccolta punti.
 *
 * Le prove guardano quello che, sbagliato, costa soldi o fa litigare con un
 * cliente:
 *
 * - **i punti nascono dai conti chiusi**, non dalle visite né da una spesa
 *   stimata: è la ragione per cui questa funzione arriva solo ora;
 * - **chiudere due volte lo stesso conto non raddoppia i punti**;
 * - **il saldo è la somma delle righe**, e il contatore su `Guest` la segue;
 * - **non si va sotto zero**, nemmeno con una correzione a mano;
 * - **senza entrambe le regole la raccolta è spenta** e non accumula niente;
 * - **il valore di uno sconto si fotografa**: cambiare domani quanto vale un
 *   punto non deve riscrivere il conto di stasera.
 */

const db = new PrismaClient();
const PREFISSO = "test-fedelta-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let guestId = "";
let bookingId = "";
let piattoId = "";
const TZ = "Europe/Rome";

const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: TZ },
    })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.loyaltyTransaction.deleteMany({ where: { venueId } });
  await db.orderItem.deleteMany({ where: { Order: { venueId } } });
  await db.order.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.menuItem.deleteMany({ where: { venueId } });
  await db.menuCategory.deleteMany({ where: { venueId } });

  // Un punto per euro, un punto vale 5 centesimi: restituisce il 5%.
  await setRegoleFedelta(venueId, { puntiPerEuro: 1, valorePuntoCents: 5 });

  guestId = (await db.guest.create({ data: { venueId, firstName: "Marco" } })).id;
  bookingId = (
    await db.booking.create({
      data: { venueId, guestId, partySize: 2, startsAt: new Date(), status: "SEATED", source: "PHONE" },
    })
  ).id;
  const categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
  piattoId = (await createItem(venueId, { categoryId: categoriaId, name: "Tagliatelle", priceCents: 1500 })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
});

/** Un conto chiuso da `quante` porzioni di tagliatelle. */
async function contoChiuso(quante: number) {
  const conto = await openOrderForBooking(venueId, bookingId, { actor: attore() });
  await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: quante }, { actor: attore() });
  return closeOrder(venueId, conto.id, { actor: attore() });
}

describe("le regole", () => {
  it("servono entrambe: metà raccolta non si accende", async () => {
    await expect(setRegoleFedelta(venueId, { puntiPerEuro: 2, valorePuntoCents: null })).rejects.toThrow();

    // E se una arriva a zero, si spengono entrambe: nessun cliente accumula
    // punti che non potrebbe spendere.
    await setRegoleFedelta(venueId, { puntiPerEuro: 0, valorePuntoCents: 0 });
    const venue = await db.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { loyaltyPointsPerEuro: true, loyaltyPointValueCents: true },
    });
    expect(regoleFedelta(venue)).toBeNull();
  });

  it("convertono punti ed euro senza regalare niente", () => {
    const regole = { puntiPerEuro: 1, valorePuntoCents: 5 };
    expect(valoreInCentesimi(40, regole)).toBe(200);
    // Per scontare 12 centesimi servono 3 punti, non 2: la differenza la
    // pagherebbe il locale.
    expect(puntiPerCentesimi(12, regole)).toBe(3);
  });
});

describe("guadagnare punti", () => {
  it("li accredita chiudendo il conto, sugli euro interi", async () => {
    // Due tagliatelle: 30,00 € → 30 punti.
    const chiuso = await contoChiuso(2);
    expect(chiuso.puntiAccreditati?.punti).toBe(30);
    expect(await puntiDi(guestId)).toBe(30);

    const ospite = await db.guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(ospite.loyaltyPoints).toBe(30);
  });

  it("non li accredita due volte per lo stesso conto", async () => {
    const conto = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() });
    await closeOrder(venueId, conto.id, { actor: attore() });

    // Chiudere un conto già chiuso è un errore, ma la difesa vera sta sul
    // conto: anche se qualcuno rieseguisse l'accredito, i punti non salgono.
    await expect(closeOrder(venueId, conto.id, { actor: attore() })).rejects.toThrow();
    expect(await puntiDi(guestId)).toBe(30);
  });

  it("non accredita niente a un tavolo senza cliente", async () => {
    const senzaOspite = await db.booking.create({
      data: { venueId, partySize: 2, startsAt: new Date(), status: "SEATED", source: "PHONE" },
    });
    const conto = await openOrderForBooking(venueId, senzaOspite.id, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() });
    const chiuso = await closeOrder(venueId, conto.id, { actor: attore() });

    expect(chiuso.puntiAccreditati).toBeNull();
    expect(await db.loyaltyTransaction.count({ where: { venueId } })).toBe(0);
  });

  it("non accredita niente se la raccolta è spenta", async () => {
    await setRegoleFedelta(venueId, { puntiPerEuro: null, valorePuntoCents: null });
    const chiuso = await contoChiuso(2);
    expect(chiuso.puntiAccreditati).toBeNull();
    expect(await puntiDi(guestId)).toBe(0);
  });
});

describe("usare i punti", () => {
  it("sconta, abbassa il saldo e fotografa il valore", async () => {
    await contoChiuso(4); // 60,00 € → 60 punti

    const esito = await riscattaPunti(
      venueId,
      { guestId, punti: 40 },
      { actor: attore() },
    );
    expect(esito.scontoCents).toBe(200);
    expect(esito.saldo).toBe(20);
    expect(await puntiDi(guestId)).toBe(20);

    const movimento = await db.loyaltyTransaction.findFirstOrThrow({
      where: { venueId, guestId, kind: "REDEEMED" },
    });
    // Il riscatto è negativo: il saldo è la somma con il segno.
    expect(movimento.points).toBe(-40);
    expect(movimento.amountCents).toBe(200);

    // Cambiare le regole dopo non riscrive il passato.
    await setRegoleFedelta(venueId, { puntiPerEuro: 1, valorePuntoCents: 20 });
    const dopo = await db.loyaltyTransaction.findUniqueOrThrow({ where: { id: movimento.id } });
    expect(dopo.amountCents).toBe(200);
  });

  it("rifiuta più punti di quelli che il cliente ha", async () => {
    await contoChiuso(1); // 15,00 € → 15 punti
    await expect(riscattaPunti(venueId, { guestId, punti: 100 })).rejects.toMatchObject({
      code: "not_enough_points",
    });
    expect(await puntiDi(guestId)).toBe(15);
  });

  it("rifiuta se la raccolta è spenta", async () => {
    await contoChiuso(2);
    await setRegoleFedelta(venueId, { puntiPerEuro: null, valorePuntoCents: null });
    await expect(riscattaPunti(venueId, { guestId, punti: 10 })).rejects.toMatchObject({
      code: "loyalty_off",
    });
  });

  it("non riscatta i punti di un cliente di un altro locale", async () => {
    const altro = await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}x${Date.now()}`, timezone: TZ },
    });
    await expect(riscattaPunti(altro.id, { guestId, punti: 1 })).rejects.toBeInstanceOf(LoyaltyError);
    await db.venue.delete({ where: { id: altro.id } });
  });
});

describe("correggere a mano", () => {
  it("aggiunge con un motivo scritto e aggiorna il contatore", async () => {
    await rettificaPunti(venueId, { guestId, punti: 50, reason: "Cena pagata senza tessera" }, { actor: attore() });
    expect(await puntiDi(guestId)).toBe(50);
    const ospite = await db.guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(ospite.loyaltyPoints).toBe(50);
  });

  it("non porta il saldo sotto zero", async () => {
    await rettificaPunti(venueId, { guestId, punti: 10, reason: "gesto commerciale" });
    await expect(
      rettificaPunti(venueId, { guestId, punti: -50, reason: "errore" }),
    ).rejects.toMatchObject({ code: "not_enough_points" });
    expect(await puntiDi(guestId)).toBe(10);
  });

  it("pretende un motivo", async () => {
    await expect(rettificaPunti(venueId, { guestId, punti: 10, reason: "  " })).rejects.toMatchObject({
      code: "invalid_points",
    });
  });
});

describe("la scheda del cliente", () => {
  it("mostra saldo, valore e storia", async () => {
    await contoChiuso(2);
    await riscattaPunti(venueId, { guestId, punti: 10 });

    const saldo = await getSaldoFedelta(venueId, guestId);
    expect(saldo.attiva).toBe(true);
    expect(saldo.punti).toBe(20);
    expect(saldo.valoreCents).toBe(100);
    expect(saldo.movimenti).toHaveLength(2);
  });
});

describe("l'incasso della giornata", () => {
  it("separa quello che è entrato da quello che è stato scontato", async () => {
    await contoChiuso(4); // 60,00 € chiusi, 60 punti guadagnati

    // Sul conto successivo si usano 40 punti: 2,00 € di sconto.
    const secondo = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    await addLine(venueId, secondo.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() });
    await riscattaPunti(venueId, { guestId, punti: 40, orderId: secondo.id }, { actor: attore() });
    await closeOrder(venueId, secondo.id, { actor: attore() });

    const giorno = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
    const incasso = await incassoDelGiorno(venueId, giorno, TZ);

    // Servito: 90,00 €. Scontato in punti: 2,00 €. Entrato oggi: 88,00 €.
    expect(incasso.totalCents).toBe(9000);
    expect(incasso.scontiPuntiCents).toBe(200);
    expect(incasso.incassatoCents).toBe(8800);
    expect(incasso.conti).toBe(2);
  });
});
