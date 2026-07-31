import { db } from "@/lib/db";

/**
 * Controllo di disponibilità: unica fonte di verità su "questa prenotazione si può accettare?".
 *
 * Vive nel livello server e non nelle route, così la stessa regola vale per la sala,
 * per il widget pubblico e per qualunque canale aggiunto in futuro.
 *
 * Cosa verifica, in ordine:
 *  1. il locale è aperto in quell'orario (turni configurati);
 *  2. la capienza del turno regge i coperti già prenotati nello stesso momento;
 *  3. se è stato scelto un tavolo: esiste, è attivo, ha abbastanza posti,
 *     non è fuori servizio e non è già occupato.
 *
 * Convenzioni ereditate dallo schema:
 *  - `Shift.weekday` segue `Date.getDay()`, quindi 0 = domenica;
 *  - orari dei turni in minuti dalla mezzanotte, nel fuso del locale;
 *  - un locale senza alcun turno configurato non ha vincoli di orario (config assente
 *    ≠ locale chiuso), mentre un locale con turni ma non in quel giorno è chiuso.
 */

/** Stati che tengono davvero occupati posti e tavoli. */
export const OCCUPYING_STATUSES = ["CONFIRMED", "PENDING", "ARRIVED", "SEATED"] as const;

/** Durata di una prenotazione quando non è specificata, allineata al valore dello schema. */
export const DEFAULT_DURATION_MIN = 105;

/** Fuso usato se il locale non ne ha uno configurato, allineato al valore dello schema. */
export const DEFAULT_TIMEZONE = "Europe/Rome";

/**
 * `COMPLETED`, `CANCELLED` e `NO_SHOW` non occupano: il tavolo è tornato libero.
 * Per `COMPLETED` è una scelta deliberata — permette di riassegnare un tavolo appena
 * chiuso a un walk-in, che è esattamente la rotazione che i ristoranti cercano.
 */

export type AvailabilityIssueCode =
  | "VENUE_CLOSED"
  | "SHIFT_FULL"
  | "TABLE_NOT_FOUND"
  | "TABLE_INACTIVE"
  | "TABLE_TOO_SMALL"
  | "TABLE_BLOCKED"
  | "TABLE_BUSY";

export type AvailabilityIssue = {
  code: AvailabilityIssueCode;
  /** Messaggio già leggibile da un utente finale, in italiano. */
  message: string;
};

export type AvailabilityRequest = {
  startsAt: Date;
  durationMin: number;
  partySize: number;
  tableId?: string | null;
  /** Da valorizzare quando si sposta una prenotazione esistente: non deve scontrarsi con se stessa. */
  excludeBookingId?: string | null;
};

export type AvailabilityResult = {
  available: boolean;
  issues: AvailabilityIssue[];
  /** Contesto utile a chi mostra l'esito: capienza del turno e coperti già impegnati. */
  shift: { id: string; name: string; capacity: number } | null;
  seatsTaken: number;
};

/* -------------------------------------------------------------------------- */
/*  Funzioni pure — nessun accesso al database, verificabili in isolamento     */
/* -------------------------------------------------------------------------- */

