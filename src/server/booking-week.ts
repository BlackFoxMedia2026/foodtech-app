import { db } from "@/lib/db";
import { shiftDateKey, todayInVenue } from "@/lib/venue-time";
import { PRESENTI, finestraGiorno, weekdayOfDateKey } from "./forecast";

/**
 * La settimana sui libri.
 *
 * Il calendario aveva solo il giorno: per rispondere a «avete posto sabato?»
 * bisognava premere la freccia cinque volte e leggere cinque pagine. Questa
 * vista risponde alla domanda che si fa al telefono, in un colpo d'occhio.
 *
 * **Non è la previsione.** Insight prevede quanti verranno; qui c'è quello che
 * è già prenotato, anche di settimane passate. Sono due domande diverse, e la
 * differenza è scritta nella pagina: se dicessero la stessa cosa con due
 * numeri diversi, uno dei due sarebbe sbagliato.
 *
 * Tornano **sette righe già sommate**, non le prenotazioni: una lista di
 * prenotazioni di sette giorni andrebbe paginata o troncata, e sette totali
 * non hanno questo problema. La popolazione contata è la stessa della
 * previsione (`PRESENTI`): due schermate che contano persone diverse per lo
 * stesso sabato sono un difetto che questo progetto ha già visto.
 */

export type GiornoSettimana = {
  /** `2026-09-12` */
  dateKey: string;
  /** 0 = domenica, come `Shift.weekday`. */
  weekday: number;
  /** Coperti prenotati, disdette e assenze escluse. */
  coperti: number;
  prenotazioni: number;
  /** Quante aspettano una conferma: è il motivo per cui si apre quel giorno. */
  inAttesa: number;
  /** Somma della capienza dei turni attivi. Nullo se quel giorno non ci sono turni. */
  capienza: number | null;
  /** Quanto è pieno, se la capienza è dichiarata. */
  occupazione: number | null;
  passato: boolean;
  oggi: boolean;
};

export type Settimana = {
  /** Il primo giorno mostrato. */
  dal: string;
  giorni: GiornoSettimana[];
  copertiTotali: number;
  prenotazioniTotali: number;
  inAttesaTotali: number;
};

/** Il lunedì della settimana che contiene questo giorno. */
export function lunediDella(dateKey: string): string {
  const weekday = weekdayOfDateKey(dateKey);
  // `weekday` è 0 per domenica: da domenica si torna indietro di sei giorni,
  // non di zero, altrimenti la settimana comincerebbe il giorno dopo.
  const indietro = weekday === 0 ? 6 : weekday - 1;
  return shiftDateKey(dateKey, -indietro);
}

export async function getSettimana(venueId: string, dalGiorno: string): Promise<Settimana> {
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { timezone: true },
  });
  const timeZone = venue.timezone;
  const oggi = todayInVenue(timeZone);

  const dal = lunediDella(dalGiorno);
  const chiavi = Array.from({ length: 7 }, (_, k) => shiftDateKey(dal, k));

  const inizio = finestraGiorno(chiavi[0], timeZone).start;
  const fine = finestraGiorno(chiavi[6], timeZone).end;

  const shifts = await db.shift.findMany({
    where: { venueId, active: true },
    select: { weekday: true, capacity: true },
  });
  const capienzaPerGiorno = new Map<number, number>();
  for (const s of shifts) {
    capienzaPerGiorno.set(s.weekday, (capienzaPerGiorno.get(s.weekday) ?? 0) + s.capacity);
  }

  const prenotazioni = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: { in: [...PRESENTI] },
      startsAt: { gte: inizio, lt: fine },
    },
    select: { startsAt: true, partySize: true, status: true },
  });

  const giorni: GiornoSettimana[] = chiavi.map((dateKey) => {
    const { start, end } = finestraGiorno(dateKey, timeZone);
    const delGiorno = prenotazioni.filter((b) => b.startsAt >= start && b.startsAt < end);
    const coperti = delGiorno.reduce((s, b) => s + b.partySize, 0);
    const capienza = capienzaPerGiorno.get(weekdayOfDateKey(dateKey)) ?? null;

    return {
      dateKey,
      weekday: weekdayOfDateKey(dateKey),
      coperti,
      prenotazioni: delGiorno.length,
      inAttesa: delGiorno.filter((b) => b.status === "PENDING").length,
      capienza,
      occupazione: capienza && capienza > 0 ? Math.round((coperti / capienza) * 100) : null,
      passato: dateKey < oggi,
      oggi: dateKey === oggi,
    };
  });

  return {
    dal,
    giorni,
    copertiTotali: giorni.reduce((s, g) => s + g.coperti, 0),
    prenotazioniTotali: giorni.reduce((s, g) => s + g.prenotazioni, 0),
    inAttesaTotali: giorni.reduce((s, g) => s + g.inAttesa, 0),
  };
}
