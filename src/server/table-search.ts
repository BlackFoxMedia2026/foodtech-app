import { db } from "@/lib/db";
import { checkAvailability, DEFAULT_DURATION_MIN } from "./availability";

/**
 * «Quali tavoli possono accogliere N persone in questo momento?»
 *
 * È la domanda che sta sotto tre funzioni diverse — la lista d'attesa, il
 * walk-in e (in futuro) i suggerimenti di seating — e va avere una sola
 * risposta. Sta qui e non dentro uno dei tre perché il secondo che ne avesse
 * bisogno l'avrebbe riscritta, e due verità su cosa sia libero sono peggio di
 * nessuna.
 *
 * Non contiene regole proprie: interroga il motore di disponibilità tavolo per
 * tavolo. Costa una query per tavolo — decine, non migliaia — e in cambio non
 * c'è modo che si sfasi dalle regole vere.
 */

export type FreeTable = {
  tableId: string;
  label: string;
  seats: number;
  roomId: string | null;
  roomName: string | null;
  /** Vero se è la sala richiesta. */
  matchesPreference: boolean;
};

export type FreeTableSearch = {
  tables: FreeTable[];
  /** Perché non c'è niente da proporre. `null` quando ci sono tavoli. */
  reason: "venue_closed" | "shift_full" | "all_busy" | null;
};

export async function findFreeTables(
  venueId: string,
  request: {
    partySize: number;
    startsAt: Date;
    durationMin?: number;
    preferredRoomId?: string | null;
  },
): Promise<FreeTableSearch> {
  const durationMin = request.durationMin ?? DEFAULT_DURATION_MIN;

  const tables = await db.table.findMany({
    where: { venueId, active: true, seats: { gte: request.partySize } },
    select: { id: true, label: true, seats: true, roomId: true, room: { select: { name: true } } },
    orderBy: { seats: "asc" },
  });

  const free: FreeTable[] = [];
  let venueClosed = false;
  let shiftFull = false;

  for (const table of tables) {
    const result = await checkAvailability(venueId, {
      startsAt: request.startsAt,
      durationMin,
      partySize: request.partySize,
      tableId: table.id,
    });

    if (!result.available) {
      // Questi due motivi non dipendono dal tavolo: valgono per tutti, e sono
      // la differenza fra «riprova fra poco» e «siamo chiusi».
      if (result.issues.some((i) => i.code === "VENUE_CLOSED")) venueClosed = true;
      if (result.issues.some((i) => i.code === "SHIFT_FULL")) shiftFull = true;
      continue;
    }

    free.push({
      tableId: table.id,
      label: table.label,
      seats: table.seats,
      roomId: table.roomId,
      roomName: table.room?.name ?? null,
      matchesPreference: !!request.preferredRoomId && table.roomId === request.preferredRoomId,
    });
  }

  // Prima la sala richiesta, poi il tavolo più piccolo che basta: tenere un sei
  // posti per due persone è il modo più rapido di riempire la sala e ritrovarsi
  // senza posto per il gruppo che arriva dopo.
  free.sort((a, b) => {
    if (a.matchesPreference !== b.matchesPreference) return a.matchesPreference ? -1 : 1;
    return a.seats - b.seats;
  });

  const reason: FreeTableSearch["reason"] =
    free.length > 0 ? null : venueClosed ? "venue_closed" : shiftFull ? "shift_full" : "all_busy";

  return { tables: free, reason };
}
