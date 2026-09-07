import { db } from "@/lib/db";
import { dateKeyInVenue, shiftDateKey, todayInVenue } from "@/lib/venue-time";
import { zonedTimeToInstant } from "@/server/availability";

/**
 * Quanto sarai pieno, e come lo sappiamo.
 *
 * Una previsione dei coperti è utile solo se chi la legge può decidere se
 * crederci. Quindi qui non c'è un numero da solo: c'è il numero, **da dove
 * viene** e **quanto è solido**. Se la storia non basta, non si prevede
 * niente — meglio «non lo sappiamo ancora» di una cifra che sembra un dato.
 *
 * Il modello è quello che usano gli alberghi, ed è spiegabile in una riga:
 * **a tre giorni dal servizio, di solito hai già il 60% dei coperti finali.**
 * Se oggi ne hai 42, la sera finirà intorno a 70. Non serve altro, e
 * soprattutto non serve niente che non si possa raccontare a un ristoratore.
 *
 * Le tre regole che tengono la previsione onesta:
 *
 * - **si confrontano giorni comparabili**: un sabato con i sabati, mai con la
 *   media della settimana. In un ristorante il giorno della settimana è la
 *   variabile che spiega quasi tutto;
 * - **serve un minimo di storia** (`GIORNI_MINIMI`): sotto quella soglia la
 *   previsione non si mostra;
 * - **non si divide per un numero minuscolo**: a dieci giorni dal servizio la
 *   quota già prenotata può essere il 3%, e dividere per 0,03 produce numeri
 *   assurdi. Sotto `QUOTA_MINIMA` si passa alla mediana storica di quel giorno.
 */

/** Quante settimane indietro si guarda per costruire il confronto. */
export const SETTIMANE_STORICHE = 8;

/** Sotto questi giorni comparabili non si prevede niente. */
export const GIORNI_MINIMI = 4;

/**
 * La quota minima già prenotata sotto la quale non si fa la proporzione.
 * Dividere per una quota piccolissima amplifica il rumore invece di prevedere.
 */
export const QUOTA_MINIMA = 0.15;

/**
 * Oltre questa quota già prenotata, la proporzione non aggiunge niente: il
 * libro di oggi è praticamente il totale finale, e va detto così invece di
 * annunciare «hai già il 100%», che sembra un errore.
 */
const QUOTA_SATURA = 0.95;

/** Su quanti giorni si misura la quota di assenze del locale. */
const GIORNI_NO_SHOW = 90;

/** Gli stati di chi, a fine serata, è stato un coperto vero. */
/**
 * Chi conta come presente: tutti tranne disdette e assenze.
 *
 * Esportato perché la stessa popolazione la usa la vista settimana: se le due
 * contassero persone diverse, due schermate della stessa applicazione
 * darebbero due numeri per lo stesso sabato — ed è già successo.
 */
export const PRESENTI = ["PENDING", "CONFIRMED", "SEATED", "ARRIVED", "COMPLETED"] as const;

const GIORNI_SETTIMANA = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"] as const;

export type Confidenza = "buona" | "scarsa" | "assente";

export type DayForecast = {
  dateKey: string;
  weekday: number;
  weekdayLabel: string;
  giorniDaOggi: number;
  /** Somma della capienza dei turni attivi di quel giorno. Nullo se non ce ne sono. */
  capacity: number | null;
  /** Coperti già prenotati adesso. */
  bookedCovers: number;
  /** La previsione, al netto delle assenze attese. Nullo quando non c'è storia. */
  forecastCovers: number | null;
  expectedNoShowCovers: number;
  occupancyPct: number | null;
  confidenza: Confidenza;
  giorniComparabili: number;
  /** Quanto di solito è già prenotato a questa distanza dal servizio. */
  quotaTipica: number | null;
  /** La frase da mostrare: perché quel numero, e quanto fidarsi. */
  why: string;
};

export type WeekdayOccupancy = {
  weekday: number;
  label: string;
  /** Quanti giorni di quel tipo abbiamo davvero misurato. */
  giorni: number;
  copertiMedi: number;
  capacity: number | null;
  occupancyPct: number | null;
};

/* -------------------------------------------------------------------------- */
/*  Aiuti                                                                     */
/* -------------------------------------------------------------------------- */

/** I due istanti che delimitano una giornata **nel fuso del locale**. */
export function finestraGiorno(dateKey: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = zonedTimeToInstant({ year, month, day }, 0, timeZone);
  const domani = shiftDateKey(dateKey, 1);
  const [y2, m2, d2] = domani.split("-").map(Number);
  const end = zonedTimeToInstant({ year: y2, month: m2, day: d2 }, 0, timeZone);
  return { start, end };
}

