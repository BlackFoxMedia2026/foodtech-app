import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { updateBooking } from "@/server/bookings";

/**
 * Gli orari del servizio seguono lo stato, **in entrambe le direzioni**.
 *
 * Prima andavano solo avanti: passando a «seduto» si scriveva l'istante, ma
 * tornando indietro non si cancellava. Una prenotazione segnata seduta per
 * sbaglio e riportata a «confermata» conservava l'ora in cui si era seduta.
 *
 * E quell'ora non è un dettaglio: `rotazione.ts` calcola da lì la durata che
 * il prodotto chiama **misurata**, e la sala viva ci dice «seduto da 45
 * minuti». Un errore di un secondo in sala inquinava per sempre la statistica
 * su cui si fonda la previsione di liberazione — senza nessun errore, senza
 * nessun test rosso, e senza che nessuno potesse accorgersene guardando.
 */

const db = new PrismaClient();
const PREFISSO = "test-orari-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";

/**
 * Una prenotazione di stasera, in uno stato di partenza — **su un tavolo suo**.
 *
 * Le prime versioni di questi test usavano un tavolo unico, e il motore di
 * disponibilità le rifiutava: «il tavolo O1 è già occupato in questo orario».
 * Aveva ragione lui. Un tavolo per prova, così ogni caso è indipendente e
 * nessuno verifica per sbaglio il conflitto invece degli orari.
 */
let contatore = 0;
async function prenotazione(status: "CONFIRMED" | "ARRIVED" | "SEATED" = "CONFIRMED") {
  const quando = new Date();
  quando.setHours(20, 0, 0, 0);
  const tavolo = await db.table.create({
    data: { venueId, label: `O${++contatore}`, seats: 4 },
  });
  return db.booking.create({
    data: {
      venueId,
      guestId,
      tableId: tavolo.id,
      partySize: 2,
      startsAt: quando,
      durationMin: 90,
      status,
      source: "PHONE",
      reference: `${PREFISSO}${Date.now()}${Math.random()}`,
    },
  });
}

async function leggi(id: string) {
  return db.booking.findUniqueOrThrow({
    where: { id },
    select: { status: true, arrivedAt: true, seatedAt: true, closedAt: true },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;
  guestId = (await db.guest.create({ data: { venueId, firstName: "Prova", lastName: "Orari" } })).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("andando avanti", () => {
  it("«arrivato» scrive l'ora dell'arrivo e non quella dell'accomodamento", async () => {
    const b = await prenotazione();
    await updateBooking(venueId, b.id, { status: "ARRIVED" });
    const dopo = await leggi(b.id);
    expect(dopo.arrivedAt).toBeInstanceOf(Date);
    expect(dopo.seatedAt).toBeNull();
    expect(dopo.closedAt).toBeNull();
  });

  it("«seduto» scrive l'accomodamento e **conserva** l'arrivo vero", async () => {
    const b = await prenotazione();
    await updateBooking(venueId, b.id, { status: "ARRIVED" });
    const arrivo = (await leggi(b.id)).arrivedAt!;
    await new Promise((r) => setTimeout(r, 10));
    await updateBooking(venueId, b.id, { status: "SEATED" });
    const dopo = await leggi(b.id);
    // Se l'arrivo si spostasse a «adesso», l'attesa fra arrivo e tavolo
    // sarebbe sempre zero — e quella è una misura che il prodotto mostra.
    expect(dopo.arrivedAt?.getTime()).toBe(arrivo.getTime());
    expect(dopo.seatedAt).toBeInstanceOf(Date);
  });

  it("un conto chiuso conserva arrivo e accomodamento: quella cena è avvenuta", async () => {
    const b = await prenotazione("SEATED");
    await updateBooking(venueId, b.id, { status: "COMPLETED" });
    const dopo = await leggi(b.id);
    expect(dopo.arrivedAt).toBeInstanceOf(Date);
    expect(dopo.seatedAt).toBeInstanceOf(Date);
    expect(dopo.closedAt).toBeInstanceOf(Date);
  });
});

describe("tornando indietro — è qui che stava il difetto", () => {
  it("da «seduto» a «confermata» l'ora dell'accomodamento si cancella", async () => {
    const b = await prenotazione();
    await updateBooking(venueId, b.id, { status: "SEATED" });
    expect((await leggi(b.id)).seatedAt).toBeInstanceOf(Date);

    await updateBooking(venueId, b.id, { status: "CONFIRMED" });
    const dopo = await leggi(b.id);
    expect(dopo.seatedAt).toBeNull();
    expect(dopo.arrivedAt).toBeNull();
  });

  it("chi non si è presentato non ha un'ora d'arrivo", async () => {
    /*
      Il caso che sporcava di più: si segna arrivato, poi si scopre che era un
      altro tavolo e si mette assenza. Restava un arrivo, e nelle statistiche
      quella persona risultava venuta **e** assente.
    */
    const b = await prenotazione("ARRIVED");
    await updateBooking(venueId, b.id, { status: "NO_SHOW" });
    const dopo = await leggi(b.id);
    expect(dopo.arrivedAt).toBeNull();
    expect(dopo.seatedAt).toBeNull();
    expect(dopo.closedAt).toBeInstanceOf(Date);
  });

  it("annullare una prenotazione seduta pulisce gli orari del servizio", async () => {
    const b = await prenotazione("SEATED");
    await updateBooking(venueId, b.id, { status: "CANCELLED" });
    const dopo = await leggi(b.id);
    expect(dopo.seatedAt).toBeNull();
    expect(dopo.closedAt).toBeInstanceOf(Date);
  });

  it("riaprire un conto chiuso toglie la chiusura", async () => {
    const b = await prenotazione("SEATED");
    await updateBooking(venueId, b.id, { status: "COMPLETED" });
    await updateBooking(venueId, b.id, { status: "SEATED" });
    const dopo = await leggi(b.id);
    expect(dopo.closedAt).toBeNull();
    expect(dopo.seatedAt).toBeInstanceOf(Date);
  });
});

describe("quando lo stato non cambia", () => {
  it("modificare le note non riscrive l'orologio", async () => {
    // Era il rischio della correzione: toccare gli orari a ogni modifica
    // sposterebbe l'accomodamento ogni volta che qualcuno aggiunge una nota.
    const b = await prenotazione("SEATED");
    await updateBooking(venueId, b.id, { status: "SEATED" });
    const prima = await leggi(b.id);
    await new Promise((r) => setTimeout(r, 10));
    await updateBooking(venueId, b.id, { notes: "una nota qualunque" });
    const dopo = await leggi(b.id);
    expect(dopo.seatedAt?.getTime()).toBe(prima.seatedAt?.getTime());
  });
});
