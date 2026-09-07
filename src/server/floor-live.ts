import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { deriveTableLiveStatus, type TableLiveStatus } from "@/lib/table-status";

/**
 * La sala in tempo reale.
 *
 * La pianta esistente sapeva dire se un tavolo era libero, prenotato o
 * occupato: abbastanza per configurare una sala, non per starci dentro
 * durante il servizio. Chi guarda la mappa alle nove di sera ha bisogno di
 * leggere **su ogni tavolo** chi c'è, da quando, e quanto manca — e di
 * distinguere un tavolo che sta per arrivare da uno che ha appena chiesto il
 * conto, perché sono due decisioni diverse.
 *
 * Come la modalità Servizio: tutto derivato, nessuna colonna nuova.
 */

export type TableLiveInfo = {
  tableId: string;
  status: TableLiveStatus;
  /** Chi c'è adesso, o chi sta arrivando su questo tavolo. */
  current: {
    bookingId: string;
    guestName: string;
    partySize: number;
    /** Orario previsto, come istante ISO. */
    startsAt: string;
    status: string;
    /** Per chi è seduto: minuti alla fine prevista (negativo = oltre). */
    minutesToFree: number | null;
    /** Per chi deve arrivare: minuti all'orario (negativo = in ritardo). */
    minutesToArrival: number | null;
    isVip: boolean;
    allergies: string | null;
    /** Tavoli uniti a questo per la stessa prenotazione. */
    combinedWith: string[];
  } | null;
  /** La prossima prenotazione su questo tavolo, se diversa da quella corrente. */
  next: { bookingId: string; guestName: string; startsAt: string; partySize: number } | null;
};

export type FloorLive = {
  now: string;
  timezone: string;
  byTableId: Record<string, TableLiveInfo>;
  counters: Record<TableLiveStatus, number>;
};

const EMPTY_COUNTERS: Record<TableLiveStatus, number> = {
  LIBERO: 0,
  PRENOTATO: 0,
  IN_ARRIVO: 0,
  OCCUPATO: 0,
  CONTO: 0,
  PULIZIA: 0,
  BLOCCATO: 0,
};

/** Ordine di rilevanza per chi legge: chi ha bisogno di attenzione sta sopra. */
export const LIVE_STATUS_ORDER: TableLiveStatus[] = [
  "CONTO",
  "OCCUPATO",
  "IN_ARRIVO",
  "PULIZIA",
  "PRENOTATO",
  "LIBERO",
  "BLOCCATO",
];

export async function getFloorLive(
  venueId: string,
  opts: { now?: Date; roomId?: string | null } = {},
): Promise<FloorLive> {
  const now = opts.now ?? new Date();
  const from = startOfDay(now);
  const to = endOfDay(now);

  const [venue, tables, bookings, blocks] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    db.table.findMany({
      where: { venueId, ...(opts.roomId ? { roomId: opts.roomId } : {}) },
      select: { id: true, active: true },
    }),
    db.booking.findMany({
      where: {
        venueId,
        startsAt: { gte: from, lte: to },
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
      },
      include: {
        guest: { select: { firstName: true, lastName: true, loyaltyTier: true, allergies: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.tableBlock.findMany({
      where: { venueId, startsAt: { lte: now }, endsAt: { gte: now } },
      select: { tableId: true },
    }),
  ]);

  const bloccati = new Set(blocks.map((b) => b.tableId));

  // Una prenotazione può occupare più tavoli (combinedTableIds): va indicizzata
  // su tutti, altrimenti la mappa mostra libero un tavolo che è parte di una
  // tavolata. Il motore di disponibilità lo fa già da luglio.
  const perTavolo = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const ids = [b.tableId, ...b.combinedTableIds].filter((id): id is string => !!id);
    for (const id of ids) {
      const lista = perTavolo.get(id);
      if (lista) lista.push(b);
      else perTavolo.set(id, [b]);
    }
  }

  const byTableId: Record<string, TableLiveInfo> = {};
  const counters = { ...EMPTY_COUNTERS };

  for (const table of tables) {
    const sue = perTavolo.get(table.id) ?? [];
    const status = deriveTableLiveStatus(table, sue, now, { blocked: bloccati.has(table.id) });
    counters[status] += 1;

    // «Corrente» è chi è seduto; se nessuno è seduto, chi sta arrivando.
    const seduta = sue.find((b) => b.status === "SEATED" && !b.closedAt);
    const inArrivo = sue.find(
      (b) =>
        b.status === "ARRIVED" ||
        ((b.status === "CONFIRMED" || b.status === "PENDING") &&
          new Date(b.startsAt.getTime() + b.durationMin * 60_000) > now),
    );
    const corrente = seduta ?? (status === "IN_ARRIVO" ? inArrivo : null) ?? null;

    const prossima = sue.find(
      (b) =>
        b.id !== corrente?.id &&
        (b.status === "CONFIRMED" || b.status === "PENDING") &&
        b.startsAt.getTime() > now.getTime(),
    );

    byTableId[table.id] = {
      tableId: table.id,
      status,
      current: corrente
        ? {
            bookingId: corrente.id,
            guestName: corrente.guest
              ? `${corrente.guest.firstName}${corrente.guest.lastName ? ` ${corrente.guest.lastName}` : ""}`
              : "Senza nome",
            partySize: corrente.partySize,
            startsAt: corrente.startsAt.toISOString(),
            status: corrente.status,
            minutesToFree:
              corrente.status === "SEATED"
                ? Math.round(
                    (corrente.startsAt.getTime() + corrente.durationMin * 60_000 - now.getTime()) / 60_000,
                  )
                : null,
            minutesToArrival:
              corrente.status === "SEATED"
                ? null
                : Math.round((corrente.startsAt.getTime() - now.getTime()) / 60_000),
            isVip:
              corrente.guest?.loyaltyTier === "VIP" || corrente.guest?.loyaltyTier === "AMBASSADOR",
            allergies: corrente.guest?.allergies ?? null,
            combinedWith: corrente.combinedTableIds.filter((id) => id !== table.id),
          }
        : null,
      next: prossima
        ? {
            bookingId: prossima.id,
            guestName: prossima.guest
              ? `${prossima.guest.firstName}${prossima.guest.lastName ? ` ${prossima.guest.lastName}` : ""}`
              : "Senza nome",
            startsAt: prossima.startsAt.toISOString(),
            partySize: prossima.partySize,
          }
        : null,
    };
  }

  return {
    now: now.toISOString(),
    timezone: venue?.timezone ?? "Europe/Rome",
    byTableId,
    counters,
  };
}
