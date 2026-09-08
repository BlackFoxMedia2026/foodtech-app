import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { deriveTableLiveStatus, type TableLiveStatus } from "@/lib/table-status";
import {
  comeLiberoVerso,
  previsioneLiberazione,
  type DurataTipica,
  type LiberoVerso,
} from "@/lib/liberazione";
import { cosaSapere, type RigaDaSapere } from "@/lib/cosa-sapere";
import { durataTipicaSeduta } from "./rotazione";

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
    /**
     * Quando si libera, e **da dove viene il numero**: `MISURATO` se la durata
     * arriva dalle cene chiuse di questo locale, `PREVISTO` se arriva dalla
     * durata scritta sulla prenotazione. Si conta da quando si sono seduti,
     * non dall'orario prenotato (vedi `lib/liberazione`).
     */
    liberoVerso: LiberoVerso | null;
    /**
     * Il conto aperto su questo tavolo, se c'è.
     *
     * Serve a due decisioni che in sala si prendono guardando il tavolo e non
     * un elenco: se un tavolo che sta per liberarsi ha ancora il conto a zero
     * righe, non sta per liberarsi; e un tavolo oltre la durata con un conto
     * già alto non è un problema, è la serata che va bene.
     *
     * `righe` è il numero di righe battute: zero righe su un tavolo seduto da
     * un'ora è un fatto che chi guarda deve poter vedere.
     */
    conto: { orderId: string; totalCents: number; righe: number } | null;
    /** Per chi deve arrivare: minuti all'orario (negativo = in ritardo). */
    minutesToArrival: number | null;
    isVip: boolean;
    allergies: string | null;
    /** Le cose da sapere su chi c'è, in ordine di urgenza (`lib/cosa-sapere`). */
    daSapere: RigaDaSapere[];
    /** Tavoli uniti a questo per la stessa prenotazione. */
    combinedWith: string[];
  } | null;
  /** La prossima prenotazione su questo tavolo, se diversa da quella corrente. */
  next: { bookingId: string; guestName: string; startsAt: string; partySize: number } | null;
};

export type FloorLive = {
  now: string;
  timezone: string;
  /**
   * Su cosa poggiano le previsioni di liberazione di questa sala: la durata
   * misurata qui, se ce n'è abbastanza, altrimenti niente — e in quel caso le
   * previsioni si basano sulla durata scritta sulle prenotazioni.
   *
   * Sta qui, una volta, e non come etichetta su ogni riga: è una proprietà
   * del locale, e ripeterla dodici volte sulla stessa schermata è rumore.
   */
  durata: { medianaMin: number; misurate: number } | null;
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
  opts: { now?: Date; roomId?: string | null; durataTipica?: DurataTipica | null } = {},
): Promise<FloorLive> {
  const now = opts.now ?? new Date();
  const from = startOfDay(now);
  const to = endOfDay(now);

  // Chi ci chiama può passarcela già letta (la fotografia del servizio la
  // legge per sé): così una pagina che mostra sala e servizio insieme non
  // interroga due volte lo stesso numero.
  const tipica =
    opts.durataTipica !== undefined ? opts.durataTipica : await durataTipicaSeduta(venueId, { now });

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
        guest: {
          select: {
            firstName: true,
            lastName: true,
            loyaltyTier: true,
            allergies: true,
            // Gli stessi fatti che usa la modalità Servizio: la sala e
            // l'elenco devono dire le stesse cose sulla stessa persona.
            privateNotes: true,
            preferences: true,
            totalVisits: true,
            noShowCount: true,
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.tableBlock.findMany({
      where: { venueId, startsAt: { lte: now }, endsAt: { gte: now } },
      select: { tableId: true },
    }),
  ]);

  const bloccati = new Set(blocks.map((b) => b.tableId));

  /**
   * I conti aperti delle prenotazioni di oggi: **una lettura sola**.
   *
   * Una per tavolo sarebbe una query per riquadro su una mappa che si
   * ricarica ogni trenta secondi — è esattamente il difetto che ho appena
   * finito di togliere altrove.
   */
  const conti = await db.order.findMany({
    where: {
      venueId,
      kind: "TABLE",
      bookingId: { in: bookings.map((b) => b.id) },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    select: {
      id: true,
      bookingId: true,
      totalCents: true,
      _count: { select: { OrderItem: true } },
    },
  });
  const contoPerPrenotazione = new Map(
    conti
      .filter((o): o is typeof o & { bookingId: string } => !!o.bookingId)
      .map((o) => [
        o.bookingId,
        { orderId: o.id, totalCents: o.totalCents, righe: o._count.OrderItem },
      ]),
  );

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

    // Una formula sola per «quando si libera»: la stessa che usa la
    // fotografia del servizio.
    const liberazione =
      corrente && corrente.status === "SEATED"
        ? previsioneLiberazione(corrente, now, tipica)
        : null;

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
            minutesToFree: liberazione ? liberazione.minuti : null,
            liberoVerso: liberazione ? comeLiberoVerso(liberazione, tipica?.misurate ?? null) : null,
            conto: contoPerPrenotazione.get(corrente.id) ?? null,
            minutesToArrival:
              corrente.status === "SEATED"
                ? null
                : Math.round((corrente.startsAt.getTime() - now.getTime()) / 60_000),
            isVip:
              corrente.guest?.loyaltyTier === "VIP" || corrente.guest?.loyaltyTier === "AMBASSADOR",
            allergies: corrente.guest?.allergies ?? null,
            daSapere: cosaSapere({
              allergies: corrente.guest?.allergies,
              privateNotes: corrente.guest?.privateNotes,
              preferences: corrente.guest?.preferences,
              visits: corrente.guest?.totalVisits,
              noShows: corrente.guest?.noShowCount,
              loyaltyTier: corrente.guest?.loyaltyTier,
              occasion: corrente.occasion,
            }),
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
    durata: tipica ?? null,
    byTableId,
    counters,
  };
}
