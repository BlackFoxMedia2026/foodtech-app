import { Prisma, type Booking, type BookingStatus, type Guest, type Table } from "@prisma/client";
import { recordAudit, type AuditActor } from "./audit";
import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "@/lib/utils";

export type FloorBooking = Booking & { guest: Guest | null; table: Table | null };

/**
 * Maps a named service (e.g. "Cena") to its configured time-of-day window
 * for the given date's weekday, using the same Shift model that already
 * backs `listServiceOptions()` elsewhere (Sala/Camerieri) — no new "service"
 * concept introduced. Returns null when no Shift row is configured for that
 * exact weekday+name combination; callers should fall back to the whole day
 * rather than guessing an arbitrary lunch/dinner split.
 */
export async function getShiftWindowForDate(
  venueId: string,
  date: Date,
  serviceName: string,
): Promise<{ start: Date; end: Date } | null> {
  const weekday = date.getDay();
  const shift = await db.shift.findFirst({ where: { venueId, name: serviceName, weekday, active: true } });
  if (!shift) return null;

  const dayStart = startOfDay(date);
  const start = new Date(dayStart.getTime() + shift.startMinute * 60_000);
  const end = new Date(dayStart.getTime() + shift.endMinute * 60_000);
  return { start, end };
}

/**
 * Which configured service is happening right now, by wall-clock time —
 * used only to pick a sane DEFAULT service for the Mappa view on first
 * load. Without this, the default fell back to the first service ordered
 * by start time (usually "Pranzo"), which silently hid real dinner
 * bookings from "Da assegnare" behind a misleading "tutte assegnate"
 * empty state whenever someone opened the page outside lunch hours.
 * Returns null if no shift covers the current moment (e.g. venue closed).
 */
export async function getCurrentServiceName(venueId: string, date: Date): Promise<string | null> {
  const weekday = date.getDay();
  const shifts = await db.shift.findMany({ where: { venueId, weekday, active: true } });
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return shifts.find((s) => nowMinutes >= s.startMinute && nowMinutes < s.endMinute)?.name ?? null;
}

const ACTIVE_STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING", "ARRIVED", "SEATED", "COMPLETED"];

export class BookingAssignError extends Error {
  constructor(
    public code:
      | "booking_not_found"
      | "table_not_found"
      | "table_conflict"
      | "capacity_mismatch"
      | "retry"
      | "needs_two_tables"
      | "not_combinable"
      | "different_rooms"
      | "reason_required",
    public detail?: unknown,
  ) {
    super(code);
  }
}

function overlaps(aStart: Date, aDurationMin: number, bStart: Date, bDurationMin: number) {
  const aEnd = new Date(aStart.getTime() + aDurationMin * 60_000);
  const bEnd = new Date(bStart.getTime() + bDurationMin * 60_000);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Assigns (or reassigns) a booking to a table, atomically re-checking
 * availability server-side (brief sections 23/29/47) — the frontend's view
 * of "this table is free" can be stale the moment two users act at once.
 * Runs at Serializable isolation so a genuine race between two concurrent
 * assignments to the same table is caught by Postgres itself (one call
 * throws a serialization failure, mapped below to a retriable "retry" —
 * see the API route) rather than silently overwriting.
 */
/**
 * Come ogni errore di assegnazione diventa una risposta HTTP e una frase.
 *
 * Stavano dentro la route: con una seconda route che solleva gli stessi errori
 * sarebbero diventate due liste da tenere allineate a mano, e la prima volta
 * che ne aggiungi uno te ne accorgi in produzione.
 */
export const ASSIGN_ERROR_STATUS: Record<BookingAssignError["code"], number> = {
  booking_not_found: 404,
  table_not_found: 404,
  table_conflict: 409,
  capacity_mismatch: 409,
  retry: 409,
  needs_two_tables: 422,
  not_combinable: 422,
  different_rooms: 422,
  reason_required: 422,
};

export const ASSIGN_ERROR_MESSAGE: Record<BookingAssignError["code"], string> = {
  booking_not_found: "Prenotazione non trovata.",
  table_not_found: "Tavolo non trovato.",
  table_conflict: "Questo tavolo è stato appena assegnato a un'altra prenotazione.",
  capacity_mismatch: "Il tavolo ha meno posti dei previsti per questa prenotazione.",
  retry: "Il tavolo è stato modificato nel frattempo. Riprova.",
  needs_two_tables: "Per unire servono almeno due tavoli.",
  not_combinable: "Uno dei tavoli scelti non si può unire agli altri.",
  different_rooms: "I tavoli da unire devono stare nella stessa sala.",
  reason_required: "Scrivi il motivo: i posti non bastano per questo gruppo.",
};

/**
 * Chi occupa questi tavoli, in questo momento.
 *
 * Guarda `tableId` **e** `combinedTableIds`: una prenotazione che ha unito i
 * tavoli 4 e 5 occupa il 5 senza averlo come tavolo principale, e la vecchia
 * verifica non lo vedeva. Assegnare il 5 a qualcun altro sarebbe passato senza
 * un errore — il motore di disponibilità lo sapeva, questa strada no.
 */
async function trovaConflitto(
  tx: Prisma.TransactionClient,
  venueId: string,
  bookingId: string,
  tableIds: string[],
  quando: { startsAt: Date; durationMin: number },
): Promise<{ id: string; tableId: string | null } | null> {
  const dayStart = startOfDay(quando.startsAt);
  const dayEnd = endOfDay(quando.startsAt);
  const candidates = await tx.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      id: { not: bookingId },
      status: { in: ACTIVE_STATUSES },
      startsAt: { gte: dayStart, lte: dayEnd },
      OR: [{ tableId: { in: tableIds } }, { combinedTableIds: { hasSome: tableIds } }],
    },
    select: { id: true, tableId: true, startsAt: true, durationMin: true },
  });
  return (
    candidates.find((c) => overlaps(quando.startsAt, quando.durationMin, c.startsAt, c.durationMin)) ?? null
  );
}

