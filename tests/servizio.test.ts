import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  FREEING_SOON_MIN,
  LATE_GRACE_MIN,
  getServiceSnapshot,
} from "@/server/service";

/**
 * La fotografia del servizio.
 *
 * Tutto qui è **derivato**: «in ritardo», «da liberare», «in arrivo» non sono
 * colonne del database ma conti fatti sull'ora. È la scelta giusta — uno stato
 * calcolato non può andare fuori sincrono con la realtà — ma significa che i
 * confini vanno fissati da un test, perché un errore di segno o di tolleranza
 * qui si traduce in un ospite dichiarato assente mentre sta parcheggiando.
 */

const db = new PrismaClient();
const PREFISSO = "test-svc-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";
let vipId = "";
let tavolo4 = "";
let tavolo2 = "";

/** Un'ora di oggi, per stare sempre dentro la giornata corrente. */
function oggiAlle(ore: number, minuti = 0): Date {
  const d = new Date();
  d.setHours(ore, minuti, 0, 0);
  return d;
}

/**
 * L'orologio della prova, fermo a mezzogiorno.
 *
 * La fotografia del servizio guarda **la giornata di oggi**. Girando questi
 * test a mezzanotte e mezza, «fra ottanta minuti» cadeva nel giorno dopo e
 * spariva dalla finestra: il test passava di giorno e falliva la notte, che è
 * il difetto peggiore di un test. Le prove riguardano le finestre, non l'ora
 * in cui girano.
 */
const ADESSO = oggiAlle(12);

async function crea(opts: {
  minutiDaAdesso: number;
  status?: "CONFIRMED" | "PENDING" | "ARRIVED" | "SEATED" | "NO_SHOW" | "CANCELLED" | "COMPLETED";
  partySize?: number;
  tableId?: string | null;
  durationMin?: number;
  vip?: boolean;
}) {
  return db.booking.create({
    data: {
      venueId,
      guestId: opts.vip ? vipId : guestId,
      partySize: opts.partySize ?? 2,
      startsAt: new Date(ADESSO.getTime() + opts.minutiDaAdesso * 60_000),
      durationMin: opts.durationMin ?? 105,
      status: opts.status ?? "CONFIRMED",
      source: "PHONE",
      tableId: opts.tableId ?? null,
    },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
  });
  venueId = venue.id;

  guestId = (
    await db.guest.create({
      data: { venueId, firstName: "Mario", lastName: "Rossi", allergies: "Glutine" },
    })
  ).id;
  vipId = (
    await db.guest.create({
      data: { venueId, firstName: "Anna", lastName: "Bianchi", loyaltyTier: "VIP" },
    })
  ).id;

  tavolo4 = (await db.table.create({ data: { venueId, label: "S4", seats: 4 } })).id;
  tavolo2 = (await db.table.create({ data: { venueId, label: "S2", seats: 2 } })).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function svuota() {
  await db.booking.deleteMany({ where: { venueId } });
  await db.waitlistEntry.deleteMany({ where: { venueId } });
}

describe("chi è in ritardo", () => {
  it("non lo è dentro la tolleranza", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -(LATE_GRACE_MIN - 2) });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.late).toHaveLength(0);
    // Resta fra i prossimi arrivi: sta arrivando, non è un problema.
    expect(s.next).toHaveLength(1);
  });

  it("lo diventa superata la tolleranza, e il ritardo mostrato è quello vero", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -(LATE_GRACE_MIN + 20) });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.late).toHaveLength(1);
    // Il ritardo è rispetto all'orario prenotato, non al netto della
    // tolleranza: quella decide *se* segnalare, non quanto vale. Sottrarla
    // faceva dire due numeri diversi alla riga e all'avviso accanto.
    expect(s.late[0].lateBy).toBeGreaterThanOrEqual(LATE_GRACE_MIN + 19);
    expect(s.late[0].lateBy).toBeLessThanOrEqual(LATE_GRACE_MIN + 21);
  });

  it("chi è già arrivato o seduto non è in ritardo, anche se l'orario è passato", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -60, status: "ARRIVED" });
    await crea({ minutiDaAdesso: -60, status: "SEATED", tableId: tavolo4 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.late).toHaveLength(0);
    expect(s.arrived).toHaveLength(1);
    expect(s.seated).toHaveLength(1);
  });

  it("i più in ritardo stanno in cima", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -20, partySize: 2 });
    await crea({ minutiDaAdesso: -90, partySize: 5 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.late.map((b) => b.partySize)).toEqual([5, 2]);
  });
});

