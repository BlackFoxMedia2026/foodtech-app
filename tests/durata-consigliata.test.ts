import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking } from "@/server/bookings";
import {
  durataConsigliata,
  DURATA_MASSIMA_MIN,
  DURATA_MINIMA_MIN,
  MINIMO_CONTESTO,
  fasciaDi,
  gruppoDi,
  scegliDurata,
  tipoGiornoDi,
  type CenaChiusa,
} from "@/server/durata-consigliata";
import { DURATA_PREDEFINITA_MIN } from "@/lib/durata";

/**
 * «Quanto dura questa cena».
 *
 * Il numero che esce da qui decide quanti tavoli il motore accetta di
 * vendere: se sbaglia in largo il locale resta vuoto, se sbaglia in stretto
 * la sala va in ritardo tutta la sera. Perciò qui si fissa per iscritto
 * **quando si misura e quando si ammette di non sapere**.
 */

const TZ = "Europe/Rome";

/** Una cena chiusa, descritta come serve alla misura. */
function cena(p: { persone: number; giorno: string; ora: number; durataMin: number }): CenaChiusa {
  // Le date sono scritte nel fuso di Roma: `2026-09-05T20:00` è un sabato sera.
  const startsAt = new Date(`${p.giorno}T${String(p.ora).padStart(2, "0")}:00:00+02:00`);
  return {
    partySize: p.persone,
    startsAt,
    seatedAt: startsAt,
    closedAt: new Date(startsAt.getTime() + p.durataMin * 60_000),
  };
}

function tante(n: number, p: Parameters<typeof cena>[0]): CenaChiusa[] {
  return Array.from({ length: n }, () => cena(p));
}

const SABATO_SERA = new Date("2026-09-05T20:30:00+02:00");
const MARTEDI_PRANZO = new Date("2026-09-08T12:30:00+02:00");

describe("i contesti sono come si apparecchia, non classi statistiche", () => {
  it("i gruppi seguono i tavoli: coppia, quadrato, tondo, tavolata", () => {
    expect(gruppoDi(1)).toBe("1-2");
    expect(gruppoDi(2)).toBe("1-2");
    expect(gruppoDi(4)).toBe("3-4");
    expect(gruppoDi(6)).toBe("5-6");
    expect(gruppoDi(7)).toBe("7+");
    expect(gruppoDi(20)).toBe("7+");
  });

  it("il taglio fra pranzo e cena è alle 16, quando nessuno serve", () => {
    expect(fasciaDi(new Date("2026-09-05T13:00:00+02:00"), TZ)).toBe("PRANZO");
    expect(fasciaDi(new Date("2026-09-05T15:59:00+02:00"), TZ)).toBe("PRANZO");
    expect(fasciaDi(new Date("2026-09-05T16:00:00+02:00"), TZ)).toBe("CENA");
    expect(fasciaDi(new Date("2026-09-05T21:00:00+02:00"), TZ)).toBe("CENA");
  });

  it("il fine settimana comincia il venerdì: per un ristorante il venerdì sera è sabato", () => {
    expect(tipoGiornoDi(new Date("2026-09-03T20:00:00+02:00"), TZ)).toBe("SETTIMANA"); // giovedì
    expect(tipoGiornoDi(new Date("2026-09-04T20:00:00+02:00"), TZ)).toBe("FINE_SETTIMANA"); // venerdì
    expect(tipoGiornoDi(new Date("2026-09-06T13:00:00+02:00"), TZ)).toBe("FINE_SETTIMANA"); // domenica
    expect(tipoGiornoDi(new Date("2026-09-07T20:00:00+02:00"), TZ)).toBe("SETTIMANA"); // lunedì
  });

  it("l'ora si legge nel fuso del locale, non in quello del processo", () => {
    // Mezzanotte e mezza a Roma è ancora «cena»; se si leggesse in UTC
    // sarebbero le 22:30, e resterebbe cena per caso. Il caso che conta è
    // l'una del pomeriggio a Roma vista da UTC come le 11: pranzo in
    // entrambi. Qui si verifica un'ora che cambia risposta: le 17 a Roma
    // sono le 15 UTC, cioè «pranzo» se si sbagliasse fuso.
    expect(fasciaDi(new Date("2026-09-05T17:00:00+02:00"), TZ)).toBe("CENA");
  });
});