/**
 * Assegna un tavolo a una prenotazione.
 *
 * Forzare l'assegnazione su un tavolo con meno posti dei coperti **richiede un
 * motivo scritto**, come già accade per le tavolate e per la creazione
 * forzata. Prima no: l'interfaccia del Servizio lo chiedeva perfino, e poi lo
 * buttava via per la strada del tavolo singolo — quindi nel registro restava
 * «forzata» senza il perché, che è la parte utile. E la scorciatoia senza
 * motivo diventa la scorciatoia di sempre.
 */
export async function assignBookingToTable(
  venueId: string,
  bookingId: string,
  tableId: string,
  opts: { force?: boolean; forceReason?: string; actor?: AuditActor } = {},
): Promise<FloorBooking> {
  try {
    const assigned = await db.$transaction(
      async (tx) => {
        const booking = await tx.booking.findFirst({ where: { id: bookingId, venueId, deletedAt: null } });
        if (!booking) throw new BookingAssignError("booking_not_found");

        const table = await tx.table.findFirst({ where: { id: tableId, venueId, active: true } });
        if (!table) throw new BookingAssignError("table_not_found");

        if (table.seats < booking.partySize) {
          if (!opts.force) {
            throw new BookingAssignError("capacity_mismatch", {
              tableSeats: table.seats,
              partySize: booking.partySize,
            });
          }
          if (!opts.forceReason?.trim()) throw new BookingAssignError("reason_required");
        }

        const conflict = await trovaConflitto(tx, venueId, bookingId, [tableId], booking);
        if (conflict) throw new BookingAssignError("table_conflict");

        // Assegnare un tavolo singolo scioglie l'eventuale tavolata: lasciare
        // gli altri tavoli attaccati a una prenotazione spostata altrove
        // significherebbe tenerli occupati per sempre.
        return tx.booking.update({
          where: { id: bookingId },
          data: { tableId, combinedTableIds: [] },
          include: { guest: true, table: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Il caso forzato ha un'azione sua: è l'unico modo in cui un tavolo può
    // accogliere più coperti di quanti ne ha, e chi controlla dopo deve poterlo
    // cercare senza scorrere tutte le assegnazioni.
    await recordAudit(
      opts.actor,
      opts.force ? "booking.assign_table_forced" : "booking.assign_table",
      "booking",
      bookingId,
      {
        tavolo: tableId,
        coperti: assigned.partySize,
        postiTavolo: assigned.table?.seats ?? null,
        ...(opts.forceReason?.trim() ? { motivoForzatura: opts.forceReason.trim() } : {}),
      },
    );

    return assigned;
  } catch (err) {
    if (err instanceof BookingAssignError) throw err;
    // Postgres serialization failure (40001) from a genuinely concurrent
    // conflicting transaction — the caller should refetch and let the user
    // retry, not treat it as the same "already taken" case (that one is
    // caught explicitly above with a clearer, non-retriable message).
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "40001") throw new BookingAssignError("retry");
    throw err;
  }
}

/**
 * Unire più tavoli per una tavolata.
 *
 * `combinedTableIds` esisteva già e tutto il resto dell'applicazione lo
 * rispettava — la sala mostra la tavolata su ogni tavolo che occupa, il motore
 * di disponibilità non li offre ad altri — ma **crearla si poteva solo dal
 * database**. Durante un servizio è un gesto normale: arrivano in dieci, si
 * accostano due tavoli da sei.
 *
 * Il primo tavolo dell'elenco diventa quello principale, gli altri i suoi
 * accostati. Le regole:
 *
 * - **almeno due tavoli**: per uno solo c'è l'assegnazione normale;
 * - **tutti nella stessa sala**: accostare un tavolo del dehors a uno interno
 *   non è una tavolata, è un errore di battitura;
 * - **tutti unibili** (`Table.combinable`, un campo che esisteva e che nessuno
 *   leggeva): un séparé fissato al muro non si accosta a niente;
 * - **i posti devono bastare**, e se non bastano ci vuole un motivo scritto —
 *   come per la forzatura della disponibilità. Undici persone su dieci posti
 *   può essere una scelta del locale, ma deve essere una scelta;
 * - **nessuno dei tavoli può essere occupato** nella fascia della
 *   prenotazione, considerando anche le tavolate altrui.
 */
export async function combineTablesForBooking(
  venueId: string,
  bookingId: string,
  tableIds: string[],
  opts: { force?: boolean; forceReason?: string; actor?: AuditActor } = {},
): Promise<FloorBooking> {
  const unici = [...new Set(tableIds)];
  if (unici.length < 2) throw new BookingAssignError("needs_two_tables");

  try {
    const aggiornata = await db.$transaction(
      async (tx) => {
        const booking = await tx.booking.findFirst({ where: { id: bookingId, venueId, deletedAt: null } });
        if (!booking) throw new BookingAssignError("booking_not_found");

        const tables = await tx.table.findMany({ where: { id: { in: unici }, venueId, active: true } });
        if (tables.length !== unici.length) throw new BookingAssignError("table_not_found");

        const nonUnibili = tables.filter((t) => !t.combinable).map((t) => t.label);
        if (nonUnibili.length > 0) throw new BookingAssignError("not_combinable", { tavoli: nonUnibili });

        const sale = new Set(tables.map((t) => t.roomId ?? "senza-sala"));
        if (sale.size > 1) throw new BookingAssignError("different_rooms");

        const posti = tables.reduce((s, t) => s + t.seats, 0);
        if (posti < booking.partySize) {
          if (!opts.force) throw new BookingAssignError("capacity_mismatch", { posti, coperti: booking.partySize });
          if (!opts.forceReason?.trim()) throw new BookingAssignError("reason_required");
        }

        const conflict = await trovaConflitto(tx, venueId, bookingId, unici, booking);
        if (conflict) throw new BookingAssignError("table_conflict", { prenotazione: conflict.id });

        // L'ordine conta: il primo è il tavolo principale, quello che compare
        // nelle liste dove c'è spazio per un nome solo.
        return tx.booking.update({
          where: { id: bookingId },
          data: { tableId: unici[0], combinedTableIds: unici.slice(1) },
          include: { guest: true, table: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await recordAudit(
      opts.actor,
      opts.force ? "booking.combine_tables_forced" : "booking.combine_tables",
      "booking",
      bookingId,
      {
        tavoli: unici,
        coperti: aggiornata.partySize,
        ...(opts.forceReason ? { motivoForzatura: opts.forceReason } : {}),
      },
    );

    return aggiornata;
  } catch (err) {
    if (err instanceof BookingAssignError) throw err;
    if ((err as { code?: string } | undefined)?.code === "40001") throw new BookingAssignError("retry");
    throw err;
  }
}

/**
 * Dividere una tavolata: resta il tavolo principale, gli altri tornano liberi.
 *
 * Non serve nessuna verifica: liberare non può creare un conflitto. È
 * l'operazione che deve funzionare sempre, perché è quella che si fa quando
 * qualcosa è andato storto.
 */
export async function splitTablesForBooking(
  venueId: string,
  bookingId: string,
  opts: { actor?: AuditActor } = {},
): Promise<FloorBooking> {
  const booking = await db.booking.findFirst({ where: { id: bookingId, venueId, deletedAt: null } });
  if (!booking) throw new BookingAssignError("booking_not_found");

  const aggiornata = await db.booking.update({
    where: { id: bookingId },
    data: { combinedTableIds: [] },
    include: { guest: true, table: true },
  });

  await recordAudit(opts.actor, "booking.split_tables", "booking", bookingId, {
    tavoliLiberati: booking.combinedTableIds,
  });

  return aggiornata;
}
