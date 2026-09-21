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

/**
 * L'inizio e la fine di una giornata **del locale**, come istanti.
 *
 * Serve ogni volta che si chiede «cosa è successo oggi»: `startOfDay` di
 * `lib/utils` risponde nel fuso del processo, che su Vercel è UTC, e all'una
 * di notte a Roma risponde con la giornata di ieri. È il difetto che la
 * Panoramica ha avuto fino al 21 settembre 2026, e che l'agente aveva nella
 * domanda «chi rischia di mancare».
 *
 * Sta qui e non in `server/insights.ts` perché a chiederlo sono due posti, e
 * due copie della stessa aritmetica divergono al primo ritocco.
 *
 * La fine è l'ultimo millisecondo del giorno, non la mezzanotte dopo: si usa
 * con `lte`, e con la mezzanotte dopo una prenotazione delle 00:00 di domani
 * finirebbe dentro entrambe le giornate.
 */
export function giornataInVenue(
  istante: Date,
  timeZone: string = DEFAULT_VENUE_TIMEZONE,
): { inizio: Date; fine: Date } {
  const chiave = dateKeyInVenue(istante, timeZone);
  const inizio = mezzanotteInVenue(chiave, timeZone);
  const domani = mezzanotteInVenue(shiftDateKey(chiave, 1), timeZone);
  return { inizio, fine: new Date(domani.getTime() - 1) };
}

/**
 * L'inizio di una data `AAAA-MM-GG` nel fuso del locale.
 *
 * Si ipotizza che sia mezzanotte UTC, si guarda che ora sarebbe in quel fuso e
 * si corregge della differenza. Poi si **controlla di essere finiti nel giorno
 * giusto**, e se no si avanza di un'ora per volta.
 *
 * ## Il secondo passaggio che ho tolto
 *
 * La prima versione correggeva due volte, «per il cambio d'ora». Un test l'ha
 * smentita: in Cile, dove l'orologio cambia **a mezzanotte**, la mezzanotte
 * del 6 settembre 2026 *non esiste* — il giorno comincia all'01:00. Con una
 * correzione si ottiene proprio quell'istante; con due si finisce alle 23:00
 * del **5 settembre**, cioè nel giorno prima. Un giorno di prenotazioni
 * attribuito alla data sbagliata, due volte l'anno, solo in certi paesi.
 *
 * Quindi: una correzione, e poi la verifica sul giorno. Il controllo è più
 * onesto della formula — dice cosa si vuole («l'inizio di *questo* giorno»)
 * invece di sperare che l'aritmetica ci arrivi.
 */
export function mezzanotteInVenue(
  dateKey: string,
  timeZone: string = DEFAULT_VENUE_TIMEZONE,
): Date {
  const ipotesi = new Date(`${dateKey}T00:00:00.000Z`);
  let istante = new Date(ipotesi.getTime() - scartoFuso(ipotesi, timeZone));

  /* Se la correzione ci ha lasciati nel giorno prima — mezzanotte che non
     esiste, o uno scalino attraversato — si avanza fino a entrare nel giorno
     chiesto. Tre ore bastano per qualunque salto d'ora esistente; il limite
     evita un ciclo infinito su un fuso inventato. */
  for (let i = 0; i < 3 && dateKeyInVenue(istante, timeZone) < dateKey; i++) {
    istante = new Date(istante.getTime() + 3_600_000);
  }
  return istante;
}

/** Di quanto il fuso del locale è avanti rispetto a UTC, in quell'istante. */
function scartoFuso(istante: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    /* Dichiarato invece che sperato: senza, mezzanotte può essere scritta
       «24» e letta come numero sposta di un giorno. Con `h23` è sempre «00»,
       e il ramo che gestiva il 24 — mai eseguito su questo runtime, e quindi
       non verificabile — non serve più. */
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(istante);
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? "00";
  const letto = Date.parse(
    `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}Z`,
  );
  return letto - istante.getTime();
}

/** Formattatori d'orario riusati, per fuso. Come sopra: costruirne uno a ogni
 *  chiamata costa, e qui si chiama una volta per tavolo a ogni aggiornamento. */
const oreFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * L'ora di un istante **nel fuso del locale**, come `20:30`.
 *
 * Era scritta dentro la mappa del Servizio, e il pannello del tavolo ne
 * avrebbe avuta una seconda copia: due funzioni che devono dare la stessa
 * risposta sulla stessa riga dello stesso schermo. `formatTime` di `lib/utils`
 * non serve — usa il fuso di chi guarda, e un gestore che apre la sala dal
 * telefono in vacanza leggerebbe orari che in sala non esistono.
 */
export function oraInVenue(
  instant: Date | string,
  timeZone: string = DEFAULT_VENUE_TIMEZONE,
): string {
  let f = oreFormatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("it-IT", { timeZone, hour: "2-digit", minute: "2-digit" });
    } catch {
      f = new Intl.DateTimeFormat("it-IT", {
        timeZone: DEFAULT_VENUE_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    oreFormatters.set(timeZone, f);
  }
  return f.format(typeof instant === "string" ? new Date(instant) : instant);
}