describe("si scende di specificità solo quando i numeri lo permettono", () => {
  it("senza nessuna cena chiusa si propone la predefinita, e lo si dice", () => {
    const d = scegliDurata([], { partySize: 2, startsAt: SABATO_SERA }, TZ);
    expect(d.durataMin).toBe(DURATA_PREDEFINITA_MIN);
    expect(d.fonte).toBe("PREDEFINITA");
    expect(d.contesto).toBe("NESSUNO");
    expect(d.spiegazione).toContain("predefinita");
  });

  it("con abbastanza cene nel contesto stretto usa quello", () => {
    const cene = [
      ...tante(MINIMO_CONTESTO, { persone: 8, giorno: "2026-08-29", ora: 20, durataMin: 175 }),
      // rumore: gruppi e fasce diverse, che non devono entrare
      ...tante(30, { persone: 2, giorno: "2026-08-25", ora: 13, durataMin: 60 }),
    ];
    const d = scegliDurata(cene, { partySize: 8, startsAt: SABATO_SERA }, TZ);
    expect(d.contesto).toBe("GRUPPO_FASCIA_GIORNO");
    expect(d.durataMin).toBe(175);
    expect(d.misurate).toBe(MINIMO_CONTESTO);
    expect(d.spiegazione).toContain("7+ persone, a cena, nel fine settimana");
  });

  it("una cena in meno del minimo fa allargare al gradino successivo", () => {
    const cene = [
      // sabato sera: una in meno del minimo
      ...tante(MINIMO_CONTESTO - 1, { persone: 8, giorno: "2026-08-29", ora: 20, durataMin: 175 }),
      // martedì sera: completa il gruppo+fascia
      ...tante(MINIMO_CONTESTO, { persone: 8, giorno: "2026-08-25", ora: 20, durataMin: 130 }),
    ];
    const d = scegliDurata(cene, { partySize: 8, startsAt: SABATO_SERA }, TZ);
    expect(d.contesto).toBe("GRUPPO_FASCIA");
    // la mediana di 9 da 175 e 10 da 130 sta fra le due, arrotondata a 5
    expect(d.durataMin % 5).toBe(0);
    expect(d.misurate).toBe(MINIMO_CONTESTO * 2 - 1);
  });

  it("quando nemmeno il gruppo basta si guarda il locale intero", () => {
    const cene = tante(MINIMO_CONTESTO, { persone: 2, giorno: "2026-08-25", ora: 13, durataMin: 70 });
    const d = scegliDurata(cene, { partySize: 8, startsAt: SABATO_SERA }, TZ);
    expect(d.contesto).toBe("LOCALE");
    expect(d.durataMin).toBe(70);
    expect(d.spiegazione).toContain("tutto il locale");
  });

  it("pranzo e cena danno risposte diverse: è il motivo per cui esiste", () => {
    const cene = [
      ...tante(20, { persone: 2, giorno: "2026-08-25", ora: 13, durataMin: 65 }),
      ...tante(20, { persone: 2, giorno: "2026-08-25", ora: 20, durataMin: 140 }),
    ];
    const pranzo = scegliDurata(cene, { partySize: 2, startsAt: MARTEDI_PRANZO }, TZ);
    const cenaSabato = scegliDurata(cene, { partySize: 2, startsAt: SABATO_SERA }, TZ);
    expect(pranzo.durataMin).toBe(65);
    expect(cenaSabato.durataMin).toBe(140);
  });
});

describe("la misura non diventa una sciocchezza", () => {
  it("si arrotonda a cinque minuti: «137 minuti» è precisione finta", () => {
    const cene = tante(20, { persone: 2, giorno: "2026-08-25", ora: 20, durataMin: 137 });
    expect(scegliDurata(cene, { partySize: 2, startsAt: SABATO_SERA }, TZ).durataMin).toBe(135);
  });

  it("una mediana lunghissima si tiene entro il massimo, e lo dichiara", () => {
    // Conti chiusi a fine serata, non cene di sei ore: senza limite
    // chiuderebbero la sala.
    const cene = tante(20, { persone: 2, giorno: "2026-08-25", ora: 20, durataMin: 400 });
    const d = scegliDurata(cene, { partySize: 2, startsAt: SABATO_SERA }, TZ);
    expect(d.durataMin).toBe(DURATA_MASSIMA_MIN);
    expect(d.spiegazione).toContain("tenuta entro");
  });

  it("una mediana brevissima si tiene entro il minimo", () => {
    const cene = tante(20, { persone: 2, giorno: "2026-08-25", ora: 13, durataMin: 12 });
    const d = scegliDurata(cene, { partySize: 2, startsAt: MARTEDI_PRANZO }, TZ);
    expect(d.durataMin).toBe(DURATA_MINIMA_MIN);
  });

  it("le cene senza chiusura valida non entrano", () => {
    const rotte: CenaChiusa[] = tante(30, { persone: 2, giorno: "2026-08-25", ora: 20, durataMin: 120 }).map(
      (c) => ({ ...c, closedAt: new Date(c.seatedAt.getTime() - 60_000) }),
    );
    expect(scegliDurata(rotte, { partySize: 2, startsAt: SABATO_SERA }, TZ).fonte).toBe("PREDEFINITA");
  });

  it("la spiegazione dice sempre quante cene e quale contesto", () => {
    const cene = tante(14, { persone: 4, giorno: "2026-08-25", ora: 20, durataMin: 110 });
    const d = scegliDurata(cene, { partySize: 4, startsAt: SABATO_SERA }, TZ);
    expect(d.spiegazione).toMatch(/su 14 cene chiuse/);
    expect(d.misurate).toBe(14);
  });
});