describe("i prossimi arrivi", () => {
  it("la finestra decide cosa si vede", async () => {
    await svuota();
    await crea({ minutiDaAdesso: 20 });
    await crea({ minutiDaAdesso: 50 });
    await crea({ minutiDaAdesso: 80 });

    expect((await getServiceSnapshot(venueId, { now: ADESSO, nextWindowMin: 30 })).next).toHaveLength(1);
    expect((await getServiceSnapshot(venueId, { now: ADESSO, nextWindowMin: 60 })).next).toHaveLength(2);
    expect((await getServiceSnapshot(venueId, { now: ADESSO, nextWindowMin: 90 })).next).toHaveLength(3);
  });

  it("sono ordinati per orario, il primo che arriva in cima", async () => {
    await svuota();
    await crea({ minutiDaAdesso: 50, partySize: 5 });
    await crea({ minutiDaAdesso: 20, partySize: 2 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.next.map((b) => b.partySize)).toEqual([2, 5]);
  });

  it("le annullate non compaiono da nessuna parte", async () => {
    await svuota();
    await crea({ minutiDaAdesso: 30, status: "CANCELLED" });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.next).toHaveLength(0);
    expect(s.late).toHaveLength(0);
    expect(s.counters.copertiPrevisti).toBe(0);
  });

  it("i no-show non contano fra i coperti previsti", async () => {
    await svuota();
    await crea({ minutiDaAdesso: 30, partySize: 4 });
    await crea({ minutiDaAdesso: 30, partySize: 6, status: "NO_SHOW" });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.counters.copertiPrevisti).toBe(4);
  });
});

describe("i tavoli che stanno per liberarsi", () => {
  it("entra chi ha la fine prevista entro la soglia", async () => {
    await svuota();
    // Iniziata 100 minuti fa, durata 105: finisce fra 5 minuti.
    await crea({ minutiDaAdesso: -100, durationMin: 105, status: "SEATED", tableId: tavolo4 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.freeingSoon).toHaveLength(1);
    expect(s.freeingSoon[0].minutesToFree).toBeLessThanOrEqual(FREEING_SOON_MIN);
  });

  it("chi si è appena seduto non è in chiusura", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -5, durationMin: 105, status: "SEATED", tableId: tavolo4 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.freeingSoon).toHaveLength(0);
    expect(s.seated).toHaveLength(1);
  });

  it("chi è oltre il tempo previsto ha un valore negativo, non sparisce", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -180, durationMin: 105, status: "SEATED", tableId: tavolo4 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.freeingSoon).toHaveLength(1);
    expect(s.freeingSoon[0].minutesToFree).toBeLessThan(0);
  });
});

