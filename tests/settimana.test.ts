import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getSettimana, lunediDella } from "@/server/booking-week";

/**
 * La settimana sui libri.
 *
 * Le prove guardano le tre cose che, sbagliate, farebbero rispondere male al
 * telefono:
 *
 * - **la settimana comincia lunedì**, anche quando si guarda da una domenica —
 *   che è il caso in cui un `weekday` a base zero fa cominciare la settimana
 *   il giorno dopo;
 * - **i coperti sono quelli veri**: disdette e assenze non occupano un tavolo;
 * - **l'occupazione esiste solo dove c'è una capienza dichiarata**, e dove non
 *   c'è non si inventa una percentuale.
 */

const db = new PrismaClient();
const PREFISSO = "test-settimana-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";
const TZ = "Europe/Rome";

/** Un mercoledì, per avere una settimana che non comincia dove si guarda. */
const MERCOLEDI = "2026-09-09";

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
  await db.booking.deleteMany({ where: { venueId } });
  await db.shift.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
});

/** Una prenotazione a mezzogiorno di quel giorno, nel fuso del locale. */
async function prenotazione(dateKey: string, persone: number, status = "CONFIRMED") {
  return db.booking.create({
    data: {
      venueId,
      partySize: persone,
      // Mezzogiorno: lontano da entrambi i confini del giorno, così il test non
      // misura il fuso orario per sbaglio.
      startsAt: new Date(`${dateKey}T12:00:00+02:00`),
      status: status as never,
      source: "PHONE",
    },
  });
}

describe("dove comincia la settimana", () => {
  it("sempre di lunedì, anche guardando da una domenica", () => {
    // 2026-09-09 è un mercoledì: il lunedì è il 7.
    expect(lunediDella("2026-09-09")).toBe("2026-09-07");
    // Il lunedì stesso resta se stesso.
    expect(lunediDella("2026-09-07")).toBe("2026-09-07");
    // La domenica appartiene alla settimana che è cominciata sei giorni prima,
    // non a quella che comincia il giorno dopo: con `weekday` a base zero è
    // l'errore facile.
    expect(lunediDella("2026-09-13")).toBe("2026-09-07");
  });
});

describe("i sette giorni", () => {
  it("partono dal lunedì e sono sette", async () => {
    const s = await getSettimana(venueId, MERCOLEDI);
    expect(s.dal).toBe("2026-09-07");
    expect(s.giorni).toHaveLength(7);
    expect(s.giorni[0].dateKey).toBe("2026-09-07");
    expect(s.giorni[6].dateKey).toBe("2026-09-13");
  });

  it("sommano i coperti nel giorno giusto", async () => {
    await prenotazione("2026-09-09", 4);
    await prenotazione("2026-09-09", 2);
    await prenotazione("2026-09-12", 6);

    const s = await getSettimana(venueId, MERCOLEDI);
    const mercoledi = s.giorni.find((g) => g.dateKey === "2026-09-09")!;
    const sabato = s.giorni.find((g) => g.dateKey === "2026-09-12")!;

    expect(mercoledi.coperti).toBe(6);
    expect(mercoledi.prenotazioni).toBe(2);
    expect(sabato.coperti).toBe(6);
    expect(s.copertiTotali).toBe(12);
    expect(s.prenotazioniTotali).toBe(3);
  });

  it("non conta disdette e assenze: non occupano un tavolo", async () => {
    await prenotazione("2026-09-09", 4);
    await prenotazione("2026-09-09", 8, "CANCELLED");
    await prenotazione("2026-09-09", 6, "NO_SHOW");

    const s = await getSettimana(venueId, MERCOLEDI);
    const mercoledi = s.giorni.find((g) => g.dateKey === "2026-09-09")!;
    expect(mercoledi.coperti).toBe(4);
    expect(mercoledi.prenotazioni).toBe(1);
  });

  it("conta a parte quelle da confermare, perché sono l'unica cosa da fare", async () => {
    await prenotazione("2026-09-10", 2, "PENDING");
    await prenotazione("2026-09-10", 2, "CONFIRMED");

    const s = await getSettimana(venueId, MERCOLEDI);
    const giovedi = s.giorni.find((g) => g.dateKey === "2026-09-10")!;
    expect(giovedi.inAttesa).toBe(1);
    expect(giovedi.coperti).toBe(4);
    expect(s.inAttesaTotali).toBe(1);
  });

  it("non tocca le prenotazioni di un altro locale", async () => {
    const altro = await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}x${Date.now()}`, timezone: TZ },
    });
    await db.booking.create({
      data: {
        venueId: altro.id,
        partySize: 20,
        startsAt: new Date("2026-09-09T12:00:00+02:00"),
        status: "CONFIRMED",
        source: "PHONE",
      },
    });

    const s = await getSettimana(venueId, MERCOLEDI);
    expect(s.copertiTotali).toBe(0);

    await db.booking.deleteMany({ where: { venueId: altro.id } });
    await db.venue.delete({ where: { id: altro.id } });
  });
});

describe("l'occupazione", () => {
  it("si calcola solo dove la capienza è dichiarata", async () => {
    // Turno solo il mercoledì (weekday 3): gli altri giorni non hanno capienza.
    await db.shift.create({
      data: { venueId, name: "Cena", weekday: 3, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 40 },
    });
    await prenotazione("2026-09-09", 10);
    await prenotazione("2026-09-10", 10);

    const s = await getSettimana(venueId, MERCOLEDI);
    const mercoledi = s.giorni.find((g) => g.dateKey === "2026-09-09")!;
    const giovedi = s.giorni.find((g) => g.dateKey === "2026-09-10")!;

    expect(mercoledi.capienza).toBe(40);
    expect(mercoledi.occupazione).toBe(25);

    // Nessun turno quel giorno: nessuna percentuale inventata.
    expect(giovedi.capienza).toBeNull();
    expect(giovedi.occupazione).toBeNull();
    expect(giovedi.coperti).toBe(10);
  });

  it("somma la capienza di tutti i turni dello stesso giorno", async () => {
    await db.shift.createMany({
      data: [
        { venueId, name: "Pranzo", weekday: 3, startMinute: 12 * 60, endMinute: 15 * 60, capacity: 30 },
        { venueId, name: "Cena", weekday: 3, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 50 },
      ],
    });
    await prenotazione("2026-09-09", 40);

    const s = await getSettimana(venueId, MERCOLEDI);
    const mercoledi = s.giorni.find((g) => g.dateKey === "2026-09-09")!;
    expect(mercoledi.capienza).toBe(80);
    expect(mercoledi.occupazione).toBe(50);
  });
});
