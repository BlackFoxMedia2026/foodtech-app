import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  eliminaFasciaServizio,
  listFasceServizio,
  salvaFasciaServizio,
} from "@/server/turni-servizio";
import { descrizioneGiorni } from "@/lib/turni";

/**
 * I turni di servizio: gli orari in cui si accettano prenotazioni.
 *
 * Sotto, ogni giorno ha la sua riga; sopra, un turno è un turno e porta con sé
 * i giorni in cui si fa. Tutto quello che c'è da sbagliare sta in mezzo — un
 * giorno aggiunto che non crea la riga, un giorno tolto che la lascia lì — e
 * nessuno se ne accorgerebbe guardando la pagina: si vedrebbe al primo cliente
 * che prenota un lunedì in cui il locale è chiuso.
 */

const db = new PrismaClient();
const PREFISSO = "test-turni-servizio-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

const CENA = {
  nome: "Cena",
  inizio: "19:00",
  fine: "23:00",
  coperti: 90,
  minutiSlot: 15,
  giorni: [1, 2, 3, 4, 5, 6, 0],
};

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
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function ripulisci() {
  await db.shift.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
}

describe("un turno, non sette righe", () => {
  it("scrive una riga per ogni giorno scelto, e nessuna per gli altri", async () => {
    await ripulisci();
    await salvaFasciaServizio(venueId, { ...CENA, giorni: [5, 6] });

    const righe = await db.shift.findMany({ where: { venueId }, orderBy: { weekday: "asc" } });
    expect(righe.map((r) => r.weekday)).toEqual([5, 6]);
    expect(righe.every((r) => r.startMinute === 19 * 60 && r.endMinute === 23 * 60)).toBe(true);
    expect(righe.every((r) => r.capacity === 90 && r.slotMinutes === 15)).toBe(true);
  });

  it("le righe identiche si rileggono come un turno solo", async () => {
    await ripulisci();
    await salvaFasciaServizio(venueId, CENA);

    const fasce = await listFasceServizio(venueId);
    expect(fasce).toHaveLength(1);
    expect(fasce[0].giorni).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(descrizioneGiorni(fasce[0].giorni)).toBe("tutti i giorni");
  });

  it("un sabato configurato diverso resta un turno a parte, perché lo è", async () => {
    await ripulisci();
    await salvaFasciaServizio(venueId, { ...CENA, giorni: [1, 2, 3, 4, 5, 0] });
    await salvaFasciaServizio(venueId, { ...CENA, nome: "Cena del sabato", coperti: 120, giorni: [6] });

    const fasce = await listFasceServizio(venueId);
    expect(fasce).toHaveLength(2);
    expect(fasce.map((f) => f.coperti).sort((a, b) => a - b)).toEqual([90, 120]);
  });

  it("aggiungere un giorno crea la riga, toglierlo la porta via", async () => {
    await ripulisci();
    const prima = await salvaFasciaServizio(venueId, { ...CENA, giorni: [5, 6] });

    const conLunedi = await salvaFasciaServizio(venueId, {
      ...CENA,
      ids: prima.ids,
      giorni: [1, 5, 6],
    });
    expect(conLunedi.giorni).toEqual([1, 5, 6]);

    const soloSabato = await salvaFasciaServizio(venueId, {
      ...CENA,
      ids: conLunedi.ids,
      giorni: [6],
    });
    expect(soloSabato.giorni).toEqual([6]);

    const righe = await db.shift.findMany({ where: { venueId } });
    expect(righe).toHaveLength(1);
    expect(righe[0].weekday).toBe(6);
  });

  it("cambiare orario aggiorna le righe che c'erano, non ne crea di nuove", async () => {
    await ripulisci();
    const prima = await salvaFasciaServizio(venueId, CENA);
    const dopo = await salvaFasciaServizio(venueId, { ...CENA, ids: prima.ids, inizio: "19:30" });

    expect(dopo.inizioMinuti).toBe(19 * 60 + 30);
    expect(new Set(dopo.ids)).toEqual(new Set(prima.ids));
    expect(await db.shift.count({ where: { venueId } })).toBe(7);
  });
});