/* -------------------------------------------------------------------------- */
/*  Contro il database: la durata proposta finisce davvero sulla prenotazione  */
/* -------------------------------------------------------------------------- */


describe("la durata misurata arriva sulla prenotazione nuova", () => {
  const db = new PrismaClient();
  const PREFISSO = "test-durata-";

  const url = process.env.DATABASE_URL ?? "";
  if (!/dev|test/i.test(url)) {
    throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
  }

  let venueId = "";

  /**
   * L'orologio delle prove, fermo a una cena di sabato.
   *
   * La fascia e il tipo di giorno si leggono dall'istante: con «adesso» i
   * test cambierebbero risposta a seconda dell'ora e del giorno in cui
   * girano — e a pranzo di lunedì fallirebbero senza che nulla sia rotto.
   */
  const SABATO_SERA = new Date("2026-09-05T20:30:00+02:00");

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
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.shift.create({
        data: { venueId, name: "Continuato", weekday, startMinute: 0, endMinute: 24 * 60 - 1, capacity: 60 },
      });
    }

    // Dodici cene chiuse da 145 minuti, quattro persone, sabato sera.
    for (let i = 1; i <= 12; i++) {
      const inizio = new Date(SABATO_SERA.getTime() - i * 7 * 24 * 3_600_000);
      await db.booking.create({
        data: {
          venueId,
          partySize: 4,
          startsAt: inizio,
          durationMin: 105,
          status: "COMPLETED",
          source: "PHONE",
          seatedAt: inizio,
          closedAt: new Date(inizio.getTime() + 145 * 60_000),
        },
      });
    }
  }, 60_000);

  afterAll(async () => {
    await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
    await db.$disconnect();
  }, 60_000);

  it("la misura del locale si legge dal database col contesto giusto", async () => {
    const d = await durataConsigliata(venueId, { partySize: 4, startsAt: SABATO_SERA }, { now: SABATO_SERA });
    expect(d.fonte).toBe("MISURATO");
    expect(d.durataMin).toBe(145);
    expect(d.misurate).toBe(12);
  });

  it("una prenotazione senza durata la prende dalla misura, non dai 105 fissi", async () => {
    const b = await createBooking(venueId, {
      guest: { firstName: "Senza", lastName: "Durata" },
      partySize: 4,
      startsAt: new Date(SABATO_SERA.getTime() + 7 * 24 * 3_600_000),
      source: "PHONE",
    });
    expect(b.durationMin).toBe(145);
  });

  it("una durata scritta a mano resta quella: nessuna statistica la corregge", async () => {
    const b = await createBooking(venueId, {
      guest: { firstName: "Con", lastName: "Durata" },
      partySize: 4,
      startsAt: new Date(SABATO_SERA.getTime() + 8 * 24 * 3_600_000),
      durationMin: 180,
      source: "PHONE",
    });
    expect(b.durationMin).toBe(180);
  });

  it("un gruppo senza misura nel suo contesto ricade sul locale, non sui 105", async () => {
    // Nessuna cena chiusa da dodici persone: si scende fino a «tutto il
    // locale», che qui misura 145.
    const d = await durataConsigliata(venueId, { partySize: 12, startsAt: SABATO_SERA }, { now: SABATO_SERA });
    expect(d.contesto).toBe("LOCALE");
    expect(d.durataMin).toBe(145);
  });
});
