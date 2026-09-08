import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ARRIVING_WINDOW_MIN,
  CLEANING_WINDOW_MIN,
  TABLE_LIVE_LABELS,
  deriveTableLiveStatus,
  type LiveBookingLike,
} from "@/lib/table-status";
import { LIVE_STATUS_ORDER, getFloorLive } from "@/server/floor-live";

/**
 * I sette stati vivi di un tavolo.
 *
 * Sono derivati dall'ora, quindi i confini vanno fissati per iscritto: fra
 * «occupato» e «al conto» c'è la differenza fra un tavolo su cui non contare e
 * uno che sta per liberarsi, e chi ha gente in attesa decide su quella
 * distinzione.
 */

const ora = new Date("2026-09-07T20:00:00.000Z");

/**
 * L'orologio delle prove sul database, fermo a mezzogiorno.
 *
 * `getFloorLive` guarda **la giornata di oggi**, e i test girano con TZ=UTC su
 * un locale a Roma: fra mezzanotte e le due UTC, «trenta minuti fa» cade nel
 * giorno prima e il tavolo risulta libero. Passavano di giorno e fallivano in
 * una finestra di due ore, che è il modo peggiore di accorgersene.
 */
const ADESSO = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();

function prenotazione(p: Partial<LiveBookingLike> & { minutiDaOra: number }): LiveBookingLike {
  return {
    status: p.status ?? "CONFIRMED",
    startsAt: new Date(ora.getTime() + p.minutiDaOra * 60_000),
    durationMin: p.durationMin ?? 105,
    closedAt: p.closedAt ?? null,
  };
}

describe("stato vivo: l'ordine dei controlli è l'ordine di urgenza", () => {
  const tavolo = { active: true };

  it("un tavolo senza prenotazioni è libero", () => {
    expect(deriveTableLiveStatus(tavolo, [], ora)).toBe("LIBERO");
  });

  it("un tavolo disattivato è bloccato, non libero", () => {
    expect(deriveTableLiveStatus({ active: false }, [], ora)).toBe("BLOCCATO");
  });

  it("un fuori servizio blocca anche un tavolo attivo", () => {
    expect(deriveTableLiveStatus(tavolo, [], ora, { blocked: true })).toBe("BLOCCATO");
  });

  it("con gente seduta è occupato", () => {
    const s = deriveTableLiveStatus(tavolo, [prenotazione({ minutiDaOra: -30, status: "SEATED" })], ora);
    expect(s).toBe("OCCUPATO");
  });

  it("seduti oltre la durata prevista: al conto", () => {
    // Iniziata 120 minuti fa, durata 105: la fine è passata.
    const s = deriveTableLiveStatus(
      tavolo,
      [prenotazione({ minutiDaOra: -120, status: "SEATED", durationMin: 105 })],
      ora,
    );
    expect(s).toBe("CONTO");
  });

  it("chi è seduto vince su chi ha prenotato più tardi", () => {
    const s = deriveTableLiveStatus(
      tavolo,
      [prenotazione({ minutiDaOra: -30, status: "SEATED" }), prenotazione({ minutiDaOra: 120 })],
      ora,
    );
    expect(s).toBe("OCCUPATO");
  });

  it("dentro la finestra è in arrivo, fuori è prenotato", () => {
    expect(
      deriveTableLiveStatus(tavolo, [prenotazione({ minutiDaOra: ARRIVING_WINDOW_MIN - 5 })], ora),
    ).toBe("IN_ARRIVO");
    expect(
      deriveTableLiveStatus(tavolo, [prenotazione({ minutiDaOra: ARRIVING_WINDOW_MIN + 30 })], ora),
    ).toBe("PRENOTATO");
  });

  it("chi è arrivato ma non ancora seduto tiene il tavolo in arrivo", () => {
    // L'ospite è in sala e aspetta: quel tavolo non è libero per nessun altro.
    const s = deriveTableLiveStatus(tavolo, [prenotazione({ minutiDaOra: -40, status: "ARRIVED" })], ora);
    expect(s).toBe("IN_ARRIVO");
  });

  it("appena liberato è da riassettare, poi torna libero", () => {
    const appena = prenotazione({
      minutiDaOra: -120,
      status: "COMPLETED",
      closedAt: new Date(ora.getTime() - (CLEANING_WINDOW_MIN - 5) * 60_000),
    });
    expect(deriveTableLiveStatus(tavolo, [appena], ora)).toBe("PULIZIA");

    const vecchio = prenotazione({
      minutiDaOra: -240,
      status: "COMPLETED",
      closedAt: new Date(ora.getTime() - (CLEANING_WINDOW_MIN + 20) * 60_000),
    });
    expect(deriveTableLiveStatus(tavolo, [vecchio], ora)).toBe("LIBERO");
  });

  it("una prenotazione già passata e chiusa non tiene il tavolo prenotato", () => {
    const passata = prenotazione({ minutiDaOra: -300, status: "COMPLETED", closedAt: new Date(ora.getTime() - 250 * 60_000) });
    expect(deriveTableLiveStatus(tavolo, [passata], ora)).toBe("LIBERO");
  });

  it("ogni stato ha un'etichetta e un posto nell'ordine di rilevanza", () => {
    for (const stato of LIVE_STATUS_ORDER) {
      expect(TABLE_LIVE_LABELS[stato]).toBeTruthy();
    }
    expect(LIVE_STATUS_ORDER).toHaveLength(7);
    // Chi ha bisogno di attenzione sta sopra, il bloccato in fondo.
    expect(LIVE_STATUS_ORDER[0]).toBe("CONTO");
    expect(LIVE_STATUS_ORDER.at(-1)).toBe("BLOCCATO");
  });
});