/** Il giorno della settimana di una data pura, senza passare per i fusi. */
export function weekdayOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function mediana(valori: number[]): number | null {
  if (valori.length === 0) return null;
  const ordinati = [...valori].sort((a, b) => a - b);
  const mezzo = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 === 1 ? ordinati[mezzo] : (ordinati[mezzo - 1] + ordinati[mezzo]) / 2;
}

function confidenzaDa(giorni: number): Confidenza {
  if (giorni >= GIORNI_MINIMI) return "buona";
  if (giorni >= 2) return "scarsa";
  return "assente";
}

function percentuale(q: number): string {
  return `${Math.round(q * 100)}%`;
}

/* -------------------------------------------------------------------------- */
/*  Previsione                                                                */
/* -------------------------------------------------------------------------- */

type PrenotazioneStorica = { startsAt: Date; createdAt: Date; partySize: number };

/**
 * La previsione dei prossimi giorni, un giorno per volta.
 *
 * Una sola lettura delle prenotazioni per tutto il periodo — passato e futuro
 * — e poi i conti in memoria: sono qualche migliaio di righe per locale, e
 * interrogare il database una volta per giorno significherebbe cinquanta
 * interrogazioni per disegnare una schermata.
 */
export async function getWeekForecast(
  venueId: string,
  opts: { now?: Date; giorni?: number } = {}
): Promise<DayForecast[]> {
  const now = opts.now ?? new Date();
  const quantiGiorni = opts.giorni ?? 7;

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { timezone: true },
  });
  const timeZone = venue.timezone;
  const oggi = todayInVenue(timeZone, now);

  const shifts = await db.shift.findMany({
    where: { venueId, active: true },
    select: { weekday: true, capacity: true },
  });
  const capacityPerWeekday = new Map<number, number>();
  for (const s of shifts) {
    capacityPerWeekday.set(s.weekday, (capacityPerWeekday.get(s.weekday) ?? 0) + s.capacity);
  }

  const inizioStoria = finestraGiorno(shiftDateKey(oggi, -SETTIMANE_STORICHE * 7), timeZone).start;
  const fineFuturo = finestraGiorno(shiftDateKey(oggi, quantiGiorni), timeZone).end;

  const prenotazioni = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: { in: [...PRESENTI] },
      startsAt: { gte: inizioStoria, lt: fineFuturo },
    },
    select: { startsAt: true, createdAt: true, partySize: true },
  });

  const noShowRate = await quotaAssenze(venueId, now);

  const risultati: DayForecast[] = [];
  for (let k = 0; k < quantiGiorni; k++) {
    const dateKey = shiftDateKey(oggi, k);
    risultati.push(
      previsioneDelGiorno({
        dateKey,
        giorniDaOggi: k,
        timeZone,
        prenotazioni,
        capacity: capacityPerWeekday.get(weekdayOfDateKey(dateKey)) ?? null,
        noShowRate,
      })
    );
  }
  return risultati;
}

function copertiNellaFinestra(
  prenotazioni: PrenotazioneStorica[],
  start: Date,
  end: Date,
  entro?: Date
): number {
  let somma = 0;
  for (const b of prenotazioni) {
    if (b.startsAt < start || b.startsAt >= end) continue;
    if (entro && b.createdAt > entro) continue;
    somma += b.partySize;
  }
  return somma;
}

