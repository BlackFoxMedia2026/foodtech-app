import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { shiftDateKey, todayInVenue } from "@/lib/venue-time";
import {
  finestraGiorno,
  getOccupancyByWeekday,
  getWeekForecast,
  quotaAssenze,
  weekdayOfDateKey,
  GIORNI_MINIMI,
} from "@/server/forecast";

/**
 * La previsione dei coperti.
 *
 * Una previsione è utile solo se chi la legge può decidere se crederci, quindi
 * le prove guardano prima di tutto **quando il numero non si deve mostrare**:
 * senza storia sufficiente, o quando la proporzione si baserebbe su una quota
 * minuscola. Un numero prudente ma spiegabile serve a qualcosa; un numero
 * sicuro e sbagliato fa perdere soldi a chi ci compra la spesa.
 */

const db = new PrismaClient();
const PREFISSO = "test-prev-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

const TZ = "Europe/Rome";
const ORA = new Date("2026-09-07T10:00:00.000Z");
const OGGI = todayInVenue(TZ, ORA);

/** Il giorno bersaglio: fra sei giorni, qualunque giorno della settimana sia. */
const K = 6;
const BERSAGLIO = shiftDateKey(OGGI, K);

async function prenota(dateKey: string, coperti: number, creataIl: Date, oraDelGiorno = 20) {
  const [y, m, d] = dateKey.split("-").map(Number);
  // 20:00 nel fuso del locale, costruito come istante assoluto.
  const startsAt = new Date(Date.UTC(y, m - 1, d, oraDelGiorno - 2, 0));
  return db.booking.create({
    data: {
      venueId,
      partySize: coperti,
      startsAt,
      createdAt: creataIl,
      status: "CONFIRMED",
      source: "PHONE",
    },
  });
}

/** Un turno con una capienza, per il giorno della settimana indicato. */
async function turno(weekday: number, capacity: number) {
  return db.shift.create({
    data: { venueId, name: `${PREFISSO}cena`, weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity },
  });
}

/**
 * Costruisce otto giornate passate dello stesso giorno della settimana, in cui
 * il 60% dei coperti era già prenotato alla stessa distanza dal servizio.
 */
async function storiaCon(quotaAnticipata: number, copertiFinali: number, settimane = 8) {
  for (let s = 1; s <= settimane; s++) {
    const passato = shiftDateKey(BERSAGLIO, -7 * s);
    const inizio = finestraGiorno(passato, TZ).start;
    const anticipate = Math.round(copertiFinali * quotaAnticipata);
    // Prenotate prima del punto di confronto (inizio - K giorni).
    await prenota(passato, anticipate, new Date(inizio.getTime() - (K + 4) * 86_400_000));
    // Prenotate dopo: all'epoca non c'erano ancora.
    await prenota(passato, copertiFinali - anticipate, new Date(inizio.getTime() - 86_400_000));
  }
}

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
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
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.shift.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("le giornate si misurano nel fuso del locale", () => {
  it("una notte di Roma appartiene al giorno di Roma, non a quello di Greenwich", () => {
    const { start, end } = finestraGiorno("2026-09-12", TZ);
    // A settembre Roma è due ore avanti: la giornata comincia alle 22:00 UTC del giorno prima.
    expect(start.toISOString()).toBe("2026-09-11T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-12T22:00:00.000Z");
    // Una prenotazione all'una di notte a Roma cade dentro la giornata giusta.
    const unaDiNotte = new Date("2026-09-12T23:00:00.000Z"); // = 13 set 01:00 a Roma
    expect(unaDiNotte >= end).toBe(true);
  });

  it("la finestra copre l'ora di cambio senza saltare un giorno", () => {
    // Nella notte in cui l'ora torna indietro la giornata dura 25 ore.
    const { start, end } = finestraGiorno("2026-10-25", TZ);
    const ore = (end.getTime() - start.getTime()) / 3_600_000;
    expect(ore).toBe(25);
  });

  it("il giorno della settimana di una data pura non dipende dal fuso", () => {
    expect(weekdayOfDateKey("2026-09-07")).toBe(1); // lunedì
    expect(weekdayOfDateKey("2026-09-12")).toBe(6); // sabato
  });
});