describe("le regole che il modulo pubblico non può permettersi di sbagliare", () => {
  it("una cena che finisce a mezzanotte finisce a 1440, non a zero", async () => {
    await ripulisci();
    const fascia = await salvaFasciaServizio(venueId, { ...CENA, inizio: "19:00", fine: "00:00" });
    expect(fascia.fineMinuti).toBe(24 * 60);
  });

  it("i minuti non si perdono per strada", async () => {
    await ripulisci();
    const fascia = await salvaFasciaServizio(venueId, {
      ...CENA,
      nome: "Pranzo",
      inizio: "12:30",
      fine: "14:45",
    });
    expect(fascia.inizioMinuti).toBe(12 * 60 + 30);
    expect(fascia.fineMinuti).toBe(14 * 60 + 45);
  });

  it("rifiuta un turno più corto dell'intervallo fra un orario e l'altro", async () => {
    await ripulisci();
    await expect(
      salvaFasciaServizio(venueId, { ...CENA, inizio: "19:00", fine: "19:10", minutiSlot: 30 }),
    ).rejects.toThrow(/più corto/);
  });

  it("rifiuta due turni con lo stesso nome nello stesso giorno", async () => {
    await ripulisci();
    await salvaFasciaServizio(venueId, { ...CENA, giorni: [6, 0] });
    await expect(
      salvaFasciaServizio(venueId, { ...CENA, inizio: "12:00", fine: "15:00", giorni: [0, 1] }),
    ).rejects.toThrow(/C'è già un turno «Cena»/);

    // E non ne lascia per strada: il controllo viene prima della scrittura.
    expect(await db.shift.count({ where: { venueId } })).toBe(2);
  });

  it("lo stesso nome in giorni diversi va benissimo", async () => {
    await ripulisci();
    await salvaFasciaServizio(venueId, { ...CENA, giorni: [6] });
    await expect(
      salvaFasciaServizio(venueId, { ...CENA, inizio: "18:00", fine: "22:00", giorni: [1] }),
    ).resolves.toBeTruthy();
  });
});

describe("un locale non tocca l'altro", () => {
  it("salvare qui non scrive righe là", async () => {
    await ripulisci();
    await salvaFasciaServizio(venueId, CENA);
    expect(await db.shift.count({ where: { venueId: altroVenueId } })).toBe(0);
  });

  it("le righe di un altro locale non si possono aggiornare passandone gli id", async () => {
    await ripulisci();
    const altrui = await salvaFasciaServizio(altroVenueId, { ...CENA, giorni: [6] });
    await expect(salvaFasciaServizio(venueId, { ...CENA, ids: altrui.ids })).rejects.toThrow("not_found");

    // La riga dell'altro locale è rimasta com'era.
    const dopo = await db.shift.findMany({ where: { venueId: altroVenueId } });
    expect(dopo).toHaveLength(1);
    expect(dopo[0].weekday).toBe(6);
  });

  it("nemmeno eliminare", async () => {
    await ripulisci();
    const altrui = await salvaFasciaServizio(altroVenueId, { ...CENA, giorni: [6] });
    await expect(eliminaFasciaServizio(venueId, altrui.ids)).rejects.toThrow("not_found");
    expect(await db.shift.count({ where: { venueId: altroVenueId } })).toBe(1);
  });
});

describe("eliminare", () => {
  it("toglie tutte le righe del turno in un colpo", async () => {
    await ripulisci();
    const fascia = await salvaFasciaServizio(venueId, CENA);
    const esito = await eliminaFasciaServizio(venueId, fascia.ids);
    expect(esito.eliminate).toBe(7);
    expect(await listFasceServizio(venueId)).toHaveLength(0);
  });
});
