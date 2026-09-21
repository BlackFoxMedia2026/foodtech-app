import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { oraInVenue } from "@/lib/venue-time";

/**
 * **Chi è dentro il locale e non è ancora seduto.**
 *
 * ## Il fatto che esisteva e non andava da nessuna parte
 *
 * `BookingStatus.ARRIVED` e `Booking.arrivedAt` ci sono da sempre, e la
 * modalità Servizio del back office scrive già «Segna come arrivato». Ma
 * quell'informazione restava dentro Prenotazioni: il cameriere che in quel
 * momento sta in sala con il telefono non la vedeva da nessuna parte, e la
 * persona in piedi all'ingresso dipendeva da chi l'aveva segnata gridando un
 * nome attraverso la sala.
 *
 * Questo modulo è la traduzione di quel fatto in una **coda**: chi aspetta, da
 * quanto, in quanti. Da qui la leggono la Home, la Sala e il foglio che si
 * apre toccando un tavolo libero — tre schermate, una sola lista.
 *
 * ## Niente colonne nuove, come per gli stati del tavolo
 *
 * La coda è una **interrogazione**, non una tabella: sono le prenotazioni di
 * oggi in stato `ARRIVED`. Una riga «in attesa» scritta a parte si
 * disallineerebbe il giorno in cui qualcuno accomoda dal back office invece
 * che dal telefono — ed è precisamente il difetto che il §6 del brief chiede
 * di non creare. Nello stesso spirito, `WaitlistEntry` resta quello che è: la
 * coda di **chi non ha prenotato e aspetta un tavolo**, un'altra cosa da chi
 * ha prenotato ed è arrivato.
 *
 * ## Perché non anche i walk-in
 *
 * Un walk-in nasce già seduto (`seatWalkIn` crea la prenotazione in stato
 * `SEATED`): non passa mai da questa coda perché non c'è un momento in cui è
 * dentro il locale e senza tavolo. Se un giorno si volesse registrare un
 * walk-in *prima* di avere il tavolo, basterebbe crearlo `ARRIVED` e
 * comparirebbe qui senza toccare niente.
 */

export type OspiteDaAccomodare = {
  bookingId: string;
  /** Il cognome quando c'è, che è come si chiamano i tavoli all'ingresso. */
  nome: string;
  coperti: number;
  /** L'orario prenotato, nel fuso del locale: «20:30». */
  ora: string;
  /** Da quanti minuti aspetta. Zero appena segnato arrivato. */
  attesaMin: number;
  /** Vero quando l'attesa comincia a essere una cosa da dire a voce. */
  attesaLunga: boolean;
  /** Il tavolo già scritto sulla prenotazione, se qualcuno l'aveva scelto. */
  tableIdAtteso: string | null;
  tavoloAtteso: string | null;
  /** La sala su cui era scritta, per preferire quella nel suggerimento. */
  roomIdAtteso: string | null;
  /** La durata con cui va accomodato: quella della prenotazione. */
  durataMin: number;
  /** Allergie dalla scheda dell'ospite: la sola nota che vale un colore. */
  allergie: string | null;
  /** Occasione e note, in una riga, quando ci sono. */
  nota: string | null;
};

/** Oltre questi minuti d'attesa la riga si fa notare. */
export const ATTESA_LUNGA_MIN = 10;

/**
 * Il nome con cui si chiama un tavolo all'ingresso.
 *
 * Il cognome, non il nome di battesimo: «Rossi · 4» è come la sala parla, e
 * «Marco · 4» sono tre Marco in una sera di sabato. Senza scheda ospite —
 * capita, le prenotazioni telefoniche vecchie — resta il riferimento, che è
 * meglio di «Senza nome» perché almeno si può cercare.
 */
function comeSiChiama(guest: { firstName: string; lastName: string | null } | null, reference: string): string {
  if (!guest) return `Prenotazione ${reference.slice(0, 6).toUpperCase()}`;
  return guest.lastName?.trim() || guest.firstName;
}

