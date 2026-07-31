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

export type ShiftLike = {
  id: string;
  name: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  capacity: number;
  active: boolean;
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
 * Carica il contesto e valuta la richiesta.
 * Legge solo la finestra di giornata che serve, non tutta la tabella.
 */
export async function checkAvailability(
  venueId: string,
  request: AvailabilityRequest,
): Promise<AvailabilityResult> {
  // Margine ampio attorno alla richiesta: prende le prenotazioni lunghe che iniziano
  // molto prima e potrebbero comunque sovrapporsi.
  const MARGIN_MS = 12 * 3_600_000;
  const windowFrom = new Date(request.startsAt.getTime() - MARGIN_MS);
  const windowTo = new Date(bookingEnd(request.startsAt, request.durationMin).getTime() + MARGIN_MS);

  const [venue, shifts, bookings, table, blocks] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    db.shift.findMany({
      where: { venueId, active: true },
      select: { id: true, name: true, weekday: true, startMinute: true, endMinute: true, capacity: true, active: true },
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
    request.tableId
      ? db.table.findFirst({
          where: { id: request.tableId, venueId },
          select: { id: true, label: true, seats: true, active: true },
        })
      : Promise.resolve(null),
    request.tableId
      ? db.tableBlock.findMany({
          where: { venueId, tableId: request.tableId, startsAt: { lte: windowTo }, endsAt: { gte: windowFrom } },
          select: { tableId: true, startsAt: true, endsAt: true },
        })
      : Promise.resolve([]),
  ]);

  return evaluateAvailability(request, {
    timezone: venue?.timezone ?? "Europe/Rome",
    shifts,
    bookings,
    table,
    blocks,
  });
}

/** Come `checkAvailability`, ma solleva `AvailabilityError` se la prenotazione non è accettabile. */
export async function assertAvailability(venueId: string, request: AvailabilityRequest): Promise<void> {
  const result = await checkAvailability(venueId, request);
  if (!result.available) throw new AvailabilityError(result.issues);
}