describe("i numeri in testa", () => {
  it("contano coperti presenti e tavoli occupati, non prenotazioni", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -30, status: "SEATED", partySize: 4, tableId: tavolo4 });
    await crea({ minutiDaAdesso: -20, status: "SEATED", partySize: 2, tableId: tavolo2 });
    await crea({ minutiDaAdesso: 40, partySize: 6 });

    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.counters.copertiPresenti).toBe(6);
    expect(s.counters.tavoliOccupati).toBe(2);
    expect(s.counters.tavoliLiberi).toBe(0); // il locale di prova ha due tavoli
    expect(s.counters.tavoliTotali).toBe(2);
  });

  it("due prenotazioni sedute sullo stesso tavolo contano un tavolo", async () => {
    await svuota();
    await crea({ minutiDaAdesso: -30, status: "SEATED", partySize: 2, tableId: tavolo4 });
    await crea({ minutiDaAdesso: -20, status: "SEATED", partySize: 2, tableId: tavolo4 });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.counters.tavoliOccupati).toBe(1);
    expect(s.counters.copertiPresenti).toBe(4);
  });

  it("contano i walk-in di oggi, esclusi gli annullati", async () => {
    await svuota();
    await db.booking.create({
      data: { venueId, partySize: 2, startsAt: oggiAlle(13), status: "SEATED", source: "WALK_IN", tableId: tavolo2 },
    });
    await db.booking.create({
      data: { venueId, partySize: 2, startsAt: oggiAlle(14), status: "CANCELLED", source: "WALK_IN" },
    });
    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.counters.walkInOggi).toBe(1);
  });
});

describe("le informazioni che servono in sala", () => {
  it("porta allergie, VIP, tavolo e caparra su ogni riga", async () => {
    await svuota();
    await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 2,
        startsAt: new Date(ADESSO.getTime() + 30 * 60_000),
        status: "CONFIRMED",
        source: "PHONE",
        tableId: tavolo2,
        occasion: "BIRTHDAY",
        depositCents: 4000,
        notes: "vicino alla finestra",
      },
    });
    const [riga] = (await getServiceSnapshot(venueId, { now: ADESSO })).next;
    expect(riga.allergies).toBe("Glutine");
    expect(riga.tableLabel).toBe("S2");
    expect(riga.occasion).toBe("BIRTHDAY");
    expect(riga.depositCents).toBe(4000);
    expect(riga.notes).toBe("vicino alla finestra");
    expect(riga.isVip).toBe(false);
  });

  it("segnala i VIP", async () => {
    await svuota();
    await crea({ minutiDaAdesso: 30, vip: true });
    const [riga] = (await getServiceSnapshot(venueId, { now: ADESSO })).next;
    expect(riga.isVip).toBe(true);
  });

  it("chi non ha una scheda ospite non rompe la riga", async () => {
    await svuota();
    await db.booking.create({
      data: { venueId, partySize: 2, startsAt: new Date(ADESSO.getTime() + 30 * 60_000), status: "CONFIRMED", source: "WALK_IN" },
    });
    const [riga] = (await getServiceSnapshot(venueId, { now: ADESSO })).next;
    expect(riga.guestName).toBe("Senza nome");
    expect(riga.guestId).toBeNull();
  });
});

describe("isolamento", () => {
  it("non mostra il servizio di un altro ristorante", async () => {
    await svuota();
    const org = await db.organization.create({
      data: { name: `${PREFISSO}altro`, slug: `${PREFISSO}altro-${Date.now()}` },
    });
    const altro = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    await db.booking.create({
      data: { venueId: altro.id, partySize: 8, startsAt: new Date(ADESSO.getTime() + 20 * 60_000), status: "SEATED", source: "PHONE" },
    });

    const s = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(s.seated).toHaveLength(0);
    expect(s.counters.copertiPresenti).toBe(0);
  });
});

describe("in ritardo e mai arrivato sono due cose diverse", () => {
  it("il numero in testa conta solo chi può ancora arrivare", async () => {
    await svuota();
    // Due in ritardo vero, tre che non si vedranno più.
    await crea({ minutiDaAdesso: -40 });
    await crea({ minutiDaAdesso: -90 });
    await crea({ minutiDaAdesso: -300 });
    await crea({ minutiDaAdesso: -420 });
    await crea({ minutiDaAdesso: -600 });

    const snap = await getServiceSnapshot(venueId, { now: ADESSO });
    expect(snap.counters.inRitardo).toBe(2);
    expect(snap.counters.nonArrivate).toBe(3);
    // E l'elenco «in ritardo» non contiene le tre di pranzo.
    expect(snap.late).toHaveLength(2);
  });
});