describe("la sala viva, contro il database", () => {
  const db = new PrismaClient();
  const PREFISSO = "test-live-";

  const url = process.env.DATABASE_URL ?? "";
  if (!/dev|test/i.test(url)) {
    throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
  }

  let venueId = "";
  let guestId = "";
  let t1 = "";
  let t2 = "";
  let t3 = "";

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
    });
    const venue = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
    });
    venueId = venue.id;
    guestId = (await db.guest.create({ data: { venueId, firstName: "Live", lastName: "Prova" } })).id;
    t1 = (await db.table.create({ data: { venueId, label: "L1", seats: 2 } })).id;
    t2 = (await db.table.create({ data: { venueId, label: "L2", seats: 4 } })).id;
    t3 = (await db.table.create({ data: { venueId, label: "L3", seats: 6, active: false } })).id;
  }, 60_000);

  afterAll(async () => {
    await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
    await db.$disconnect();
  }, 60_000);

  async function svuota() {
    await db.booking.deleteMany({ where: { venueId } });
    await db.tableBlock.deleteMany({ where: { venueId } });
  }

  it("conta gli stati di tutti i tavoli, compresi i disattivati", async () => {
    await svuota();
    const live = await getFloorLive(venueId, { now: ADESSO });
    expect(live.counters.LIBERO).toBe(2);
    expect(live.counters.BLOCCATO).toBe(1); // L3 è disattivato
    expect(Object.keys(live.byTableId)).toHaveLength(3);
  });

  it("porta chi c'è adesso su ogni tavolo", async () => {
    await svuota();
    await db.booking.create({
      data: {
        venueId,
        guestId,
        tableId: t1,
        partySize: 2,
        startsAt: new Date(ADESSO.getTime() - 30 * 60_000),
        durationMin: 105,
        status: "SEATED",
        source: "PHONE",
      },
    });

    const live = await getFloorLive(venueId, { now: ADESSO });
    const info = live.byTableId[t1];
    expect(info.status).toBe("OCCUPATO");
    expect(info.current?.guestName).toBe("Live Prova");
    expect(info.current?.partySize).toBe(2);
    expect(info.current?.minutesToFree).toBeGreaterThan(0);
    expect(info.current?.minutesToArrival).toBeNull();
  });

  it("un fuori servizio in corso blocca il tavolo", async () => {
    await svuota();
    await db.tableBlock.create({
      data: {
        venueId,
        tableId: t2,
        startsAt: new Date(ADESSO.getTime() - 60 * 60_000),
        endsAt: new Date(ADESSO.getTime() + 60 * 60_000),
        reason: "riparazione",
      },
    });
    const live = await getFloorLive(venueId, { now: ADESSO });
    expect(live.byTableId[t2].status).toBe("BLOCCATO");
  });

  it("una tavolata unita occupa tutti i tavoli che usa", async () => {
    await svuota();
    // combinedTableIds esisteva già e il motore di disponibilità lo rispetta:
    // la mappa deve fare lo stesso, altrimenti mostra libero un tavolo che è
    // parte di una tavolata.
    await db.booking.create({
      data: {
        venueId,
        guestId,
        tableId: t1,
        combinedTableIds: [t1, t2],
        partySize: 6,
        startsAt: new Date(ADESSO.getTime() - 20 * 60_000),
        durationMin: 105,
        status: "SEATED",
        source: "PHONE",
      },
    });

    const live = await getFloorLive(venueId, { now: ADESSO });
    expect(live.byTableId[t1].status).toBe("OCCUPATO");
    expect(live.byTableId[t2].status).toBe("OCCUPATO");
    expect(live.byTableId[t1].current?.combinedWith).toEqual([t2]);
    expect(live.byTableId[t2].current?.combinedWith).toEqual([t1]);
  });

  it("indica la prossima prenotazione su un tavolo libero", async () => {
    await svuota();
    // Orologio fissato, non «adesso più quattro ore»: eseguito dopo le 20 quel
    // «più quattro ore» cadeva nel giorno dopo, fuori dalla finestra della
    // sala, e il test falliva di sera e passava di giorno. La prova riguarda
    // «una prenotazione che deve ancora arrivare», non l'ora in cui gira.
    const adesso = new Date();
    adesso.setHours(12, 0, 0, 0);
    const fraQuattroOre = new Date(adesso.getTime() + 4 * 3600 * 1000);

    await db.booking.create({
      data: {
        venueId,
        guestId,
        tableId: t1,
        partySize: 2,
        startsAt: fraQuattroOre,
        status: "CONFIRMED",
        source: "PHONE",
      },
    });
    const live = await getFloorLive(venueId, { now: adesso });
    expect(live.byTableId[t1].status).toBe("PRENOTATO");
    expect(live.byTableId[t1].next ?? live.byTableId[t1].current).not.toBeNull();
  });

  it("le annullate non occupano niente", async () => {
    await svuota();
    await db.booking.create({
      data: {
        venueId,
        guestId,
        tableId: t1,
        partySize: 2,
        startsAt: new Date(ADESSO.getTime() - 20 * 60_000),
        status: "CANCELLED",
        source: "PHONE",
      },
    });
    const live = await getFloorLive(venueId, { now: ADESSO });
    expect(live.byTableId[t1].status).toBe("LIBERO");
    expect(live.byTableId[t1].current).toBeNull();
  });

  it("filtra per sala quando richiesto", async () => {
    await svuota();
    const sala = await db.room.create({ data: { venueId, name: "Terrazza" } });
    const t4 = await db.table.create({ data: { venueId, roomId: sala.id, label: "L4", seats: 2 } });

    const soloTerrazza = await getFloorLive(venueId, { now: ADESSO, roomId: sala.id });
    expect(Object.keys(soloTerrazza.byTableId)).toEqual([t4.id]);

    const tutti = await getFloorLive(venueId, { now: ADESSO });
    expect(Object.keys(tutti.byTableId).length).toBeGreaterThan(1);

    await db.table.delete({ where: { id: t4.id } });
    await db.room.delete({ where: { id: sala.id } });
  });

  it("non mostra i tavoli di un altro ristorante", async () => {
    await svuota();
    const org = await db.organization.create({
      data: { name: `${PREFISSO}altro`, slug: `${PREFISSO}altro-${Date.now()}` },
    });
    const altro = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    const suo = await db.table.create({ data: { venueId: altro.id, label: "X9", seats: 2 } });

    const live = await getFloorLive(venueId, { now: ADESSO });
    expect(live.byTableId[suo.id]).toBeUndefined();
    expect(t3 in live.byTableId).toBe(true);
  });
});
