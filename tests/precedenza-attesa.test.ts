import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  RITARDO_CHE_CONTA_MIN,
  addToWaitlist,
  closeWaitlistEntry,
  listWaitlist,
  suggestEntriesForTable,
  tavoliSuggeritiPerLaCoda,
} from "@/server/waitlist";

/**
 * Chi ha la precedenza quando si libera un tavolo (§26 del brief).
 *
 * Fino all'8 settembre l'ordine era quello di arrivo, e l'ordine di arrivo non
 * sa niente di **cosa è stato detto a chi**: un gruppo a cui abbiamo promesso
 * venti minuti e che ne ha aspettati trentacinque si vedeva passare davanti
 * chi era arrivato prima con una promessa di quaranta e ne aveva aspettati
 * quarantacinque. Il secondo non ha ricevuto nessuna promessa falsa; il primo
 * sì, e in sala è quello che si alza e va via.
 *
 * Questi test fissano le tre cose che tengono la regola onesta: **la promessa
 * conta**, **il rumore no** (scaglioni di cinque minuti), e **l'ordine di
 * arrivo resta l'ultima parola** a parità di tutto.
 */

const db = new PrismaClient();
const PREFISSO = "test-prec-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let tavolo2 = "";
let tavolo2bis = "";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: {
      orgId: org.id,
      name: `${PREFISSO}locale`,
      slug: `${PREFISSO}v${Date.now()}`,
      timezone: "Europe/Rome",
    },
  });
  venueId = venue.id;

  const sala = await db.room.create({ data: { venueId, name: "Sala" } });
  tavolo2 = (await db.table.create({ data: { venueId, roomId: sala.id, label: "P2", seats: 2 } })).id;
  tavolo2bis = (await db.table.create({ data: { venueId, roomId: sala.id, label: "P3", seats: 2 } })).id;

  // Aperto tutto il giorno, tutti i giorni: i test girano a qualunque ora.
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: { venueId, name: "Sempre", weekday, startMinute: 0, endMinute: 23 * 60 + 59, capacity: 60 },
    });
  }
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function svuota() {
  const coda = await listWaitlist(venueId);
  for (const e of coda) await closeWaitlistEntry(venueId, e.id, "LEFT");
}

/**
 * Mette qualcuno in coda **come se fosse entrato N minuti fa**.
 *
 * `addToWaitlist` scrive `createdAt` con l'ora vera: per provare un'attesa di
 * mezz'ora bisogna spostare la riga indietro, non aspettare mezz'ora.
 */
async function inCoda(nome: string, opts: { daMinuti: number; promessa: number; partySize?: number }) {
  const e = await addToWaitlist(venueId, {
    guestName: nome,
    partySize: opts.partySize ?? 2,
    expectedWaitMin: opts.promessa,
  });
  await db.waitlistEntry.update({
    where: { id: e.id },
    data: { createdAt: new Date(Date.now() - opts.daMinuti * 60_000) },
  });
  return e;
}