const SELEZIONE = {
  id: true,
  reference: true,
  partySize: true,
  startsAt: true,
  durationMin: true,
  arrivedAt: true,
  occasion: true,
  notes: true,
  tableId: true,
  table: { select: { label: true, roomId: true } },
  guest: { select: { firstName: true, lastName: true, allergies: true } },
} as const;

const OCCASIONE: Record<string, string> = {
  BIRTHDAY: "Compleanno",
  ANNIVERSARY: "Anniversario",
  BUSINESS: "Cena di lavoro",
  DATE: "Cena a due",
  CELEBRATION: "Festeggiamento",
  OTHER: "Occasione speciale",
};

function riga(
  b: {
    id: string;
    reference: string;
    partySize: number;
    startsAt: Date;
    durationMin: number;
    arrivedAt: Date | null;
    occasion: string | null;
    notes: string | null;
    tableId: string | null;
    table: { label: string; roomId: string | null } | null;
    guest: { firstName: string; lastName: string | null; allergies: string | null } | null;
  },
  timezone: string,
  adesso: Date,
): OspiteDaAccomodare {
  /* L'attesa si conta dall'arrivo, non dall'orario prenotato: chi arriva
     venti minuti prima non sta aspettando da venti minuti, e chi arriva in
     ritardo non ha un'attesa negativa. */
  const attesaMin = b.arrivedAt
    ? Math.max(0, Math.round((adesso.getTime() - b.arrivedAt.getTime()) / 60_000))
    : 0;

  const note = [b.occasion ? OCCASIONE[b.occasion] : null, b.notes?.trim() || null].filter(Boolean);

  return {
    bookingId: b.id,
    nome: comeSiChiama(b.guest, b.reference),
    coperti: b.partySize,
    ora: oraInVenue(b.startsAt, timezone),
    attesaMin,
    attesaLunga: attesaMin >= ATTESA_LUNGA_MIN,
    tableIdAtteso: b.tableId,
    tavoloAtteso: b.table?.label ?? null,
    roomIdAtteso: b.table?.roomId ?? null,
    durataMin: b.durationMin,
    allergie: b.guest?.allergies?.trim() || null,
    nota: note.length > 0 ? note.join(" · ") : null,
  };
}

/**
 * La coda di adesso, in ordine di **attesa**: chi è lì da più tempo davanti.
 *
 * Non in ordine di orario prenotato, che è l'ordine del registro e non quello
 * dell'ingresso: fra chi ha prenotato alle 20:00 e si è presentato alle 20:40
 * e chi ha prenotato alle 20:30 ed era puntuale, ad aspettare da più tempo è
 * il secondo, e tocca a lui.
 */
export async function ospitiDaAccomodare(
  venueId: string,
  timezone: string,
  adesso = new Date(),
): Promise<OspiteDaAccomodare[]> {
  const righe = await db.booking.findMany({
    where: {
      venueId,
      status: "ARRIVED",
      deletedAt: null,
      startsAt: { gte: startOfDay(adesso), lte: endOfDay(adesso) },
    },
    select: SELEZIONE,
  });

  return righe
    .map((b) => riga(b, timezone, adesso))
    .sort((a, b) => b.attesaMin - a.attesaMin || a.ora.localeCompare(b.ora));
}

/**
 * Un ospite solo, per il foglio che gli propone i tavoli.
 *
 * Rifiuta chi non è `ARRIVED`: se qualcun altro l'ha accomodato nei dieci
 * secondi in cui questo foglio era aperto, la risposta giusta è dirlo, non
 * mostrare una proposta di tavoli per una persona che è già a tavola.
 */
export async function ospiteDaAccomodare(
  venueId: string,
  bookingId: string,
  timezone: string,
  adesso = new Date(),
): Promise<OspiteDaAccomodare | null> {
  const b = await db.booking.findFirst({
    where: { id: bookingId, venueId, status: "ARRIVED", deletedAt: null },
    select: SELEZIONE,
  });
  return b ? riga(b, timezone, adesso) : null;
}
