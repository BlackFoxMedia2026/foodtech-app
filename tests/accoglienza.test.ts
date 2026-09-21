import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { accomoda, AccoglienzaError, propostePerOspite } from "@/server/staff-app/accoglienza";
import { ospitiDaAccomodare } from "@/server/staff-app/da-accomodare";
import { BookingAssignError } from "@/server/booking-floor";

/**
 * **Accomodare**: il gesto che tocca due tabelle e che, sbagliato, mette due
 * tavolate sulle stesse sedie.
 *
 * Le prove guardano quello che si vede in sala quando va male:
 *
 * - **la coda dell'ingresso è ordinata per attesa**, non per orario
 *   prenotato: chi è in piedi da dieci minuti va servito prima di chi ha
 *   prenotato più presto e si è presentato adesso;
 * - **accomodare scrive tutto insieme**: tavolo, stato, ora effettiva. Otto
 *   cose che prima erano otto gesti, e che se si scollegano producono il
 *   difetto peggiore di questo prodotto — un tavolo che risulta libero con
 *   gente sopra;
 * - **due camerieri non accomodano sullo stesso tavolo**. Il conflitto lo
 *   rileva la transazione di `assignBookingToTable`, e questa prova esiste
 *   per garantire che la strada nuova ci passi davvero invece di scrivere a
 *   mano su `Booking`;
 * - **i posti che non bastano richiedono un motivo scritto**: sei persone su
 *   un quattro posti può essere la scelta giusta, ma deve restare detta.
 *
 * Il suggerimento in sé — quale tavolo è il migliore — si prova senza
 * database in `tests/suggerimento-tavolo.test.ts`: qui si verifica solo che i
 * fatti veri della sala arrivino dentro quel giudizio.
 */

const db = new PrismaClient();
const PREFISSO = "test-accoglienza-";
const TZ = "Europe/Rome";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let roomId = "";
let waiterId = "";
let t2 = "";
let t4 = "";
let t6 = "";

/** Mezzogiorno di oggi: dentro la giornata di `startOfDay`/`endOfDay` con ogni fuso. */
const adesso = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();

const fra = (minuti: number) => new Date(adesso.getTime() + minuti * 60_000);

const ctx = () => ({ venueId, timezone: TZ, waiterId });
const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

async function ospite(cognome: string) {
  return db.guest.create({
    data: { venueId, firstName: "Mario", lastName: cognome },
  });
}

async function arrivato(opts: {
  cognome: string;
  coperti: number;
  arrivatoDaMin: number;
  ora?: Date;
  tableId?: string;
}) {
  const g = await ospite(opts.cognome);
  return db.booking.create({
    data: {
      venueId,
      guestId: g.id,
      partySize: opts.coperti,
      startsAt: opts.ora ?? adesso,
      status: "ARRIVED",
      source: "PHONE",
      arrivedAt: fra(-opts.arrivatoDaMin),
      ...(opts.tableId ? { tableId: opts.tableId } : {}),
    },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: TZ },
    })
  ).id;
  roomId = (await db.room.create({ data: { venueId, name: "Sala principale" } })).id;
  waiterId = (
    await db.waiter.create({
      data: {
        venueId,
        firstName: "Giulia",
        lastName: "Neri",
        birthday: new Date("1990-01-01"),
        phone: "+39000",
        role: "Cameriere",
        primaryRole: "CAMERIERE",
      },
    })
  ).id;

  const tavolo = (label: string, seats: number) =>
    db.table.create({ data: { venueId, roomId, label, seats } }).then((t) => t.id);
  t2 = await tavolo("T2", 2);
  t4 = await tavolo("T4", 4);
  t6 = await tavolo("T6", 6);
});

