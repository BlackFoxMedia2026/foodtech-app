import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { versioneServizio } from "@/server/versione-servizio";

/**
 * Il segnale che dice «è cambiato qualcosa nel servizio».
 *
 * Sala, Servizio e Attesa lo interrogano ogni cinque secondi e scaricano la
 * fotografia intera solo quando cambia. Quindi tutto dipende da una cosa:
 * **che cambi quando deve, e non cambi quando non deve.**
 *
 * Se cambiasse troppo, sarebbe una richiesta ogni cinque secondi per niente —
 * peggio dei trenta secondi di prima. Se non cambiasse quando serve, la sala
 * mostrerebbe una fotografia vecchia senza dirlo, che è il difetto peggiore
 * dei due: non si nota.
 */

const db = new PrismaClient();
const PREFISSO = "test-versione-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let guestId = "";
let tableId = "";

/** Un istante di oggi a un'ora in cui il locale è aperto. */
function oggiAlle(ora: number) {
  const d = new Date();
  d.setHours(ora, 0, 0, 0);
  return d;
}

async function prenotazione(quando: Date, venue = venueId) {
  return db.booking.create({
    data: {
      venueId: venue,
      guestId,
      tableId: venue === venueId ? tableId : null,
      partySize: 2,
      startsAt: quando,
      durationMin: 90,
      status: "CONFIRMED",
      source: "PHONE",
    },
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
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
  guestId = (
    await db.guest.create({ data: { venueId, firstName: "Prova", lastName: "Versione" } })
  ).id;
  tableId = (await db.table.create({ data: { venueId, label: "P1", seats: 2 } })).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("cambia quando deve", () => {
  it("una prenotazione nuova di oggi cambia il segnale", async () => {
    const prima = await versioneServizio(venueId);
    await prenotazione(oggiAlle(20));
    expect(await versioneServizio(venueId)).not.toBe(prima);
  });

  it("cambiare stato a una prenotazione di oggi cambia il segnale", async () => {
    const b = await prenotazione(oggiAlle(21));
    const prima = await versioneServizio(venueId);
    await db.booking.update({ where: { id: b.id }, data: { status: "SEATED" } });
    expect(await versioneServizio(venueId)).not.toBe(prima);
  });

  it("cancellare una prenotazione cambia il segnale, anche se non aggiorna niente", async () => {
    /*
      È la ragione per cui nel segnale c'è anche il **conteggio** e non solo
      «la riga toccata più di recente»: una riga che scompare non aggiorna
      nessun `updatedAt`, e con il solo massimo il segnale sarebbe rimasto
      identico mentre la sala era cambiata.
    */
    const b = await prenotazione(oggiAlle(22));
    const prima = await versioneServizio(venueId);
    await db.booking.update({ where: { id: b.id }, data: { deletedAt: new Date() } });
    expect(await versioneServizio(venueId)).not.toBe(prima);
  });

  it("qualcuno che si mette in coda cambia il segnale", async () => {
    const prima = await versioneServizio(venueId);
    await db.waitlistEntry.create({
      data: { venueId, guestName: "In coda", partySize: 3, status: "WAITING" },
    });
    expect(await versioneServizio(venueId)).not.toBe(prima);
  });

  it("un conto aperto cambia il segnale", async () => {
    const prima = await versioneServizio(venueId);
    await db.order.create({
      data: {
        venueId,
        // `reference` è il progressivo del conto, obbligatorio: qui basta che
        // sia unico, la regola vera (massimo+1) vive in server/orders.ts.
        reference: `${PREFISSO}${Date.now()}`,
        kind: "TABLE",
        status: "RECEIVED",
        scheduledAt: new Date(),
        totalCents: 1200,
      },
    });
    expect(await versioneServizio(venueId)).not.toBe(prima);
  });
});

describe("non cambia quando non deve", () => {
  it("due letture di seguito, senza che nulla si muova, danno lo stesso segnale", async () => {
    const a = await versioneServizio(venueId);
    expect(await versioneServizio(venueId)).toBe(a);
  });

  it("una prenotazione di domani non muove il segnale di oggi", async () => {
    /*
      Il segnale guarda **il servizio**, non l'archivio. Se cambiasse per una
      prenotazione presa per la settimana prossima, ogni telefonata farebbe
      riscaricare la mappa della sala a tutti i tablet: una richiesta ogni
      cinque secondi per un fatto che non riguarda nessuno di loro.
    */
    const prima = await versioneServizio(venueId);
    const domani = oggiAlle(20);
    domani.setDate(domani.getDate() + 1);
    await prenotazione(domani);
    expect(await versioneServizio(venueId)).toBe(prima);
  });

  it("quello che succede in un altro locale non muove il segnale di questo", async () => {
    // L'isolamento fra ristoranti non è solo una questione di permessi: se il
    // segnale fosse comune, la sala di un locale si riaggiornerebbe per il
    // lavoro di un altro, e a fine serata sarebbero migliaia di richieste.
    const prima = await versioneServizio(venueId);
    await prenotazione(oggiAlle(20), altroVenueId);
    expect(await versioneServizio(venueId)).toBe(prima);
  });

  it("una coda già chiusa non muove più il segnale", async () => {
    const riga = await db.waitlistEntry.create({
      data: { venueId, guestName: "Andato", partySize: 2, status: "SEATED" },
    });
    const prima = await versioneServizio(venueId);
    await db.waitlistEntry.update({ where: { id: riga.id }, data: { notes: "nota tardiva" } });
    expect(await versioneServizio(venueId)).toBe(prima);
  });
});
