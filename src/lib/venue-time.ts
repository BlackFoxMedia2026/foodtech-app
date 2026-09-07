/**
 * «Oggi» per un ristorante è il giorno del ristorante, non quello del server.
 *
 * Il codice usava `new Date().toISOString().slice(0, 10)` in otto punti, che
 * restituisce il giorno **in UTC**. In Italia d'estate (UTC+2) fra le 00:00 e
 * le 02:00 locali, e d'inverno fra le 00:00 e le 01:00, tutta l'interfaccia
 * mostrava il giorno prima: la Sala si apriva su ieri, il calendario
 * evidenziava ieri, il form nuova prenotazione proponeva ieri. È esattamente
 * la fascia in cui un ristorante chiude il servizio e registra gli ultimi
 * conti.
 *
 * `Venue.timezone` esisteva già (`Europe/Rome` per difetto) e il motore di
 * disponibilità lo rispettava: queste funzioni portano la stessa correttezza
 * nel resto dell'applicazione. Usano solo `Intl`, quindi valgono identiche sul
 * server e nel browser.
 */

export const DEFAULT_VENUE_TIMEZONE = "Europe/Rome";

/** Formattatori riusati: costruirne uno nuovo a ogni chiamata è costoso. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function isoFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    // Un fuso scritto male nella scheda del locale non deve far cadere la
    // pagina: si ripiega su quello di riferimento.
    created = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_VENUE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  formatters.set(timeZone, created);
  return created;
}

/** Il giorno in cui si trova il locale, come `YYYY-MM-DD`. */
export function todayInVenue(timeZone: string = DEFAULT_VENUE_TIMEZONE, now: Date = new Date()): string {
  // en-CA formatta già come YYYY-MM-DD.
  return isoFormatter(timeZone).format(now);
}

/** Lo stesso per un istante qualsiasi: utile per capire a quale giornata di
 * servizio appartiene una prenotazione. */
export function dateKeyInVenue(instant: Date, timeZone: string = DEFAULT_VENUE_TIMEZONE): string {
  return isoFormatter(timeZone).format(instant);
}

/** Somma giorni a una data `YYYY-MM-DD` restando su date pure, senza passare
 * per fusi orari: `2026-10-25` + 1 = `2026-10-26` anche nella notte in cui
 * l'ora cambia. */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
