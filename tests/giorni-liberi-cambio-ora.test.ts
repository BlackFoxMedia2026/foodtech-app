import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prossimiGiorniLiberi } from "@/server/availability";

/**
 * «E allora quando?» nella settimana del cambio d'ora.
 *
 * `prossimiGiorniLiberi` avanzava di 86.400.000 ms dalla mezzanotte del
 * giorno chiesto. Il 25 ottobre 2026 a Roma dura venticinque ore: due passi
 * da ventiquattro cadevano entrambi nel 25, e al cliente si proponeva la
 * stessa domenica due volte — saltando il giorno dopo.
 */

const db = new PrismaClient();
const PREFISSO = "test-glco-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: unico, slug: `${unico}-v`, timezone: "Europe/Rome" },
    })
  ).id;
  // Una cena tutti i giorni, 19:00 → 23:00.
  await db.shift.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      venueId,
      name: "Cena",
      weekday,
      startMinute: 19 * 60,
      endMinute: 23 * 60,
      capacity: 40,
    })),
  });
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("i giorni liberi dopo un sabato pieno, la notte del cambio d'ora", () => {
  it("propone giorni di calendario consecutivi, senza ripeterne uno", async () => {
    const giorni = await prossimiGiorniLiberi(
      venueId,
      { year: 2026, month: 10, day: 24 },
      2,
      { durationMin: 105, now: new Date("2026-10-20T10:00:00.000Z"), limite: 4 },
    );
    expect(giorni.map((g) => g.date)).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
  });

  it("e così anche in primavera, quando il giorno dura ventitré ore", async () => {
    // 29 marzo 2026: a Roma l'ora legale comincia.
    const giorni = await prossimiGiorniLiberi(
      venueId,
      { year: 2026, month: 3, day: 27 },
      2,
      { durationMin: 105, now: new Date("2026-03-20T10:00:00.000Z"), limite: 4 },
    );
    expect(giorni.map((g) => g.date)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });
});