describe("quando NON si prevede niente", () => {
  it("senza storia il numero non c'è, e si dice perché", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 80);
    await prenota(BERSAGLIO, 20, ORA);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const bersaglio = giorni.find((g) => g.dateKey === BERSAGLIO)!;

    expect(bersaglio.bookedCovers).toBe(20);
    expect(bersaglio.forecastCovers).toBeNull();
    expect(bersaglio.confidenza).toBe("assente");
    expect(bersaglio.why).toContain("Non abbiamo ancora");
  });

  it("con due o tre giorni comparabili il numero c'è ma è dichiarato debole", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 80);
    await storiaCon(0.6, 100, 3);
    await prenota(BERSAGLIO, 42, ORA);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const b = giorni.find((g) => g.dateKey === BERSAGLIO)!;
    expect(b.confidenza).toBe("scarsa");
    expect(b.giorniComparabili).toBe(3);
    expect(b.why).toContain("molle");
  });

  it("senza turni configurati non si inventa una capienza", async () => {
    await storiaCon(0.6, 100);
    await prenota(BERSAGLIO, 42, ORA);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const b = giorni.find((g) => g.dateKey === BERSAGLIO)!;
    expect(b.capacity).toBeNull();
    expect(b.occupancyPct).toBeNull();
    expect(b.why).toContain("Nessun turno configurato");
  });
});

describe("la previsione, quando c'è di che", () => {
  it("proporziona sui coperti già a libro: 42 con il 60% tipico fa 70", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 80);
    await storiaCon(0.6, 100);
    await prenota(BERSAGLIO, 42, ORA);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const b = giorni.find((g) => g.dateKey === BERSAGLIO)!;

    expect(b.confidenza).toBe("buona");
    expect(b.giorniComparabili).toBeGreaterThanOrEqual(GIORNI_MINIMI);
    expect(b.quotaTipica).toBeCloseTo(0.6, 2);
    expect(b.forecastCovers).toBe(70);
    expect(b.occupancyPct).toBe(88);
    expect(b.why).toContain("60%");
  });

  it("la previsione non scende sotto i coperti già prenotati", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 200);
    // Storia con pochi coperti finali, ma oggi il libro è pieno.
    await storiaCon(0.9, 20);
    await prenota(BERSAGLIO, 150, ORA);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const b = giorni.find((g) => g.dateKey === BERSAGLIO)!;
    expect(b.forecastCovers).toBeGreaterThanOrEqual(b.bookedCovers);
  });

  it("con una quota anticipata minuscola non divide: usa la mediana storica", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 120);
    // Solo il 5% dei coperti risulta prenotato a questa distanza: dividere per
    // 0,05 farebbe esplodere il numero.
    await storiaCon(0.05, 100);
    await prenota(BERSAGLIO, 5, ORA);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const b = giorni.find((g) => g.dateKey === BERSAGLIO)!;

    expect(b.forecastCovers).toBe(100);
    expect(b.why).toContain("Troppo presto");
  });

  it("le assenze attese si sottraggono, e si dice quante", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 80);
    await storiaCon(0.6, 100);
    await prenota(BERSAGLIO, 42, ORA);

    // Una storia recente con un quarto di assenze.
    const ieri = shiftDateKey(OGGI, -1);
    for (let i = 0; i < 3; i++) await prenota(ieri, 2, new Date(ORA.getTime() - 5 * 86_400_000));
    await db.booking.updateMany({
      where: { venueId, startsAt: { lt: ORA } , partySize: 2 },
      data: { status: "COMPLETED" },
    });
    const [una] = await db.booking.findMany({ where: { venueId, status: "COMPLETED" }, take: 1 });
    await db.booking.update({ where: { id: una.id }, data: { status: "NO_SHOW" } });

    const tasso = await quotaAssenze(venueId, ORA);
    expect(tasso).toBeGreaterThan(0);

    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    const b = giorni.find((g) => g.dateKey === BERSAGLIO)!;
    expect(b.expectedNoShowCovers).toBeGreaterThan(0);
    expect(b.forecastCovers).toBe(70 - b.expectedNoShowCovers);
    expect(b.why).toContain("assenze attese");
  });

  it("restituisce un giorno per ogni giorno chiesto, a partire da oggi", async () => {
    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: 7 });
    expect(giorni).toHaveLength(7);
    expect(giorni[0].dateKey).toBe(OGGI);
    expect(giorni[0].giorniDaOggi).toBe(0);
    expect(giorni[6].dateKey).toBe(shiftDateKey(OGGI, 6));
  });

  it("le prenotazioni di un altro locale non entrano nel conto", async () => {
    await turno(weekdayOfDateKey(BERSAGLIO), 80);
    const [y, m, d] = BERSAGLIO.split("-").map(Number);
    await db.booking.create({
      data: {
        venueId: altroVenueId,
        partySize: 60,
        startsAt: new Date(Date.UTC(y, m - 1, d, 18, 0)),
        status: "CONFIRMED",
        source: "PHONE",
      },
    });
    const giorni = await getWeekForecast(venueId, { now: ORA, giorni: K + 1 });
    expect(giorni.find((g) => g.dateKey === BERSAGLIO)!.bookedCovers).toBe(0);
  });
});