function previsioneDelGiorno(args: {
  dateKey: string;
  giorniDaOggi: number;
  timeZone: string;
  prenotazioni: PrenotazioneStorica[];
  capacity: number | null;
  noShowRate: number;
}): DayForecast {
  const { dateKey, giorniDaOggi, timeZone, prenotazioni, capacity, noShowRate } = args;
  const weekday = weekdayOfDateKey(dateKey);
  const weekdayLabel = GIORNI_SETTIMANA[weekday];

  const finestra = finestraGiorno(dateKey, timeZone);
  const bookedCovers = copertiNellaFinestra(prenotazioni, finestra.start, finestra.end);

  // I giorni comparabili: stesso giorno della settimana, nelle settimane
  // passate. Per ognuno si guarda quanto era già prenotato alla stessa
  // distanza dal servizio e quanto è stato alla fine.
  const quote: number[] = [];
  const finali: number[] = [];
  for (let s = 1; s <= SETTIMANE_STORICHE; s++) {
    const passato = shiftDateKey(dateKey, -7 * s);
    const f = finestraGiorno(passato, timeZone);
    const finale = copertiNellaFinestra(prenotazioni, f.start, f.end);
    if (finale <= 0) continue;
    finali.push(finale);
    // Il momento in cui, quella settimana, si era alla stessa distanza.
    const stessoPunto = new Date(f.start.getTime() - giorniDaOggi * 86_400_000);
    const allora = copertiNellaFinestra(prenotazioni, f.start, f.end, stessoPunto);
    quote.push(allora / finale);
  }

  const giorniComparabili = finali.length;
  const confidenza = confidenzaDa(giorniComparabili);
  const quotaTipica = mediana(quote);
  const medianaFinali = mediana(finali);

  let grezza: number | null = null;
  let spiegazione = "";

  if (confidenza === "assente") {
    spiegazione =
      giorniComparabili === 0
        ? `Non abbiamo ancora un ${weekdayLabel} con cui confrontare: nessuna previsione.`
        : `Un solo ${weekdayLabel} confrontabile: troppo poco per una previsione.`;
  } else if (quotaTipica != null && quotaTipica >= QUOTA_MINIMA) {
    grezza = bookedCovers / quotaTipica;
    // Quando la quota è vicina a uno, dire «hai già il 100% dei coperti
    // finali» suona come un errore del programma. Vuol dire un'altra cosa, e
    // va detta: da te si prenota in anticipo, quindi il libro di oggi è già
    // quasi il conto finale.
    spiegazione =
      quotaTipica >= QUOTA_SATURA
        ? "Da te si prenota con anticipo: a questo punto il libro è già quasi il totale della serata."
        : giorniDaOggi === 0
          ? `A servizio iniziato di solito hai già il ${percentuale(quotaTipica)} dei coperti finali.`
          : `A ${giorniDaOggi} ${giorniDaOggi === 1 ? "giorno" : "giorni"} dal servizio, di solito hai già il ${percentuale(
              quotaTipica
            )} dei coperti finali.`;
  } else if (medianaFinali != null) {
    grezza = Math.max(medianaFinali, bookedCovers);
    spiegazione = `Troppo presto perché le prenotazioni dicano qualcosa: qui c'è la mediana dei tuoi ultimi ${weekdayLabel} (${Math.round(
      medianaFinali
    )} coperti).`;
  }

  // La stima grezza non può essere sotto i coperti già a libro: quelli sono un
  // fatto, non una previsione.
  const expectedNoShowCovers = grezza != null ? Math.round(grezza * noShowRate) : 0;
  const forecastCovers = grezza != null ? Math.max(0, Math.round(grezza) - expectedNoShowCovers) : null;

  const occupancyPct =
    forecastCovers != null && capacity && capacity > 0 ? Math.round((forecastCovers / capacity) * 100) : null;

  const dettagli = [spiegazione];
  if (grezza != null && expectedNoShowCovers > 0) {
    dettagli.push(`Togliamo ${expectedNoShowCovers} coperti di assenze attese (${percentuale(noShowRate)} storico).`);
  }
  if (confidenza === "scarsa") {
    dettagli.push(`Solo ${giorniComparabili} ${weekdayLabel} confrontabili: prendila con le molle.`);
  }
  if (!capacity) {
    dettagli.push("Nessun turno configurato per questo giorno: non possiamo dire quanto sia pieno.");
  }

  return {
    dateKey,
    weekday,
    weekdayLabel,
    giorniDaOggi,
    capacity,
    bookedCovers,
    forecastCovers,
    expectedNoShowCovers,
    occupancyPct,
    confidenza,
    giorniComparabili,
    quotaTipica,
    why: dettagli.join(" "),
  };
}

/** La quota di assenze del locale, misurata sugli ultimi tre mesi. */
export async function quotaAssenze(venueId: string, now: Date = new Date()): Promise<number> {
  const da = new Date(now.getTime() - GIORNI_NO_SHOW * 86_400_000);
  const [assenze, totale] = await Promise.all([
    db.booking.count({ where: { venueId, deletedAt: null, status: "NO_SHOW", startsAt: { gte: da, lte: now } } }),
    db.booking.count({
      where: {
        venueId,
        deletedAt: null,
        status: { in: ["NO_SHOW", "COMPLETED", "SEATED", "ARRIVED"] },
        startsAt: { gte: da, lte: now },
      },
    }),
  ]);
  if (totale === 0) return 0;
  return assenze / totale;
}

/* -------------------------------------------------------------------------- */
/*  Occupazione per giorno della settimana                                    */
/* -------------------------------------------------------------------------- */

