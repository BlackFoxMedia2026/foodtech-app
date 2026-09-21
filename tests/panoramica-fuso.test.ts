import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getOverview } from "@/server/insights";
import { capienzaDelGiorno, giornoDellaSettimana } from "@/server/capienza-giorno";

/**
 * La Panoramica mostra **la giornata del locale**, non quella del server.
 *
 * Il difetto: `getDay()`, `getHours()` e `startOfDay` rispondono nel fuso del
 * processo, e su Vercel il processo è in UTC. Domenica all'una di notte a Roma
 * è sabato 23:00 per il server, e la Panoramica mostrava i numeri di **ieri** —
 * coperti, occupazione, incasso stimato — fra mezzanotte e le due, cioè
 * nell'ora esatta in cui si chiudono i conti e qualcuno guarda com'è andata.
 *
 * Il locale di prova sta ad **Auckland**, dodici ore avanti: così la prova
 * cade in rosso sia su una macchina in UTC (come Vercel) sia su una a Roma.
 * Un test che passa solo perché la macchina ha il fuso giusto non prova
 * niente.
 */

const db = new PrismaClient();
const PREFISSO = "test-panoramica-fuso-";
const FUSO = "Pacific/Auckland";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";

/**
 * L'istante in cui si guarda: 13:00 UTC del 20 settembre 2026.
 *
 * Ad Auckland è già **l'una di notte del 21**; a Roma sono le 15:00 del 20.
 * Quindi «oggi» per il locale è il 21, e per chiunque altro il 20.
 */
const ADESSO = new Date("2026-09-20T13:00:00.000Z");

/** Una cena del 21 ad Auckland: 20:00 locali = 08:00 UTC del 21. */
const CENA_DI_OGGI = new Date("2026-09-21T08:00:00.000Z");
/** Una cena del 20 ad Auckland: 20:00 locali = 08:00 UTC del 20. */
const CENA_DI_IERI = new Date("2026-09-20T08:00:00.000Z");

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: FUSO },
  });
  venueId = v.id;

  /* Turni su tutti i giorni, con capienze **diverse** per giorno della
     settimana: è il modo di accorgersi se la capienza sommata è quella del
     giorno sbagliato. */
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: {
        venueId,
        name: "Cena",
        weekday,
        startMinute: 19 * 60,
        endMinute: 23 * 60,
        capacity: 10 + weekday,
      },
    });
  }

  const ospite = await db.guest.create({ data: { venueId, firstName: "Prova" } });
  await db.booking.create({
    data: {
      venueId,
      guestId: ospite.id,
      partySize: 4,
      startsAt: CENA_DI_OGGI,
      durationMin: 105,
      status: "CONFIRMED",
      source: "PHONE",
      reference: `${PREFISSO}oggi`,
    },
  });
  await db.booking.create({
    data: {
      venueId,
      guestId: ospite.id,
      partySize: 9,
      startsAt: CENA_DI_IERI,
      durationMin: 105,
      status: "CONFIRMED",
      source: "PHONE",
      reference: `${PREFISSO}ieri`,
    },
  });
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("la Panoramica all'una di notte", () => {
  it("conta le prenotazioni di oggi per il locale, non di ieri per il server", async () => {
    const p = await getOverview(venueId, ADESSO);

    // Oggi (21 ad Auckland): una prenotazione da 4. Ieri (20): una da 9.
    expect(p.todayBookings).toHaveLength(1);
    expect(p.totalCovers).toBe(4);
    expect(p.todayBookings[0]?.reference).toMatch(/oggi$/);
  });

  it("la capienza è quella del giorno del locale", async () => {
    /* Il 21 settembre 2026 è un lunedì (weekday 1 → capienza 11); il 20 è una
       domenica (weekday 0 → capienza 10). Un solo coperto di differenza nella
       capienza, ma è la differenza fra 36% e 40% di occupazione — e soprattutto
       dice quale giorno il programma crede che sia. */
    expect(giornoDellaSettimana(ADESSO, FUSO)).toBe(1);
    expect(giornoDellaSettimana(ADESSO, "UTC")).toBe(0);

    expect(await capienzaDelGiorno(venueId, ADESSO, FUSO)).toBe(11);

    const p = await getOverview(venueId, ADESSO);
    expect(p.occupancyPct).toBe(Math.round((4 / 11) * 100));
  });

  it("l'andamento della settimana mette la cena di ieri nel suo giorno", async () => {
    /* I sacchetti del grafico erano le date UTC: una cena delle 23:30 a Roma
       finiva nel giorno dopo. Qui la cena di ieri deve stare nel penultimo
       giorno, e quella di oggi nell'ultimo. */
    const p = await getOverview(venueId, ADESSO);
    const settimana = p.trend;
    expect(settimana).toHaveLength(7);
    expect(settimana[settimana.length - 1]?.covers).toBe(4);
    expect(settimana[settimana.length - 2]?.covers).toBe(9);
  });
});