describe("la promessa fatta conta", () => {
  it("chi ha aspettato oltre la promessa passa davanti a chi è arrivato prima", async () => {
    await svuota();
    // Arrivata prima, ma sa di dover aspettare quaranta minuti e ne ha
    // aspettati quarantacinque: cinque oltre.
    await inCoda("Paziente", { daMinuti: 45, promessa: 40 });
    // Arrivata dopo, le abbiamo detto venti e ne ha aspettati trentacinque:
    // quindici oltre.
    await inCoda("Delusa", { daMinuti: 35, promessa: 20 });

    const proposta = await suggestEntriesForTable(venueId, tavolo2);
    expect(proposta.map((e) => e.guestName)).toEqual(["Delusa", "Paziente"]);
  });

  it("dentro la stima non c'è nessun sorpasso: vale l'ordine di arrivo", async () => {
    await svuota();
    await inCoda("Primo", { daMinuti: 10, promessa: 30 });
    await inCoda("Secondo", { daMinuti: 5, promessa: 15 });

    const proposta = await suggestEntriesForTable(venueId, tavolo2);
    expect(proposta.map((e) => e.guestName)).toEqual(["Primo", "Secondo"]);
    expect(proposta.every((e) => e.ritardoSullaPromessa === 0)).toBe(true);
  });

  it("un minuto di differenza non fa ballare la coda", async () => {
    await svuota();
    // Sei minuti oltre e sette minuti oltre: stesso scaglione, quindi decide
    // l'arrivo. Senza gli scaglioni, la coda si riordinerebbe da sola a ogni
    // aggiornamento automatico della pagina.
    await inCoda("Primo", { daMinuti: 26, promessa: 20 });
    await inCoda("Secondo", { daMinuti: 27, promessa: 20 });

    const proposta = await suggestEntriesForTable(venueId, tavolo2);
    expect(proposta.map((e) => e.guestName)).toEqual(["Primo", "Secondo"]);
  });

  it("oltre uno scaglione, invece, il sorpasso c'è", async () => {
    await svuota();
    await inCoda("Primo", { daMinuti: 21, promessa: 20 });
    await inCoda("Secondo", { daMinuti: 21 + RITARDO_CHE_CONTA_MIN, promessa: 20 });

    const proposta = await suggestEntriesForTable(venueId, tavolo2);
    expect(proposta.map((e) => e.guestName)).toEqual(["Secondo", "Primo"]);
  });

  it("chi non ha ricevuto nessuna stima non scavalca nessuno", async () => {
    await svuota();
    // `expectedWaitMin: 0` è «non le abbiamo detto niente»: senza promessa non
    // c'è una promessa rotta, e trattare l'attesa intera come ritardo
    // metterebbe davanti proprio chi non ha sentito nessun numero.
    await inCoda("Primo", { daMinuti: 10, promessa: 20 });
    await inCoda("SenzaStima", { daMinuti: 60, promessa: 0 });

    const proposta = await suggestEntriesForTable(venueId, tavolo2);
    expect(proposta[0].guestName).toBe("Primo");
    expect(proposta.find((e) => e.guestName === "SenzaStima")?.ritardoSullaPromessa).toBe(0);
  });
});

describe("il tavolo suggerito segue la stessa precedenza", () => {
  it("il primo tavolo va a chi ha aspettato oltre la promessa", async () => {
    await svuota();
    const paziente = await inCoda("Paziente", { daMinuti: 45, promessa: 40 });
    const delusa = await inCoda("Delusa", { daMinuti: 35, promessa: 20 });

    const coda = await listWaitlist(venueId);
    const suggeriti = await tavoliSuggeritiPerLaCoda(venueId, coda);

    // Due tavoli da due: entrambe ne ricevono uno, ma il primo — P2, il primo
    // in ordine — va a chi ha la precedenza.
    expect(suggeriti[delusa.id]?.label).toBe("P2");
    expect(suggeriti[paziente.id]?.label).toBe("P3");
    expect(suggeriti[delusa.id]?.tableId).not.toBe(suggeriti[paziente.id]?.tableId);
  });

  it("con un tavolo solo, lo riceve chi ha la precedenza e nessun altro", async () => {
    await svuota();
    await db.table.update({ where: { id: tavolo2bis }, data: { active: false } });
    try {
      const paziente = await inCoda("Paziente", { daMinuti: 45, promessa: 40 });
      const delusa = await inCoda("Delusa", { daMinuti: 35, promessa: 20 });

      const suggeriti = await tavoliSuggeritiPerLaCoda(venueId, await listWaitlist(venueId));
      expect(suggeriti[delusa.id]?.label).toBe("P2");
      // Un tavolo si propone a una persona sola: l'altra non riceve niente,
      // invece di ricevere un tavolo già promesso.
      expect(suggeriti[paziente.id]).toBeUndefined();
    } finally {
      await db.table.update({ where: { id: tavolo2bis }, data: { active: true } });
    }
  });
});
