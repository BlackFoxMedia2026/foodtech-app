import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem } from "@/server/menu";
import { addLine, closeOrder, getOrder, incassoDelGiorno, openOrderForBooking } from "@/server/orders";
import {
  GiftCardError,
  cancelGiftCard,
  createGiftCard,
  debitoGiftCards,
  findGiftCardByCode,
  giftCardUsability,
  listGiftCards,
  redeemGiftCard,
  undoGiftCardRedemption,
} from "@/server/gift-cards";

/**
 * Le gift card: denaro già incassato.
 *
 * Le prove guardano quello che, sbagliato, fa perdere soldi al locale o li
 * ruba al cliente:
 *
 * - **il residuo è la somma delle righe**, e la colonna `balanceCents` la
 *   segue;
 * - **si usa in più volte**, e quello che resta resta;
 * - **non si scala più del residuo**, e l'errore dice quanto c'è;
 * - **annullare un utilizzo rimette i soldi sulla carta**, riportandola
 *   spendibile;
 * - **una carta di un altro locale non esiste**;
 * - una gift card **non è un incasso di oggi**: sposta il momento in cui il
 *   denaro è entrato, e i numeri della giornata devono dirlo.
 */

const db = new PrismaClient();
const PREFISSO = "test-giftcard-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
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
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}`, timezone: TZ },
    })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.giftCardRedemption.deleteMany({ where: { GiftCard: { venueId: { in: [venueId, altroVenueId] } } } });
  await db.giftCard.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.orderItem.deleteMany({ where: { Order: { venueId } } });
  await db.order.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.menuItem.deleteMany({ where: { venueId } });
  await db.menuCategory.deleteMany({ where: { venueId } });

  bookingId = (
    await db.booking.create({
      data: { venueId, partySize: 2, startsAt: new Date(), status: "SEATED", source: "PHONE" },
    })
  ).id;
  const categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
  piattoId = (await createItem(venueId, { categoryId: categoriaId, name: "Tagliatelle", priceCents: 1500 })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
});

const carta = (importoCents = 10_000) =>
  createGiftCard(venueId, { initialCents: importoCents }, { actor: attore() });

describe("emettere", () => {
  it("nasce attiva, col saldo pieno e un codice leggibile", async () => {
    const c = await carta(10_000);
    expect(c.status).toBe("ACTIVE");
    expect(c.balanceCents).toBe(10_000);
    // Nessuna lettera o cifra che si confonda al telefono: O/0, I/1/L, S/5.
    expect(c.code).toMatch(/^REGALO-[ABCDEFGHJKMNPQRTUVWXYZ2346789]{8}$/);
  });

  it("rifiuta un importo che non ha senso", async () => {
    await expect(createGiftCard(venueId, { initialCents: 100 })).rejects.toThrow();
  });
});

describe("il residuo", () => {
  it("si calcola dalle righe, e la colonna lo segue", async () => {
    const c = await carta(10_000);
    await redeemGiftCard(venueId, { code: c.code, amountCents: 3_800 }, { actor: attore() });

    const vista = await findGiftCardByCode(venueId, c.code);
    expect(vista?.residuoCents).toBe(6_200);
    expect(vista?.spesoCents).toBe(3_800);
    expect(vista?.stato).toBe("usabile");

    const riga = await db.giftCard.findUniqueOrThrow({ where: { id: c.id } });
    expect(riga.balanceCents).toBe(6_200);
    expect(riga.status).toBe("ACTIVE");
  });

  it("si esaurisce solo quando finisce, e allora non si usa più", async () => {
    const c = await carta(5_000);
    await redeemGiftCard(venueId, { code: c.code, amountCents: 2_000 });
    await redeemGiftCard(venueId, { code: c.code, amountCents: 3_000 });

    const riga = await db.giftCard.findUniqueOrThrow({ where: { id: c.id } });
    expect(riga.balanceCents).toBe(0);
    expect(riga.status).toBe("EXHAUSTED");

    await expect(redeemGiftCard(venueId, { code: c.code, amountCents: 100 })).rejects.toMatchObject({
      code: "exhausted",
    });
  });

  it("non si scala più di quello che c'è, e l'errore dice quanto", async () => {
    const c = await carta(5_000);
    await redeemGiftCard(venueId, { code: c.code, amountCents: 4_000 });

    await expect(redeemGiftCard(venueId, { code: c.code, amountCents: 2_000 })).rejects.toMatchObject({
      code: "insufficient_balance",
      detail: { residuoCents: 1_000 },
    });

    // E niente è stato scalato a metà.
    expect((await findGiftCardByCode(venueId, c.code))?.residuoCents).toBe(1_000);
  });
});

describe("stati e scadenza", () => {
  it("una carta scaduta non si usa, e la scadenza si calcola dalla data", async () => {
    const ieri = new Date(Date.now() - 24 * 3600 * 1000);
    const c = await createGiftCard(venueId, { initialCents: 5_000, expiresAt: ieri });

    // Lo stato in colonna è ancora ACTIVE: «scaduta» dipende dall'orologio,
    // non da un campo che qualcuno deve ricordarsi di aggiornare.
    expect(c.status).toBe("ACTIVE");
    expect(giftCardUsability(c, { now: new Date(), spesoCents: 0 })).toMatchObject({ reason: "expired" });
    await expect(redeemGiftCard(venueId, { code: c.code, amountCents: 100 })).rejects.toMatchObject({
      code: "expired",
    });
  });

  it("una carta annullata non si usa più", async () => {
    const c = await carta(5_000);
    await cancelGiftCard(venueId, c.id, { actor: attore() });
    await expect(redeemGiftCard(venueId, { code: c.code, amountCents: 100 })).rejects.toMatchObject({
      code: "cancelled",
    });
  });

  it("non esiste, fuori dal suo locale", async () => {
    const c = await carta(5_000);
    expect(await findGiftCardByCode(altroVenueId, c.code)).toBeNull();
    await expect(redeemGiftCard(altroVenueId, { code: c.code, amountCents: 100 })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("annullare un utilizzo", () => {
  it("rimette i soldi sulla carta e la riporta spendibile", async () => {
    const c = await carta(5_000);
    const uso = await redeemGiftCard(venueId, { code: c.code, amountCents: 5_000 });
    expect((await db.giftCard.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("EXHAUSTED");

    await undoGiftCardRedemption(venueId, uso.utilizzoId, { actor: attore() });

    const riga = await db.giftCard.findUniqueOrThrow({ where: { id: c.id } });
    expect(riga.balanceCents).toBe(5_000);
    expect(riga.status).toBe("ACTIVE");

    // La storia conserva sia lo sbaglio sia la correzione: due righe, somma zero.
    const righe = await db.giftCardRedemption.findMany({ where: { giftCardId: c.id } });
    expect(righe).toHaveLength(2);
    expect(righe.reduce((s, r) => s + r.amountCents, 0)).toBe(0);
  });
});

describe("sul conto del tavolo", () => {
  it("copre una parte e lascia il resto da incassare", async () => {
    const c = await carta(2_000);
    const conto = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() }); // 30,00 €
    await redeemGiftCard(venueId, { code: c.code, amountCents: 2_000, orderId: conto.id }, { actor: attore() });

    const aggiornato = await getOrder(venueId, conto.id);
    expect(aggiornato?.totalCents).toBe(3_000);
    expect(aggiornato?.pagamenti.giftCardCents).toBe(2_000);
    expect(aggiornato?.pagamenti.daIncassareCents).toBe(1_000);
  });

  it("una carta più grande del conto non crea un credito al tavolo", async () => {
    const c = await carta(10_000);
    const conto = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 1 }, { actor: attore() }); // 15,00 €
    await redeemGiftCard(venueId, { code: c.code, amountCents: 1_500, orderId: conto.id });

    const aggiornato = await getOrder(venueId, conto.id);
    expect(aggiornato?.pagamenti.daIncassareCents).toBe(0);
    // E gli 85 € restano sulla carta, per un'altra volta.
    expect((await findGiftCardByCode(venueId, c.code))?.residuoCents).toBe(8_500);
  });

  it("non entra fra le righe del conto: le righe sono quello che si è mangiato", async () => {
    const c = await carta(2_000);
    const conto = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() });
    await redeemGiftCard(venueId, { code: c.code, amountCents: 2_000, orderId: conto.id });

    const aggiornato = await getOrder(venueId, conto.id);
    expect(aggiornato?.righe).toHaveLength(1);
    expect(aggiornato?.righe[0].menuItemId).toBe(piattoId);
  });

  it("sposta il momento dell'incasso, e la giornata lo dice", async () => {
    const c = await carta(2_000);
    const conto = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() });
    await redeemGiftCard(venueId, { code: c.code, amountCents: 2_000, orderId: conto.id });
    await closeOrder(venueId, conto.id, { actor: attore() });

    const giorno = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
    const incasso = await incassoDelGiorno(venueId, giorno, TZ);

    // Servito: 30,00 €. Già pagato prima: 20,00 €. Entrato stasera: 10,00 €.
    expect(incasso.totalCents).toBe(3_000);
    expect(incasso.giftCardCents).toBe(2_000);
    expect(incasso.incassatoCents).toBe(1_000);
  });
});

describe("il debito verso i clienti", () => {
  it("somma quello che resta da spendere sulle carte valide", async () => {
    const a = await carta(10_000);
    await carta(5_000);
    await redeemGiftCard(venueId, { code: a.code, amountCents: 4_000 });

    const scaduta = await createGiftCard(venueId, {
      initialCents: 3_000,
      expiresAt: new Date(Date.now() - 1000),
    });

    const debito = await debitoGiftCards(venueId);
    // 6.000 di a + 5.000 dell'altra. La scaduta non è più un debito.
    expect(debito.residuoCents).toBe(11_000);
    expect(debito.carte).toBe(2);
    expect(debito.venduteCents).toBe(18_000);
    expect(debito.usateCents).toBe(4_000);

    const elenco = await listGiftCards(venueId);
    expect(elenco.find((c) => c.id === scaduta.id)?.stato).toBe("expired");
  });
});

describe("errori", () => {
  it("un importo a zero o negativo non passa", async () => {
    const c = await carta(5_000);
    await expect(redeemGiftCard(venueId, { code: c.code, amountCents: 0 })).rejects.toBeInstanceOf(GiftCardError);
    await expect(redeemGiftCard(venueId, { code: c.code, amountCents: -100 })).rejects.toMatchObject({
      code: "invalid_amount",
    });
  });
});