/** Due intervalli si sovrappongono? Il contatto agli estremi non è sovrapposizione. */
export function overlapsRange(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Fine di una prenotazione a partire da inizio e durata. */
export function bookingEnd(startsAt: Date, durationMin: number): Date {
  return new Date(startsAt.getTime() + durationMin * 60_000);
}

/** Due prenotazioni, espresse come inizio + durata, si sovrappongono? */
export function overlaps(aStart: Date, aDurationMin: number, bStart: Date, bDurationMin: number): boolean {
  return overlapsRange(aStart, bookingEnd(aStart, aDurationMin), bStart, bookingEnd(bStart, bDurationMin));
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Giorno della settimana e minuti dalla mezzanotte **nel fuso del locale**.
 *
 * Serve perché `startsAt` è un istante assoluto: leggerlo con l'ora del server
 * farebbe sbagliare turno ogni volta che il server non vive nel fuso del locale.
 */
export function zonedDayAndMinute(date: Date, timeZone: string): { weekday: number; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAY_INDEX[get("weekday")] ?? date.getDay();
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return { weekday, minuteOfDay: hour * 60 + minute };
}

/** Di quanto il fuso indicato è avanti rispetto a UTC, nell'istante dato. */
function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  // I millisecondi non compaiono nelle parti formattate: li riallineo per non
  // introdurre un errore inferiore al secondo.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * L'istante assoluto corrispondente a un orario **del locale**.
 *
 * `date` è la data civile nel fuso del locale (anno, mese, giorno), `minuteOfDay`
 * i minuti dalla mezzanotte. Serve per trasformare "il 3 agosto alle 20:00 a Roma"
 * nell'istante giusto, cosa che `new Date("2026-08-03T20:00")` non fa: quello usa
 * il fuso di chi esegue il codice, che per un widget pubblico è il browser del cliente.
 *
 * La doppia lettura dell'offset serve nei giorni di cambio dell'ora, quando l'offset
 * all'istante ipotetico e quello all'istante corretto non coincidono.
 */
export function zonedTimeToInstant(
  date: { year: number; month: number; day: number },
  minuteOfDay: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);

  const firstGuess = naive - timezoneOffsetMs(new Date(naive), timeZone);
  const corrected = naive - timezoneOffsetMs(new Date(firstGuess), timeZone);

  return new Date(corrected);
}

/** La data civile (nel fuso del locale) di un istante. */
export function zonedCalendarDate(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export type ShiftLike = {
  id: string;
  name: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  capacity: number;
  active: boolean;
  /** Passo fra un orario prenotabile e il successivo, in minuti. */
  slotMinutes: number;
};

/**
 * Il turno che copre l'orario richiesto. Fra più turni sovrapposti vince quello
 * con la capienza minore: davanti a una configurazione ambigua è meglio rifiutare
 * una prenotazione in più che accettarne una impossibile.
 */
export function findShiftFor(shifts: ShiftLike[], weekday: number, minuteOfDay: number): ShiftLike | null {
  const matching = shifts
    .filter((s) => s.active && s.weekday === weekday)
    .filter((s) => minuteOfDay >= s.startMinute && minuteOfDay <= s.endMinute);

  if (matching.length === 0) return null;
  return matching.reduce((min, s) => (s.capacity < min.capacity ? s : min), matching[0]);
}

export type BookingLike = {
  id: string;
  startsAt: Date;
  durationMin: number;
  partySize: number;
  tableId: string | null;
  combinedTableIds: string[];
};

export type TableLike = {
  id: string;
  label: string;
  seats: number;
  active: boolean;
};

export type BlockLike = {
  tableId: string;
  startsAt: Date;
  endsAt: Date;
};

export type AvailabilityContext = {
  timezone: string;
  /** Turni del locale. Vuoto = nessun vincolo di orario. */
  shifts: ShiftLike[];
  /** Prenotazioni che occupano posti, già ripulite di quelle annullate e cancellate. */
  bookings: BookingLike[];
  /** Il tavolo richiesto, se ne è stato scelto uno. */
  table: TableLike | null;
  /** Fuori servizio che riguardano il tavolo richiesto. */
  blocks: BlockLike[];
};

/** Un tavolo è impegnato da una prenotazione anche quando fa parte di una combinazione. */
function bookingUsesTable(booking: BookingLike, tableId: string): boolean {
  return booking.tableId === tableId || booking.combinedTableIds.includes(tableId);
}

/**
 * Il cuore della decisione, in forma pura: stessi dati in ingresso, stesso esito.
 * Raccoglie tutti i motivi di rifiuto invece di fermarsi al primo, così chi prenota
 * capisce in un colpo solo cosa non torna.
 */
export function evaluateAvailability(
  request: AvailabilityRequest,
  context: AvailabilityContext,
): AvailabilityResult {
  const issues: AvailabilityIssue[] = [];
  const { startsAt, durationMin, partySize } = request;

  const relevant = context.bookings.filter(
    (b) => b.id !== request.excludeBookingId && overlaps(startsAt, durationMin, b.startsAt, b.durationMin),
  );

  // 1. Il locale è aperto?
  let shift: ShiftLike | null = null;
  const hasAnyShift = context.shifts.some((s) => s.active);

  if (hasAnyShift) {
    const { weekday, minuteOfDay } = zonedDayAndMinute(startsAt, context.timezone);
    shift = findShiftFor(context.shifts, weekday, minuteOfDay);
    if (!shift) {
      issues.push({
        code: "VENUE_CLOSED",
        message: "Il locale non è aperto in questo orario. Scegli un altro momento.",
      });
    }
  }

  // 2. La capienza del turno regge?
  const seatsTaken = relevant.reduce((sum, b) => sum + b.partySize, 0);

  if (shift && seatsTaken + partySize > shift.capacity) {
    const left = Math.max(0, shift.capacity - seatsTaken);
    issues.push({
      code: "SHIFT_FULL",
      message:
        left === 0
          ? `Il servizio ${shift.name} è al completo in questo orario.`
          : `Nel servizio ${shift.name} restano ${left} coperti in questo orario, ne servono ${partySize}.`,
    });
  }

  // 3. Il tavolo scelto regge?
  if (request.tableId) {
    const table = context.table;

    if (!table) {
      issues.push({ code: "TABLE_NOT_FOUND", message: "Il tavolo scelto non esiste in questo locale." });
    } else {
      if (!table.active) {
        issues.push({ code: "TABLE_INACTIVE", message: `Il tavolo ${table.label} non è in servizio.` });
      }

      if (table.seats < partySize) {
        issues.push({
          code: "TABLE_TOO_SMALL",
          message: `Il tavolo ${table.label} ha ${table.seats} posti, non bastano per ${partySize} persone.`,
        });
      }

      const block = context.blocks.find(
        (b) =>
          b.tableId === table.id &&
          overlapsRange(startsAt, bookingEnd(startsAt, durationMin), b.startsAt, b.endsAt),
      );
      if (block) {
        issues.push({
          code: "TABLE_BLOCKED",
          message: `Il tavolo ${table.label} è fuori servizio in questo orario.`,
        });
      }

      const busy = relevant.find((b) => bookingUsesTable(b, table.id));
      if (busy) {
        issues.push({
          code: "TABLE_BUSY",
          message: `Il tavolo ${table.label} è già occupato in questo orario.`,
        });
      }
    }
  }

  return { available: issues.length === 0, issues, shift: shift && { id: shift.id, name: shift.name, capacity: shift.capacity }, seatsTaken };
}

/* -------------------------------------------------------------------------- */
/*  Accesso ai dati                                                            */
/* -------------------------------------------------------------------------- */

/** Errore sollevato quando una prenotazione non è accettabile. */
export class AvailabilityError extends Error {
  readonly issues: AvailabilityIssue[];

  constructor(issues: AvailabilityIssue[]) {
    super(issues.map((i) => i.message).join(" "));
    this.name = "AvailabilityError";
    this.issues = issues;
  }
}

/**
 * Margine attorno alla finestra richiesta: cattura le prenotazioni lunghe che
 * iniziano molto prima e possono comunque sovrapporsi.
 */
const WINDOW_MARGIN_MS = 12 * 3_600_000;

/**
 * Carica una volta tutto ciò che serve a decidere, per un intervallo di tempo.
 *
 * Sta separato da `checkAvailability` perché valutare un'intera giornata di orari
 * deve costare una lettura sola, non una per orario.
 */
export async function loadAvailabilityContext(
  venueId: string,
  from: Date,
  to: Date,
  tableId?: string | null,
): Promise<AvailabilityContext> {
  const windowFrom = new Date(from.getTime() - WINDOW_MARGIN_MS);
  const windowTo = new Date(to.getTime() + WINDOW_MARGIN_MS);

  const [venue, shifts, bookings, table, blocks] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    db.shift.findMany({
      where: { venueId, active: true },
      select: {
        id: true,
        name: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
        capacity: true,
        active: true,
        slotMinutes: true,
      },
    }),
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        status: { in: [...OCCUPYING_STATUSES] },
        startsAt: { gte: windowFrom, lte: windowTo },
      },
      select: { id: true, startsAt: true, durationMin: true, partySize: true, tableId: true, combinedTableIds: true },
    }),
    tableId
      ? db.table.findFirst({
          where: { id: tableId, venueId },
          select: { id: true, label: true, seats: true, active: true },
        })
      : Promise.resolve(null),
    tableId
      ? db.tableBlock.findMany({
          where: { venueId, tableId, startsAt: { lte: windowTo }, endsAt: { gte: windowFrom } },
          select: { tableId: true, startsAt: true, endsAt: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    timezone: venue?.timezone ?? DEFAULT_TIMEZONE,
    shifts,
    bookings,
    table,
    blocks,
  };
}

/** Carica il contesto e valuta una singola richiesta. */
export async function checkAvailability(
  venueId: string,
  request: AvailabilityRequest,
): Promise<AvailabilityResult> {
  const context = await loadAvailabilityContext(
    venueId,
    request.startsAt,
    bookingEnd(request.startsAt, request.durationMin),
    request.tableId,
  );

  return evaluateAvailability(request, context);
}

/** Come `checkAvailability`, ma solleva `AvailabilityError` se la prenotazione non è accettabile. */
export async function assertAvailability(venueId: string, request: AvailabilityRequest): Promise<void> {
  const result = await checkAvailability(venueId, request);
  if (!result.available) throw new AvailabilityError(result.issues);
}

/* -------------------------------------------------------------------------- */
/*  Orari prenotabili di una giornata                                          */
/* -------------------------------------------------------------------------- */

export type Slot = {
  /** Istante assoluto in formato ISO: chi prenota lo rimanda indietro identico. */
  startsAt: string;
  /** Come si legge nel locale, es. "20:15". */
  label: string;
  available: boolean;
  /** Coperti ancora liberi nel turno, se il turno è noto. */
  seatsLeft: number | null;
};

export type ShiftSlots = { shiftId: string; name: string; slots: Slot[] };

export type DayAvailability = {
  /** Data civile richiesta, nel fuso del locale. */
  date: string;
  timezone: string;
  /** Vero quando in quel giorno non c'è alcun servizio. */
  closed: boolean;
  shifts: ShiftSlots[];
};

export type DaySlotsRequest = {
  /** Data civile nel fuso del locale. */
  date: { year: number; month: number; day: number };
  partySize: number;
  durationMin: number;
  /** Adesso, per scartare gli orari già passati. Esplicito per restare verificabile. */
  now: Date;
};

/**
 * Gli orari prenotabili di una giornata, turno per turno.
 *
 * È pura come `evaluateAvailability`: riceve il contesto già caricato e valuta ogni
 * orario in memoria, così mostrare una giornata costa una sola lettura del database.
 */
export function buildDaySlots(request: DaySlotsRequest, context: AvailabilityContext): DayAvailability {
  const { date, partySize, durationMin, now } = request;
  const isoDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;

  // Il giorno della settimana della data civile, indipendente dal fuso.
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();

  const timeLabel = new Intl.DateTimeFormat("it-IT", {
    timeZone: context.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const dayShifts = context.shifts
    .filter((s) => s.active && s.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute);

  const shifts: ShiftSlots[] = dayShifts.map((shift) => {
    const step = Math.max(5, shift.slotMinutes);
    const slots: Slot[] = [];

    for (let minute = shift.startMinute; minute <= shift.endMinute; minute += step) {
      const startsAt = zonedTimeToInstant(date, minute, context.timezone);

      // Un orario già passato non è prenotabile, e non serve nemmeno mostrarlo.
      if (startsAt.getTime() <= now.getTime()) continue;

      const result = evaluateAvailability({ startsAt, durationMin, partySize }, context);

      slots.push({
        startsAt: startsAt.toISOString(),
        label: timeLabel.format(startsAt),
        available: result.available,
        seatsLeft: result.shift ? Math.max(0, result.shift.capacity - result.seatsTaken) : null,
      });
    }

    return { shiftId: shift.id, name: shift.name, slots };
  });

  return {
    date: isoDate,
    timezone: context.timezone,
    closed: dayShifts.length === 0,
    shifts: shifts.filter((s) => s.slots.length > 0),
  };
}

/** Orari prenotabili di una giornata, leggendo il contesto dal database una volta sola. */
export async function getDayAvailability(
  venueId: string,
  date: { year: number; month: number; day: number },
  partySize: number,
  opts: { durationMin?: number; now?: Date } = {},
): Promise<DayAvailability> {
  const durationMin = opts.durationMin ?? DEFAULT_DURATION_MIN;
  const now = opts.now ?? new Date();

  // Serve il fuso del locale prima di poter delimitare la giornata: la finestra
  // "dalle 00:00 alle 23:59 del locale" dipende da esso.
  const venue = await db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } });
  const timezone = venue?.timezone ?? DEFAULT_TIMEZONE;

  const dayStart = zonedTimeToInstant(date, 0, timezone);
  const dayEnd = zonedTimeToInstant(date, 24 * 60, timezone);

  const context = await loadAvailabilityContext(venueId, dayStart, dayEnd);

  return buildDaySlots({ date, partySize, durationMin, now }, { ...context, timezone });
}
