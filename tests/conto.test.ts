import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem, updateItem } from "@/server/menu";
import {
  addLine,
  cancelOrder,
  closeOrder,
  getOrderForBooking,
  incassoDelGiorno,
  openOrderForBooking,
  setLineQuantity,
} from "@/server/orders";

/**
 * Il conto del tavolo — secondo anello di menu → ordini → costo del cibo, e
 * il primo punto in cui questa applicazione smette di stimare.
 *
 * Le prove guardano quello che, sbagliato, costa soldi a qualcuno:
 *
 * - **un conto solo per tavolo**: due camerieri che premono «conto» non
 *   devono creare due totali;
 * - **il prezzo si fotografa**: alzare il prezzo di un piatto domani non deve
 *   riscrivere il conto di ieri;
 * - **il totale è la somma delle righe**, sempre;
 * - **un conto vuoto non fa incasso**, e un conto annullato nemmeno.
 */

const db = new PrismaClient();
const PREFISSO = "test-conto-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
let bookingId = "";
let categoriaId = "";
const TZ = "Europe/Rome";

/**
 * «Oggi» nel fuso del **locale**, non in quello del processo.
 *
 * I test girano con TZ=UTC: fra mezzanotte e le due, ora di Roma, la data UTC
 * è ancora quella di ieri, e la prova chiedeva l'incasso di un giorno diverso
 * da quello in cui aveva appena chiuso i conti. Passava di giorno e falliva
 * la notte — che è il difetto peggiore di un test.
 */
function oggiInSala() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

async function prenotazione(venue = venueId) {
  return db.booking.create({
    data: { venueId: venue, partySize: 2, startsAt: new Date(), status: "SEATED", source: "PHONE" },
  });
}

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
  await db.orderItem.deleteMany({ where: { Order: { venueId: { in: [venueId, altroVenueId] } } } });
  await db.order.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuItemCost.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuItem.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuCategory.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });

  bookingId = (await prenotazione()).id;
  categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const piatto = (extra: Record<string, unknown> = {}) =>
  createItem(venueId, { categoryId: categoriaId, name: "Tagliatelle", priceCents: 1400, ...extra });

/* -------------------------------------------------------------------------- */

describe("aprire", () => {
  it("un conto solo per tavolo, anche premendo due volte", async () => {
    const primo = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    const secondo = await openOrderForBooking(venueId, bookingId);
    // Due totali a fine serata e nessuno sa quale sia quello giusto.
    expect(secondo.id).toBe(primo.id);
    expect(await db.order.count({ where: { venueId, bookingId } })).toBe(1);
  });

  it("nasce vuoto, aperto e senza nome del cliente inventato", async () => {
    const c = await openOrderForBooking(venueId, bookingId);
    expect(c.righe).toHaveLength(0);
    expect(c.totalCents).toBe(0);
    expect(c.aperto).toBe(true);

    const riga = await db.order.findFirstOrThrow({ where: { id: c.id } });
    // Per un conto al tavolo il cliente è la prenotazione: nome e telefono
    // restano vuoti invece di essere riempiti con qualcosa di finto.
    expect(riga.customerName).toBeNull();
    expect(riga.phone).toBeNull();
    expect(riga.kind).toBe("TABLE");
  });

  it("il riferimento contiene la data e un numero progressivo", async () => {
    const c = await openOrderForBooking(venueId, bookingId);
    expect(c.reference).toMatch(/^\d{8}-\d{3}$/);
  });

  it("la prenotazione di un altro locale non apre niente", async () => {
    const altrui = await prenotazione(altroVenueId);
    await expect(openOrderForBooking(venueId, altrui.id)).rejects.toThrow("not_found");
  });
});

