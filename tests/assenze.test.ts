import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem } from "@/server/menu";
import { addLine, closeOrder, openOrderForBooking } from "@/server/orders";
import { MINIMO_PER_QUOTA, getNoShowReport } from "@/server/no-show";

/**
 * Quanto costano le assenze.
 *
 * Le prove guardano le tre cose che, sbagliate, farebbero prendere una
 * decisione sbagliata:
 *
 * - **il valore di un coperto perso viene dai conti chiusi quando ci sono**, e
 *   solo altrimenti dallo scontrino medio dichiarato — e allora si chiama
 *   stima. Senza nessuno dei due non si mostra: inventare un prezzo per un
 *   coperto perso è peggio che ammettere di non saperlo;
 * - **le percentuali per giorno non compaiono su pochi numeri**: un martedì
 *   con due prenotazioni e un'assenza fa «50%», che è vero e non significa
 *   niente;
 * - **«il giorno peggiore» si nomina solo se è davvero peggiore** della media,
 *   e non perché è il primo dell'elenco.
 */

const db = new PrismaClient();
const PREFISSO = "test-assenze-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let piattoId = "";
const TZ = "Europe/Rome";

const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

/** Il periodo esaminato: una settimana che comincia di lunedì. */
const DA = new Date("2026-09-07T00:00:00+02:00");
const A = new Date("2026-09-13T23:59:59+02:00");

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
  await db.orderItem.deleteMany({ where: { Order: { venueId } } });
  await db.order.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.menuItem.deleteMany({ where: { venueId } });
  await db.menuCategory.deleteMany({ where: { venueId } });
  await db.venue.update({ where: { id: venueId }, data: { avgSpendCents: null } });

  const categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
  piattoId = (await createItem(venueId, { categoryId: categoriaId, name: "Tagliatelle", priceCents: 2500 })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
});

async function prenotazione(dateKey: string, persone: number, status: string, guestId?: string) {
  return db.booking.create({
    data: {
      venueId,
      guestId: guestId ?? null,
      partySize: persone,
      startsAt: new Date(`${dateKey}T20:00:00+02:00`),
      status: status as never,
      source: "PHONE",
    },
  });
}

/** `quante` prenotazioni presenti quel giorno, per superare la soglia. */
async function riempi(dateKey: string, quante: number) {
  for (let i = 0; i < quante; i++) await prenotazione(dateKey, 2, "COMPLETED");
}

describe("il conto delle assenze", () => {
  it("conta prenotazioni a vuoto e coperti persi", async () => {
    await riempi("2026-09-08", 9);
    await prenotazione("2026-09-08", 4, "NO_SHOW");
    await prenotazione("2026-09-09", 6, "NO_SHOW");
    // Una disdetta non è un'assenza: il tavolo è tornato disponibile.
    await prenotazione("2026-09-09", 8, "CANCELLED");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.assenze).toBe(2);
    expect(r.copertiPersi).toBe(10);
    expect(r.prenotazioni).toBe(12);
    expect(r.quota).toBe(17);
  });

  it("non calcola una percentuale su pochi numeri", async () => {
    await prenotazione("2026-09-08", 2, "NO_SHOW");
    await prenotazione("2026-09-08", 2, "COMPLETED");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.prenotazioni).toBeLessThan(MINIMO_PER_QUOTA);
    expect(r.quota).toBeNull();
    // Il conteggio però c'è: quello si sa.
    expect(r.assenze).toBe(1);
    expect(r.perGiorno.find((g) => g.weekday === 2)?.quota).toBeNull();
  });
});