/**
 * Quanto è pieno un tuo martedì, in media.
 *
 * È il numero che dice dove c'è margine: un venerdì al 95% non ha bisogno di
 * campagne, un martedì al 40% sì. La capienza è quella dichiarata nei turni —
 * se un giorno non ha turni configurati, la percentuale non si mostra invece
 * di inventare una capienza.
 */
export async function getOccupancyByWeekday(
  venueId: string,
  opts: { settimane?: number; now?: Date } = {}
): Promise<WeekdayOccupancy[]> {
  const settimane = opts.settimane ?? SETTIMANE_STORICHE;
  const now = opts.now ?? new Date();

  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } });
  const timeZone = venue.timezone;
  const oggi = todayInVenue(timeZone, now);

  const shifts = await db.shift.findMany({
    where: { venueId, active: true },
    select: { weekday: true, capacity: true },
  });
  const capacityPerWeekday = new Map<number, number>();
  for (const s of shifts) {
    capacityPerWeekday.set(s.weekday, (capacityPerWeekday.get(s.weekday) ?? 0) + s.capacity);
  }

  /**
   * Da quando questo locale ha davvero dei dati.
   *
   * Senza questo taglio le medie erano una bugia per omissione: si dividevano
   * i coperti su otto settimane anche quando il locale ne aveva registrate
   * quattro, e le quattro settimane vuote — in cui nessuno stava usando il
   * programma — abbassavano l'occupazione della metà. Una serata senza
   * prenotazioni dentro il periodo in cui si registra è un dato; una serata
   * prima che si registrasse non è niente.
   */
  const primaPrenotazione = await db.booking.findFirst({
    where: { venueId, deletedAt: null },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });

  const inizioRichiesto = finestraGiorno(shiftDateKey(oggi, -settimane * 7), timeZone).start;
  const inizio =
    primaPrenotazione && primaPrenotazione.startsAt > inizioRichiesto
      ? finestraGiorno(dateKeyInVenue(primaPrenotazione.startsAt, timeZone), timeZone).start
      : inizioRichiesto;
  const fine = finestraGiorno(oggi, timeZone).start;

  const prenotazioni = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      // La stessa popolazione della previsione: tutti tranne chi ha disdetto e
      // chi è stato segnato assente. Contare solo i servizi chiusi
      // (`COMPLETED`) sembrava più rigoroso e invece mentiva: nei locali che
      // non chiudono le prenotazioni a fine serata l'occupazione risultava un
      // terzo di quella vera, e le due tabelle di questa schermata dicevano
      // numeri diversi sulle stesse serate.
      status: { in: [...PRESENTI] },
      startsAt: { gte: inizio, lt: fine },
    },
    select: { startsAt: true, createdAt: true, partySize: true },
  });

  const perGiorno = new Map<number, number[]>();
  for (let g = 1; g <= settimane * 7; g++) {
    const dateKey = shiftDateKey(oggi, -g);
    const weekday = weekdayOfDateKey(dateKey);
    const f = finestraGiorno(dateKey, timeZone);
    // Fuori dal periodo in cui il locale ha dati: non è una serata vuota.
    if (f.start < inizio) continue;
    const coperti = copertiNellaFinestra(prenotazioni, f.start, f.end);
    // Un giorno di chiusura non è un giorno vuoto: senza turni non entra nella
    // media, altrimenti abbasserebbe l'occupazione di tutti gli altri.
    if (!capacityPerWeekday.has(weekday)) continue;
    const elenco = perGiorno.get(weekday) ?? [];
    elenco.push(coperti);
    perGiorno.set(weekday, elenco);
  }

  const risultati: WeekdayOccupancy[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const valori = perGiorno.get(weekday);
    if (!valori || valori.length === 0) continue;
    const capacity = capacityPerWeekday.get(weekday) ?? null;
    const copertiMedi = valori.reduce((s, v) => s + v, 0) / valori.length;
    risultati.push({
      weekday,
      label: GIORNI_SETTIMANA[weekday],
      giorni: valori.length,
      copertiMedi: Math.round(copertiMedi),
      capacity,
      occupancyPct: capacity && capacity > 0 ? Math.round((copertiMedi / capacity) * 100) : null,
    });
  }

  // Dal più vuoto al più pieno: la domanda a cui questa tabella risponde è
  // «dove ho margine?», non «com'è ordinata la settimana».
  return risultati.sort((a, b) => (a.occupancyPct ?? 999) - (b.occupancyPct ?? 999));
}
