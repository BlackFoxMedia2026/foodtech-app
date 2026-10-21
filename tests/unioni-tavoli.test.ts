import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { creaUnione, elencaUnioni, togliTavoloDalleUnioni } from "@/server/unioni-tavoli";

/**
 * Le unioni previste: quali tavoli il locale accosta per un gruppo grande.
 *
 * Le regole sono quelle di una tavolata vera (`tavolate.test.ts`), perché
 * un'unione esiste solo per diventarlo: se l'editor ne salvasse una che
 * `combineTablesForBooking` poi rifiuta, la proposta in sala sarebbe una
 * promessa falsa.
 */

const db = new PrismaClient();
const PREFISSO = "test-unioni-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let salaId = "";
let altraSalaId = "";
let t1 = "";
let t2 = "";
let t3 = "";
let fisso = "";
let altrove = "";

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
  salaId = (await db.room.create({ data: { venueId, name: `${PREFISSO}principale` } })).id;
  altraSalaId = (await db.room.create({ data: { venueId, name: `${PREFISSO}dehors` } })).id;

  const crea = async (label: string, seats: number, roomId: string, combinable = true) =>
    (await db.table.create({ data: { venueId, roomId, label: `${PREFISSO}${label}`, seats, combinable } })).id;

  t1 = await crea("T1", 2, salaId);
  t2 = await crea("T2", 2, salaId);
  t3 = await crea("T3", 2, salaId);
  fisso = await crea("separe", 4, salaId, false);
  altrove = await crea("D1", 2, altraSalaId);
}, 60_000);

beforeEach(async () => {
  await db.tableCombination.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("creare un'unione", () => {
  it("tre tavoli da due fanno un'unione da sei, nell'ordine scelto", async () => {
    const u = await creaUnione(venueId, { roomId: salaId, tableIds: [t3, t1, t2], label: "Finestra" });
    expect(u.posti).toBe(6);
    expect(u.tableIds).toEqual([t3, t1, t2]);
    expect(u.nomi).toBe(`${PREFISSO}T3 + ${PREFISSO}T1 + ${PREFISSO}T2`);
    expect(u.label).toBe("Finestra");
  });

  it("con un tavolo solo non è un'unione", async () => {
    await expect(creaUnione(venueId, { roomId: salaId, tableIds: [t1, t1] })).rejects.toThrow("almeno due");
  });

  it("i tavoli devono stare nella sala indicata", async () => {
    await expect(creaUnione(venueId, { roomId: salaId, tableIds: [t1, altrove] })).rejects.toThrow("stessa sala");
  });

  it("un tavolo non unibile non entra in un'unione", async () => {
    await expect(creaUnione(venueId, { roomId: salaId, tableIds: [t1, fisso] })).rejects.toThrow("Non si può unire");
  });

  it("gli stessi tavoli in un altro ordine sono la stessa unione", async () => {
    await creaUnione(venueId, { roomId: salaId, tableIds: [t1, t2] });
    await expect(creaUnione(venueId, { roomId: salaId, tableIds: [t2, t1] })).rejects.toThrow("già un'unione");
  });

  it("un tavolo di un altro locale non si trova", async () => {
    await expect(creaUnione("altro-locale", { roomId: salaId, tableIds: [t1, t2] })).rejects.toThrow("non esiste");
  });
});

describe("elencare e ripulire", () => {
  it("si elencano per sala", async () => {
    await creaUnione(venueId, { roomId: salaId, tableIds: [t1, t2] });
    expect(await elencaUnioni(venueId, salaId)).toHaveLength(1);
    expect(await elencaUnioni(venueId, altraSalaId)).toHaveLength(0);
  });

  it("un tavolo eliminato esce dalle unioni; con un tavolo solo l'unione sparisce", async () => {
    await creaUnione(venueId, { roomId: salaId, tableIds: [t1, t2, t3] });
    await creaUnione(venueId, { roomId: salaId, tableIds: [t1, t2] });
    await togliTavoloDalleUnioni(venueId, t1);
    const rimaste = await elencaUnioni(venueId, salaId);
    expect(rimaste).toHaveLength(1);
    expect(rimaste[0].tableIds).toEqual([t2, t3]);
    expect(rimaste[0].posti).toBe(4);
  });
});