describe("battere i piatti", () => {
  it("il prezzo si fotografa quando si ordina", async () => {
    const p = await piatto();
    const c = await openOrderForBooking(venueId, bookingId);
    await addLine(venueId, c.id, { menuItemId: p.id, quantity: 2 });

    // Domani il piatto costa due euro in più: il conto di stasera non cambia.
    await updateItem(venueId, p.id, { priceCents: 1600 });

    const dopo = await getOrderForBooking(venueId, bookingId);
    expect(dopo?.righe[0].priceCents).toBe(1400);
    expect(dopo?.totalCents).toBe(2800);
  });

  it("un piatto segnato finito non si ordina", async () => {
    const p = await piatto({ available: false });
    const c = await openOrderForBooking(venueId, bookingId);
    await expect(addLine(venueId, c.id, { menuItemId: p.id })).rejects.toThrow("not_available");
  });

  it("il fuori carta si scrive a mano", async () => {
    const c = await openOrderForBooking(venueId, bookingId);
    const dopo = await addLine(venueId, c.id, { name: "Zuppa del giorno", priceCents: 900 });
    expect(dopo.righe[0].name).toBe("Zuppa del giorno");
    expect(dopo.righe[0].menuItemId).toBeNull();
    expect(dopo.totalCents).toBe(900);
  });

  it("una riga senza nome né piatto non si aggiunge", async () => {
    const c = await openOrderForBooking(venueId, bookingId);
    await expect(addLine(venueId, c.id, { priceCents: 500 })).rejects.toThrow();
  });

  it("il totale è sempre la somma delle righe", async () => {
    const a = await piatto({ name: "Uno", priceCents: 1000 });
    const b = await piatto({ name: "Due", priceCents: 550 });
    const c = await openOrderForBooking(venueId, bookingId);

    await addLine(venueId, c.id, { menuItemId: a.id, quantity: 3 });
    const dopo = await addLine(venueId, c.id, { menuItemId: b.id, quantity: 2 });
    expect(dopo.totalCents).toBe(3 * 1000 + 2 * 550);

    // E la colonna in tabella dice la stessa cosa di quello che mostriamo.
    const riga = await db.order.findFirstOrThrow({ where: { id: c.id } });
    expect(riga.totalCents).toBe(dopo.totalCents);
  });

  it("la quantità si cambia, e a zero la riga se ne va", async () => {
    const p = await piatto();
    const c = await openOrderForBooking(venueId, bookingId);
    const conRiga = await addLine(venueId, c.id, { menuItemId: p.id, quantity: 1 });

    const su = await setLineQuantity(venueId, c.id, conRiga.righe[0].id, 4);
    expect(su.totalCents).toBe(5600);

    const via = await setLineQuantity(venueId, c.id, conRiga.righe[0].id, 0);
    expect(via.righe).toHaveLength(0);
    expect(via.totalCents).toBe(0);
  });

  it("il conto di un altro locale non si tocca", async () => {
    const altrui = await prenotazione(altroVenueId);
    const suo = await openOrderForBooking(altroVenueId, altrui.id);
    await expect(addLine(venueId, suo.id, { name: "Intruso", priceCents: 100 })).rejects.toThrow("not_found");
  });
});

describe("chiudere", () => {
  it("un conto vuoto non si chiude: sarebbe un incasso da zero euro", async () => {
    const c = await openOrderForBooking(venueId, bookingId);
    await expect(closeOrder(venueId, c.id)).rejects.toThrow("empty_order");
  });

  it("chiuso, non si tocca più", async () => {
    const p = await piatto();
    const c = await openOrderForBooking(venueId, bookingId);
    await addLine(venueId, c.id, { menuItemId: p.id });
    const chiuso = await closeOrder(venueId, c.id, { actor: attore() });

    expect(chiuso.aperto).toBe(false);
    expect(chiuso.closedAt).not.toBeNull();
    await expect(addLine(venueId, c.id, { menuItemId: p.id })).rejects.toThrow("already_closed");
    await expect(closeOrder(venueId, c.id)).rejects.toThrow("already_closed");
  });

  it("dopo la chiusura la prenotazione non ha più un conto aperto", async () => {
    const p = await piatto();
    const c = await openOrderForBooking(venueId, bookingId);
    await addLine(venueId, c.id, { menuItemId: p.id });
    await closeOrder(venueId, c.id);
    expect(await getOrderForBooking(venueId, bookingId)).toBeNull();
  });

  it("annullare lascia la traccia e non fa incasso", async () => {
    const p = await piatto();
    const c = await openOrderForBooking(venueId, bookingId);
    await addLine(venueId, c.id, { menuItemId: p.id });
    const annullato = await cancelOrder(venueId, c.id, { actor: attore() });

    expect(annullato.status).toBe("CANCELLED");
    expect(await db.order.count({ where: { id: c.id } })).toBe(1);

    const oggi = oggiInSala();
    expect((await incassoDelGiorno(venueId, oggi, TZ)).conti).toBe(0);
  });
});