describe("occupazione per giorno della settimana", () => {
  it("dice quanti coperti fai in media, e quanto sei pieno", async () => {
    const weekday = weekdayOfDateKey(BERSAGLIO);
    await turno(weekday, 100);
    // Quattro giornate passate da 50 coperti serviti.
    for (let s = 1; s <= 4; s++) {
      const passato = shiftDateKey(BERSAGLIO, -7 * s);
      await prenota(passato, 50, new Date(ORA.getTime() - 40 * 86_400_000));
    }
    await db.booking.updateMany({ where: { venueId }, data: { status: "COMPLETED" } });

    const righe = await getOccupancyByWeekday(venueId, { now: ORA, settimane: 8 });
    const riga = righe.find((r) => r.weekday === weekday)!;
    expect(riga.capacity).toBe(100);
    // Le giornate misurate sono tutte quelle di quel giorno nel periodo, non
    // solo quelle con prenotazioni: una serata vuota è un dato, non un buco.
    expect(riga.giorni).toBeGreaterThanOrEqual(4);
    expect(riga.copertiMedi).toBeGreaterThan(0);
    expect(riga.occupancyPct).toBeGreaterThan(0);
  });

  it("i giorni di chiusura non abbassano la media degli altri", async () => {
    const weekday = weekdayOfDateKey(BERSAGLIO);
    await turno(weekday, 100);
    const righe = await getOccupancyByWeekday(venueId, { now: ORA, settimane: 4 });
    // Un solo giorno della settimana ha turni: gli altri sei non compaiono.
    expect(righe).toHaveLength(1);
    expect(righe[0].weekday).toBe(weekday);
  });

  it("le assenze non contano come coperti serviti", async () => {
    const weekday = weekdayOfDateKey(BERSAGLIO);
    await turno(weekday, 100);
    const passato = shiftDateKey(BERSAGLIO, -7);
    const b = await prenota(passato, 40, new Date(ORA.getTime() - 40 * 86_400_000));
    await db.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW" } });

    const righe = await getOccupancyByWeekday(venueId, { now: ORA, settimane: 4 });
    expect(righe[0].copertiMedi).toBe(0);
  });
});

describe("le medie non contano le settimane senza dati", () => {
  it("un locale con tre settimane di storia non viene diviso per otto", async () => {
    const weekday = weekdayOfDateKey(BERSAGLIO);
    await turno(weekday, 100);
    // Tre sole giornate registrate, da 60 coperti: la media è 60, non 22.
    for (let s = 1; s <= 3; s++) {
      const passato = shiftDateKey(BERSAGLIO, -7 * s);
      await prenota(passato, 60, new Date(ORA.getTime() - 40 * 86_400_000));
    }

    const righe = await getOccupancyByWeekday(venueId, { now: ORA, settimane: 8 });
    const riga = righe.find((r) => r.weekday === weekday)!;

    // Senza il taglio, le cinque settimane in cui il locale non registrava
    // niente avrebbero dimezzato la media.
    expect(riga.giorni).toBeLessThanOrEqual(3);
    expect(riga.copertiMedi).toBe(60);
    expect(riga.occupancyPct).toBe(60);
  });

  it("una serata vuota DENTRO il periodo registrato conta come vuota", async () => {
    const weekday = weekdayOfDateKey(BERSAGLIO);
    await turno(weekday, 100);
    // Due giornate: una piena, e una successiva vuota. La media è 30.
    await prenota(shiftDateKey(BERSAGLIO, -14), 60, new Date(ORA.getTime() - 40 * 86_400_000));

    const righe = await getOccupancyByWeekday(venueId, { now: ORA, settimane: 8 });
    const riga = righe.find((r) => r.weekday === weekday)!;
    expect(riga.giorni).toBe(2);
    expect(riga.copertiMedi).toBe(30);
  });
});