beforeEach(async () => {
  /* Le prenotazioni si rifanno a ogni prova: una seduta lasciata in giro
     renderebbe occupato un tavolo che la prova dopo si aspetta libero. */
  await db.bookingEvent.deleteMany({ where: { Booking: { venueId } } });
  await db.booking.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.bookingEvent.deleteMany({ where: { Booking: { venueId } } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.table.deleteMany({ where: { venueId } });
  await db.room.deleteMany({ where: { venueId } });
  await db.venue.deleteMany({ where: { orgId } });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("la coda dell'ingresso", () => {
  it("elenca chi è arrivato e non è ancora seduto", async () => {
    await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 2 });
    const coda = await ospitiDaAccomodare(venueId, TZ, adesso);

    expect(coda).toHaveLength(1);
    expect(coda[0].nome).toBe("Rossi");
    expect(coda[0].coperti).toBe(4);
    expect(coda[0].attesaMin).toBe(2);
  });

  it("mette davanti chi aspetta da più tempo, non chi ha prenotato prima", async () => {
    await arrivato({ cognome: "Primo", coperti: 2, arrivatoDaMin: 1, ora: fra(-60) });
    await arrivato({ cognome: "Secondo", coperti: 2, arrivatoDaMin: 12 });

    const coda = await ospitiDaAccomodare(venueId, TZ, adesso);
    expect(coda.map((o) => o.nome)).toEqual(["Secondo", "Primo"]);
    expect(coda[0].attesaLunga).toBe(true);
    expect(coda[1].attesaLunga).toBe(false);
  });

  it("non elenca chi è già seduto né chi non è ancora arrivato", async () => {
    const g = await ospite("Seduto");
    await db.booking.create({
      data: {
        venueId,
        guestId: g.id,
        partySize: 2,
        startsAt: adesso,
        status: "SEATED",
        source: "PHONE",
        tableId: t2,
      },
    });
    await db.booking.create({
      data: { venueId, partySize: 2, startsAt: fra(60), status: "CONFIRMED", source: "PHONE" },
    });

    expect(await ospitiDaAccomodare(venueId, TZ, adesso)).toHaveLength(0);
  });
});

describe("il suggerimento legge la sala vera", () => {
  it("propone il tavolo dei posti esatti e non il più grande", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    const { proposta } = await propostePerOspite(ctx(), b.id, adesso);

    expect(proposta.migliore?.label).toBe("T4");
    expect(proposta.alternative.map((t) => t.label)).toContain("T6");
  });

  it("scarta il tavolo che ha una prenotazione troppo vicina", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    /* Fra mezz'ora su T4 arriva qualcun altro: una cena da 105 minuti non ci
       sta, e finora nessuna schermata lo diceva a chi stava decidendo. */
    await db.booking.create({
      data: { venueId, partySize: 4, startsAt: fra(30), status: "CONFIRMED", source: "PHONE", tableId: t4 },
    });

    const { proposta } = await propostePerOspite(ctx(), b.id, adesso);
    expect(proposta.migliore?.label).toBe("T6");
    expect(proposta.tutti.find((t) => t.label === "T4")?.idoneita).toBe("STRETTO");
  });

  it("non offre un tavolo su cui c'è già gente seduta", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    await db.booking.create({
      data: { venueId, partySize: 4, startsAt: adesso, status: "SEATED", source: "PHONE", tableId: t4 },
    });

    const { proposta } = await propostePerOspite(ctx(), b.id, adesso);
    expect(proposta.tutti.find((t) => t.label === "T4")?.idoneita).toBe("OCCUPATO");
    expect(proposta.migliore?.label).toBe("T6");
  });

  it("preferisce il tavolo già scritto sulla prenotazione", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1, tableId: t6 });
    const { proposta } = await propostePerOspite(ctx(), b.id, adesso);

    /* T6 spreca due posti e vince comunque: qualcuno quel tavolo l'aveva
       scelto, e disfare quella decisione senza motivo fa litigare la sala col
       registro. */
    expect(proposta.migliore?.label).toBe("T6");
  });

  it("rifiuta di proporre tavoli per chi è già a tavola", async () => {
    const g = await ospite("Seduto");
    const b = await db.booking.create({
      data: {
        venueId,
        guestId: g.id,
        partySize: 2,
        startsAt: adesso,
        status: "SEATED",
        source: "PHONE",
        tableId: t2,
      },
    });

    await expect(propostePerOspite(ctx(), b.id, adesso)).rejects.toThrow(AccoglienzaError);
  });
});

