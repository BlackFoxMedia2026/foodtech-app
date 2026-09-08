import { db } from "@/lib/db";
import { checkAvailability } from "./availability";
import { durataConsigliata } from "./durata-consigliata";

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
  /**
   * Perché non c'è niente da proporre. `null` quando ci sono tavoli.
   *
   * `no_table_that_big` non è un dettaglio: prima quel caso finiva in
   * `all_busy`, che diceva «tutti i tavoli abbastanza grandi sono occupati»
   * anche quando di quella misura non ne esisteva **nemmeno uno**. Due
   * situazioni diverse con due risposte diverse: aspettare che si liberi un
   * tavolo, o unirne due.
   */
  reason: "venue_closed" | "shift_full" | "all_busy" | "no_table_that_big" | null;
};

export async function findFreeTables(
  venueId: string,
  request: {
    partySize: number;
    startsAt: Date;
    durationMin?: number;
    preferredRoomId?: string | null;
    /**
     * Include anche i tavoli troppo piccoli da soli.
     *
     * Serve per unire: una tavolata da dieci si fa con due tavoli da sei, e
     * l'elenco normale — che mostra solo i tavoli grandi abbastanza — per
     * definizione non ne conterrebbe nessuno. Con questa opzione la domanda
     * cambia da «chi può accogliere dieci persone» a «chi è libero adesso».
     */
    includeSmaller?: boolean;
  },
): Promise<FreeTableSearch> {
  // La durata con cui si cerca è quella con cui si prenoterà: cercare con 105
  // minuti e poi prenotare con 140 vuol dire proporre un tavolo che non c'è.
  const durationMin =
    request.durationMin ??
    (await durataConsigliata(venueId, { partySize: request.partySize, startsAt: request.startsAt }))
      .durataMin;

  const tables = await db.table.findMany({
    where: {
      venueId,
      active: true,
      ...(request.includeSmaller ? {} : { seats: { gte: request.partySize } }),
      // Un tavolo che non si può unire non serve a una tavolata: `combinable`
      // esisteva nello schema e non lo leggeva nessuno.
      ...(request.includeSmaller ? { combinable: true } : {}),
    },
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
      // Per un tavolo più piccolo del gruppo la domanda è «è libero?», non
      // «ci stanno tutti?»: ci staranno sommando gli altri tavoli della
      // tavolata, e la somma la verifica chi unisce.
      partySize: request.includeSmaller ? Math.min(request.partySize, table.seats) : request.partySize,
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
    free.length > 0
      ? null
      : venueClosed
        ? "venue_closed"
        : shiftFull
          ? "shift_full"
          : // Nessun tavolo nemmeno da esaminare: non sono occupati, non
            // esistono di quella misura. Con `includeSmaller` non può capitare,
            // perché l'elenco parte da tutti i tavoli del locale.
            tables.length === 0
            ? "no_table_that_big"
            : "all_busy";

  return { tables: free, reason };
}