describe("quanto vale un coperto perso", () => {
  it("lo misura sui conti chiusi, quando ci sono", async () => {
    // Un conto da 50 € per due persone: 25 € il coperto, misurati.
    const b = await prenotazione("2026-09-08", 2, "COMPLETED");
    const conto = await openOrderForBooking(venueId, b.id, { actor: attore() });
    await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 2 }, { actor: attore() });
    await closeOrder(venueId, conto.id, { actor: attore() });

    // Lo scontrino medio dichiarato è un altro numero: non deve vincere.
    await db.venue.update({ where: { id: venueId }, data: { avgSpendCents: 9_900 } });

    await prenotazione("2026-09-09", 4, "NO_SHOW");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.valoreCoperto).toMatchObject({ tipo: "misurato", centesimi: 2_500, suContiChiusi: 1 });
    expect(r.costoCents).toBe(4 * 2_500);
  });

  it("usa lo scontrino medio dichiarato solo se non ci sono conti, e lo dice", async () => {
    await db.venue.update({ where: { id: venueId }, data: { avgSpendCents: 4_500 } });
    await prenotazione("2026-09-09", 4, "NO_SHOW");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.valoreCoperto).toEqual({ tipo: "dichiarato", centesimi: 4_500 });
    expect(r.costoCents).toBe(18_000);
  });

  it("senza nessuno dei due non inventa un prezzo", async () => {
    await prenotazione("2026-09-09", 4, "NO_SHOW");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.valoreCoperto).toEqual({ tipo: "sconosciuto" });
    expect(r.costoCents).toBeNull();
    // I coperti persi si sanno comunque: è il valore che manca, non il fatto.
    expect(r.copertiPersi).toBe(4);
  });
});

describe("il giorno peggiore", () => {
  it("si nomina solo se sta davvero sopra la media", async () => {
    // Martedì: 10 prenotazioni, 4 assenze (40%). Mercoledì: 10 e 1 (10%).
    await riempi("2026-09-08", 6);
    for (let i = 0; i < 4; i++) await prenotazione("2026-09-08", 2, "NO_SHOW");
    await riempi("2026-09-09", 9);
    await prenotazione("2026-09-09", 2, "NO_SHOW");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.quota).toBe(25);
    expect(r.giornoPeggiore?.nome).toBe("martedì");
    expect(r.giornoPeggiore?.quota).toBe(40);
  });

  it("non lo nomina quando le assenze sono distribuite uguali", async () => {
    // Due giorni identici: nessuno dei due «spicca».
    await riempi("2026-09-08", 9);
    await prenotazione("2026-09-08", 2, "NO_SHOW");
    await riempi("2026-09-09", 9);
    await prenotazione("2026-09-09", 2, "NO_SHOW");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.quota).toBe(10);
    // La quota di ogni giorno è uguale alla media, quindi nessuno è «peggiore».
    expect(r.giornoPeggiore).toBeNull();
  });
});

describe("chi manca più di una volta", () => {
  it("li elenca con le assenze del periodo e quelle di sempre", async () => {
    const marco = await db.guest.create({
      data: { venueId, firstName: "Marco", lastName: "Bianchi", noShowCount: 5, totalVisits: 12 },
    });
    const giulia = await db.guest.create({ data: { venueId, firstName: "Giulia", noShowCount: 1 } });

    await prenotazione("2026-09-08", 2, "NO_SHOW", marco.id);
    await prenotazione("2026-09-10", 2, "NO_SHOW", marco.id);
    // Una sola assenza non fa un recidivo.
    await prenotazione("2026-09-11", 2, "NO_SHOW", giulia.id);

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.recidiviTotali).toBe(1);
    expect(r.recidivi[0]).toMatchObject({
      nome: "Marco Bianchi",
      assenzeNelPeriodo: 2,
      assenzeInTutto: 5,
      visite: 12,
    });
  });

  it("non inciampa sulle assenze senza cliente collegato", async () => {
    await prenotazione("2026-09-08", 2, "NO_SHOW");
    await prenotazione("2026-09-09", 2, "NO_SHOW");

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.assenze).toBe(2);
    expect(r.recidivi).toEqual([]);
  });
});

describe("i confini", () => {
  it("non guarda fuori dal periodo né fuori dal locale", async () => {
    await prenotazione("2026-09-20", 4, "NO_SHOW"); // fuori periodo
    const altro = await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}x${Date.now()}`, timezone: TZ },
    });
    await db.booking.create({
      data: {
        venueId: altro.id,
        partySize: 10,
        startsAt: new Date("2026-09-08T20:00:00+02:00"),
        status: "NO_SHOW",
        source: "PHONE",
      },
    });

    const r = await getNoShowReport(venueId, DA, A);
    expect(r.assenze).toBe(0);

    await db.booking.deleteMany({ where: { venueId: altro.id } });
    await db.venue.delete({ where: { id: altro.id } });
  });
});