describe("accomodare", () => {
  it("scrive tavolo, stato e ora effettiva in un gesto", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 3 });
    const esito = await accomoda(ctx(), { bookingId: b.id, tableIds: [t4], actor: attore() });

    expect(esito.label).toBe("T4");
    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("SEATED");
    expect(dopo.tableId).toBe(t4);
    expect(dopo.seatedAt).not.toBeNull();
    /* L'ora dell'arrivo resta quella vera: non si sposta a adesso perché la
       persona si è seduta. */
    expect(dopo.arrivedAt?.getTime()).toBe(b.arrivedAt?.getTime());
  });

  it("lascia una traccia di chi ha accomodato e dove", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    await accomoda(ctx(), { bookingId: b.id, tableIds: [t4], actor: attore() });

    const eventi = await db.bookingEvent.findMany({ where: { bookingId: b.id } });
    const seduta = eventi.find((e) => e.message?.includes("T4"));
    expect(seduta).toBeDefined();
    expect(seduta?.actorId).toBe(waiterId);
  });

  it("il tavolo diventa occupato senza che nessuno lo scriva", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    await accomoda(ctx(), { bookingId: b.id, tableIds: [t4], actor: attore() });

    /* Nessuna colonna «stato del tavolo»: la prova che il tavolo è occupato è
       che il suggerimento per chiunque altro non lo offre più. */
    const altro = await arrivato({ cognome: "Bianchi", coperti: 4, arrivatoDaMin: 1 });
    const { proposta } = await propostePerOspite(ctx(), altro.id, adesso);
    expect(proposta.tutti.find((t) => t.label === "T4")?.idoneita).toBe("OCCUPATO");
  });

  it("due camerieri non accomodano sullo stesso tavolo", async () => {
    const primo = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    const secondo = await arrivato({ cognome: "Bianchi", coperti: 4, arrivatoDaMin: 1 });

    await accomoda(ctx(), { bookingId: primo.id, tableIds: [t4], actor: attore() });
    await expect(
      accomoda(ctx(), { bookingId: secondo.id, tableIds: [t4], actor: attore() }),
    ).rejects.toThrow(BookingAssignError);

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: secondo.id } });
    /* Il punto della prova: il secondo ospite resta **in coda**, non seduto a
       un tavolo che non ha ottenuto. */
    expect(dopo.status).toBe("ARRIVED");
    expect(dopo.tableId).toBeNull();
  });

  it("non accomoda due volte la stessa prenotazione", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    await accomoda(ctx(), { bookingId: b.id, tableIds: [t4], actor: attore() });

    await expect(
      accomoda(ctx(), { bookingId: b.id, tableIds: [t6], actor: attore() }),
    ).rejects.toThrow(AccoglienzaError);
  });

  it("i posti che non bastano richiedono un motivo scritto", async () => {
    const b = await arrivato({ cognome: "Gruppo", coperti: 6, arrivatoDaMin: 1 });

    await expect(
      accomoda(ctx(), { bookingId: b.id, tableIds: [t4], actor: attore() }),
    ).rejects.toMatchObject({ code: "capacity_mismatch" });

    await accomoda(ctx(), {
      bookingId: b.id,
      tableIds: [t4],
      forceReason: "Avviciniamo due sedie",
      actor: attore(),
    });

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("SEATED");
    expect(dopo.tableId).toBe(t4);
  });

  it("accosta due tavoli per una tavolata", async () => {
    /* Quattro persone, e i due grandi occupati: restano T2 e un altro due
       posti da accostare. */
    const b = await arrivato({ cognome: "Verdi", coperti: 4, arrivatoDaMin: 1 });
    const t2bis = (await db.table.create({ data: { venueId, roomId, label: "T3", seats: 2 } })).id;

    await accomoda(ctx(), { bookingId: b.id, tableIds: [t2, t2bis], actor: attore() });

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.tableId).toBe(t2);
    expect(dopo.combinedTableIds).toEqual([t2bis]);
    expect(dopo.status).toBe("SEATED");

    await db.table.delete({ where: { id: t2bis } });
  });

  it("senza tavolo non accomoda niente", async () => {
    const b = await arrivato({ cognome: "Rossi", coperti: 4, arrivatoDaMin: 1 });
    await expect(accomoda(ctx(), { bookingId: b.id, tableIds: [], actor: attore() })).rejects.toThrow(
      AccoglienzaError,
    );
  });
});
