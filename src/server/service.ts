import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { listWaitlist, expireStaleOffers, type WaitlistView } from "./waitlist";

/**
 * Modalità Servizio: la risposta a «cosa sta succedendo adesso».
 *
 * È la schermata che mancava. La Panoramica risponde a «com'è la giornata»,
 * Prenotazioni a «chi viene», la Sala a «dove li metto». Durante il servizio,
 * chi accoglie ha bisogno di un'altra cosa: chi sta arrivando, chi è già
 * seduto da troppo, chi non si è presentato, quali tavoli stanno per
 * liberarsi. Su una schermata sola, aggiornata, leggibile con una mano.
 *
 * Tutto qui è **derivato**: nessuno stato nuovo nel database. Un tavolo «da
 * liberare» non è una colonna, è una prenotazione seduta la cui durata prevista
 * è scaduta. Uno stato calcolato non può andare fuori sincrono con la realtà;
 * una colonna sì.
 */

/** Dopo quanti minuti di ritardo una prenotazione va segnalata. */
export const LATE_GRACE_MIN = 10;

/** Oltre questo ritardo, chiedere «è un no-show?» diventa legittimo. */
export const NO_SHOW_SUGGEST_MIN = 30;

/** Quanto prima del previsto un tavolo seduto entra fra quelli «in chiusura». */
export const FREEING_SOON_MIN = 15;

export type ServiceBooking = {
  id: string;
  startsAt: string;
  durationMin: number;
  partySize: number;
  status: string;
  guestId: string | null;
  guestName: string;
  phone: string | null;
  tableId: string | null;
  tableLabel: string | null;
  notes: string | null;
  occasion: string | null;
  allergies: string | null;
  isVip: boolean;
  depositCents: number;
  depositStatus: string;
  /** Minuti da adesso all'orario previsto: negativo = è in ritardo. */
  minutesToArrival: number;
  /** Minuti di ritardo oltre la tolleranza; 0 se non è in ritardo. */
  lateBy: number;
  /** Per chi è già seduto: minuti alla fine prevista. Negativo = oltre. */
  minutesToFree: number | null;
  source: string;
};

export type ServiceSnapshot = {
  now: string;
  timezone: string;
  /** Chi è seduto adesso. */
  seated: ServiceBooking[];
  /** Chi è arrivato e aspetta di essere accomodato. */
  arrived: ServiceBooking[];
  /** Chi doveva già essere qui e non si è presentato. */
  late: ServiceBooking[];
  /** I prossimi arrivi, entro la finestra scelta. */
  next: ServiceBooking[];
  /** Tavoli seduti la cui durata prevista è scaduta o sta per scadere. */
  freeingSoon: ServiceBooking[];
  waitlist: WaitlistView[];
  counters: {
    copertiPresenti: number;
    tavoliOccupati: number;
    tavoliLiberi: number;
    tavoliTotali: number;
    inArrivo: number;
    inRitardo: number;
    inAttesa: number;
    personeInAttesa: number;
    walkInOggi: number;
    /** Coperti previsti nel resto della giornata, esclusi annullati e no-show. */
    copertiPrevisti: number;
  };
};

type BookingRow = Awaited<ReturnType<typeof loadBookings>>[number];