describe("l'incasso della giornata", () => {
  async function contoChiuso(prezzo: number, quantita = 1, costo?: number) {
    const p = await piatto({ name: `P${prezzo}-${Math.random()}`, priceCents: prezzo, ...(costo != null ? { costCents: costo } : {}) });
    const b = await prenotazione();
    const c = await openOrderForBooking(venueId, b.id);
    await addLine(venueId, c.id, { menuItemId: p.id, quantity: quantita });
    return closeOrder(venueId, c.id);
  }

  it("nessun conto chiuso non vuol dire zero euro", async () => {
    const oggi = oggiInSala();
    const esito = await incassoDelGiorno(venueId, oggi, TZ);
    // È la distinzione che questo progetto ha passato giorni a rimettere a
    // posto: «non lo sappiamo» non è «zero».
    expect(esito.conti).toBe(0);
    expect(esito.totalCents).toBe(0);
    expect(esito.costoCents).toBeNull();
  });

  it("somma i conti chiusi della giornata", async () => {
    await contoChiuso(1400, 2);
    await contoChiuso(900);
    const oggi = oggiInSala();
    const esito = await incassoDelGiorno(venueId, oggi, TZ);
    expect(esito.conti).toBe(2);
    expect(esito.totalCents).toBe(2 * 1400 + 900);
  });

  it("porta anche il costo, e dice su quante righe lo conosce", async () => {
    await contoChiuso(1400, 2, 350);
    await contoChiuso(900); // senza costo dichiarato
    const oggi = oggiInSala();
    const esito = await incassoDelGiorno(venueId, oggi, TZ);

    expect(esito.costoCents).toBe(2 * 350);
    // Due piatti su tre hanno un costo: un food cost calcolato sulla metà dei
    // piatti va detto, non arrotondato.
    expect(esito.righeConCosto).toBe(2);
    expect(esito.righeTotali).toBe(3);
  });

  it("i conti di un altro locale non entrano", async () => {
    await contoChiuso(1400);
    const oggi = oggiInSala();
    expect((await incassoDelGiorno(altroVenueId, oggi, TZ)).conti).toBe(0);
  });
});

describe("il numero del conto", () => {
  it("non ricade su uno già usato dopo che un conto è stato cancellato", async () => {
    // Il numero era «quanti conti ci sono oggi»: cancellare un conto faceva
    // scendere il conteggio, e il conto successivo nasceva con un riferimento
    // già preso. `Order.reference` è unico, quindi non usciva un numero
    // doppio: usciva un errore in faccia a chi apre il conto.
    const primo = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    const secondaPrenotazione = (await prenotazione()).id;
    const secondo = await openOrderForBooking(venueId, secondaPrenotazione, { actor: attore() });
    expect(secondo.reference).not.toBe(primo.reference);

    await db.order.delete({ where: { id: secondo.id } });

    const terzaPrenotazione = (await prenotazione()).id;
    const terzo = await openOrderForBooking(venueId, terzaPrenotazione, { actor: attore() });
    expect(terzo.reference).not.toBe(primo.reference);
    // Il numero riparte dal più alto già usato, quindi il buco non si riempie.
    expect(terzo.reference).toBe(secondo.reference);
  });

  it("dà numeri diversi a due locali che aprono il loro primo conto oggi", async () => {
    // Il vincolo di unicità è su tutta l'installazione: senza un tentativo
    // col numero dopo, il secondo locale non riuscirebbe ad aprire niente.
    const qui = await openOrderForBooking(venueId, bookingId, { actor: attore() });
    const laBooking = await prenotazione(altroVenueId);
    const la = await openOrderForBooking(altroVenueId, laBooking.id);
    expect(la.reference).not.toBe(qui.reference);
  });
});
