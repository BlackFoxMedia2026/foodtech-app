import type { BookingStatus } from "@prisma/client";

export type TableOperationalStatus = "LIBERO" | "PRENOTATO" | "OCCUPATO" | "NON_DISPONIBILE";

export const TABLE_STATUS_LABELS: Record<TableOperationalStatus, string> = {
  LIBERO: "Libero",
  PRENOTATO: "Prenotato",
  OCCUPATO: "Occupato",
  NON_DISPONIBILE: "Non disponibile",
};

const ACTIVE_UPCOMING_STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING", "ARRIVED"];

/**
 * Derived, never persisted: a Table has no status column of its own, so the
 * operational room view infers one from its `active` flag plus whatever
 * Booking rows land on it for the day being viewed.
 */
export function deriveTableStatus(
  table: { active: boolean },
  bookingsForTable: Array<{ status: BookingStatus; startsAt: Date; durationMin: number; closedAt: Date | null }>,
  now: Date,
): TableOperationalStatus {
  if (!table.active) return "NON_DISPONIBILE";
  if (bookingsForTable.some((b) => b.status === "SEATED" && !b.closedAt)) return "OCCUPATO";
  const upcoming = bookingsForTable.some((b) => {
    if (!ACTIVE_UPCOMING_STATUSES.includes(b.status)) return false;
    return new Date(b.startsAt.getTime() + b.durationMin * 60_000) > now;
  });
  return upcoming ? "PRENOTATO" : "LIBERO";
}

/* -------------------------------------------------------------------------- */
/*  Stati vivi della sala                                                     */
/* -------------------------------------------------------------------------- */

/**
 * I sette stati operativi di un tavolo durante il servizio.
 *
 * I quattro precedenti (LIBERO/PRENOTATO/OCCUPATO/NON_DISPONIBILE) bastavano
 * a una pianta da configurare, non a una sala in funzione: chi guarda la
 * mappa alle nove di sera ha bisogno di distinguere un tavolo che sta per
 * arrivare da uno che ha appena chiesto il conto, perché sono due decisioni
 * diverse.
 *
 * Come tutto il resto della modalità Servizio, sono **derivati**: nessuna
 * colonna nuova, solo conti sull'ora e sullo stato delle prenotazioni.
 */
export type TableLiveStatus =
  | "LIBERO"
  | "PRENOTATO"
  | "IN_ARRIVO"
  | "OCCUPATO"
  | "CONTO"
  | "PULIZIA"
  | "BLOCCATO";

export const TABLE_LIVE_LABELS: Record<TableLiveStatus, string> = {
  LIBERO: "Libero",
  PRENOTATO: "Prenotato",
  IN_ARRIVO: "In arrivo",
  OCCUPATO: "Occupato",
  CONTO: "Al conto",
  PULIZIA: "Da riassettare",
  BLOCCATO: "Bloccato",
};

/** Descrizione per chi legge con uno screen reader, e per il tooltip. */
export const TABLE_LIVE_HINTS: Record<TableLiveStatus, string> = {
  LIBERO: "nessuno seduto e nessun arrivo imminente",
  PRENOTATO: "prenotato più tardi",
  IN_ARRIVO: "l'ospite sta arrivando o è già in sala in attesa",
  OCCUPATO: "ospiti seduti",
  CONTO: "seduti oltre la durata prevista: probabilmente al conto",
  PULIZIA: "appena liberato, da riassettare",
  BLOCCATO: "fuori servizio",
};

/** Entro quanti minuti dall'orario un tavolo passa a «in arrivo». */
export const ARRIVING_WINDOW_MIN = 20;

/** Per quanti minuti dopo la chiusura un tavolo resta «da riassettare». */
export const CLEANING_WINDOW_MIN = 10;

export type LiveBookingLike = {
  status: BookingStatus;
  startsAt: Date;
  durationMin: number;
  closedAt: Date | null;
};

/**
 * Lo stato vivo di un tavolo, dedotto dalle prenotazioni che lo riguardano.
 *
 * L'ordine dei controlli è l'ordine di urgenza: un tavolo fuori servizio non
 * è mai «libero», e uno con gente seduta non è mai «prenotato» — anche se
 * più stati potrebbero valere insieme, chi guarda la mappa deve leggere
 * quello che conta adesso.
 */
export function deriveTableLiveStatus(
  table: { active: boolean },
  bookingsForTable: LiveBookingLike[],
  now: Date,
  opts: { blocked?: boolean } = {},
): TableLiveStatus {
  if (!table.active || opts.blocked) return "BLOCCATO";

  const fine = (b: LiveBookingLike) => new Date(b.startsAt.getTime() + b.durationMin * 60_000);

  const seduti = bookingsForTable.filter((b) => b.status === "SEATED" && !b.closedAt);
  if (seduti.length > 0) {
    // Oltre la durata prevista: quel tavolo sta per liberarsi, ed è
    // l'informazione che serve a chi ha gente in attesa.
    const oltre = seduti.some((b) => fine(b).getTime() <= now.getTime());
    return oltre ? "CONTO" : "OCCUPATO";
  }

  const inArrivo = bookingsForTable.some((b) => {
    if (b.status === "ARRIVED") return true;
    if (b.status !== "CONFIRMED" && b.status !== "PENDING") return false;
    const minuti = (b.startsAt.getTime() - now.getTime()) / 60_000;
    return minuti <= ARRIVING_WINDOW_MIN && minuti > -60;
  });
  if (inArrivo) return "IN_ARRIVO";

  const appenaLiberato = bookingsForTable.some((b) => {
    const riferimento = b.closedAt ?? (b.status === "COMPLETED" ? fine(b) : null);
    if (!riferimento) return false;
    const minutiDa = (now.getTime() - riferimento.getTime()) / 60_000;
    return minutiDa >= 0 && minutiDa <= CLEANING_WINDOW_MIN;
  });
  if (appenaLiberato) return "PULIZIA";

  const prenotatoPiuTardi = bookingsForTable.some(
    (b) => (b.status === "CONFIRMED" || b.status === "PENDING") && fine(b).getTime() > now.getTime(),
  );
  return prenotatoPiuTardi ? "PRENOTATO" : "LIBERO";
}