function loadBookings(venueId: string, from: Date, to: Date) {
  return db.booking.findMany({
    where: {
      venueId,
      startsAt: { gte: from, lte: to },
      deletedAt: null,
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      guest: { select: { id: true, firstName: true, lastName: true, phone: true, allergies: true, loyaltyTier: true } },
      table: { select: { id: true, label: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

function toServiceBooking(b: BookingRow, now: Date): ServiceBooking {
  const minutesToArrival = Math.round((b.startsAt.getTime() - now.getTime()) / 60_000);
  const isLate =
    (b.status === "CONFIRMED" || b.status === "PENDING") && minutesToArrival < -LATE_GRACE_MIN;
  const fine = new Date(b.startsAt.getTime() + b.durationMin * 60_000);

  return {
    id: b.id,
    startsAt: b.startsAt.toISOString(),
    durationMin: b.durationMin,
    partySize: b.partySize,
    status: b.status,
    guestId: b.guest?.id ?? null,
    guestName: b.guest
      ? `${b.guest.firstName}${b.guest.lastName ? ` ${b.guest.lastName}` : ""}`
      : "Senza nome",
    phone: b.guest?.phone ?? null,
    tableId: b.table?.id ?? null,
    tableLabel: b.table?.label ?? null,
    notes: b.notes,
    occasion: b.occasion,
    allergies: b.guest?.allergies ?? null,
    isVip: b.guest?.loyaltyTier === "VIP" || b.guest?.loyaltyTier === "AMBASSADOR",
    depositCents: b.depositCents,
    depositStatus: b.depositStatus,
    minutesToArrival,
    lateBy: isLate ? Math.abs(minutesToArrival) - LATE_GRACE_MIN : 0,
    minutesToFree: b.status === "SEATED" ? Math.round((fine.getTime() - now.getTime()) / 60_000) : null,
    source: b.source,
  };
}

/**
 * La fotografia del servizio in questo istante.
 *
 * `nextWindowMin` è la finestra degli arrivi: 30, 60 o 90 minuti. Chi accoglie
 * guarda avanti quanto gli serve — nei momenti di punta 30 minuti, in una
 * serata tranquilla 90.
 */
export async function getServiceSnapshot(
  venueId: string,
  opts: { now?: Date; nextWindowMin?: number } = {},
): Promise<ServiceSnapshot> {
  const now = opts.now ?? new Date();
  const nextWindowMin = opts.nextWindowMin ?? 60;

  // Le offerte scadute vanno chiuse prima di contare chi aspetta, altrimenti
  // la colonna delle attese mostra come "avvisate" persone andate altrove.
  await expireStaleOffers(venueId, now);

  const [venue, bookings, tables, waitlist, walkInOggi] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    loadBookings(venueId, startOfDay(now), endOfDay(now)),
    db.table.findMany({ where: { venueId }, select: { id: true, active: true } }),
    listWaitlist(venueId, { now }),
    db.booking.count({
      where: {
        venueId,
        source: "WALK_IN",
        startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        deletedAt: null,
      },
    }),
  ]);

  const tutte = bookings.map((b) => toServiceBooking(b, now));

  const seated = tutte.filter((b) => b.status === "SEATED");
  const arrived = tutte.filter((b) => b.status === "ARRIVED");
  const late = tutte.filter((b) => b.lateBy > 0).sort((a, b) => b.lateBy - a.lateBy);
  const next = tutte
    .filter(
      (b) =>
        (b.status === "CONFIRMED" || b.status === "PENDING") &&
        b.minutesToArrival >= -LATE_GRACE_MIN &&
        b.minutesToArrival <= nextWindowMin,
    )
    .sort((a, b) => a.minutesToArrival - b.minutesToArrival);

  const freeingSoon = seated
    .filter((b) => (b.minutesToFree ?? Infinity) <= FREEING_SOON_MIN)
    .sort((a, b) => (a.minutesToFree ?? 0) - (b.minutesToFree ?? 0));

  const tavoliOccupati = new Set(seated.map((b) => b.tableId).filter(Boolean)).size;
  const attivi = tables.filter((t) => t.active).length;

  return {
    now: now.toISOString(),
    timezone: venue?.timezone ?? "Europe/Rome",
    seated,
    arrived,
    late,
    next,
    freeingSoon,
    waitlist,
    counters: {
      copertiPresenti: seated.reduce((n, b) => n + b.partySize, 0),
      tavoliOccupati,
      tavoliLiberi: Math.max(0, attivi - tavoliOccupati),
      tavoliTotali: attivi,
      inArrivo: next.length,
      inRitardo: late.length,
      inAttesa: waitlist.length,
      personeInAttesa: waitlist.reduce((n, e) => n + e.partySize, 0),
      walkInOggi,
      copertiPrevisti: tutte
        .filter((b) => b.status !== "NO_SHOW" && b.minutesToArrival > -LATE_GRACE_MIN)
        .reduce((n, b) => n + b.partySize, 0),
    },
  };
}
