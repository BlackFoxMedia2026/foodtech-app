import type { TableCombination } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Le unioni previste: quali tavoli di una sala il locale accosta per un
 * gruppo grande.
 *
 * Non occupano niente e non spostano niente sulla piantina. Servono a chi
 * deve proporre un posto — il modulo del Servizio, l'accoglienza — per dire
 * «questi tre, insieme, fanno sei» senza che qualcuno debba ricordarselo. Chi
 * occupa davvero i tavoli resta la prenotazione (`combinedTableIds`), con le
 * sue regole in `combineTablesForBooking`.
 */

/** Il «no» del server, con lo stato HTTP con cui la rotta lo restituisce.
 * Non è `ApiError` di proposito: quella vive accanto alla sessione, e questo
 * modulo si usa anche dove una sessione non c'è (i test, l'accoglienza). */
export class UnioneError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UnioneError";
  }
}

export type UnionePrevista = TableCombination & {
  /** I posti sommati: è il numero che decide se l'unione basta. */
  posti: number;
  /** «T4 + T5 + T6», nell'ordine in cui sono stati scelti. */
  nomi: string;
};

/** Più di otto tavoli non è un'unione, è mezza sala: è lo stesso limite
 * della rotta che unisce i tavoli di una prenotazione. */
const MASSIMO_TAVOLI = 8;

/**
 * Le unioni di un locale (o di una sala), con posti e nomi ricalcolati.
 *
 * Un tavolo eliminato nel frattempo esce dall'unione; un'unione rimasta con
 * meno di due tavoli non è più un'unione e non si mostra.
 */
export async function elencaUnioni(venueId: string, roomId?: string): Promise<UnionePrevista[]> {
  const unioni = await db.tableCombination.findMany({
    where: { venueId, ...(roomId ? { roomId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (unioni.length === 0) return [];
  const ids = [...new Set(unioni.flatMap((u) => u.tableIds))];
  const tavoli = await db.table.findMany({
    where: { venueId, id: { in: ids } },
    select: { id: true, label: true, seats: true },
  });
  const perId = new Map(tavoli.map((t) => [t.id, t]));

  return unioni.flatMap((u) => {
    const presenti = u.tableIds.map((id) => perId.get(id)).filter((t) => t !== undefined);
    if (presenti.length < 2) return [];
    return [
      {
        ...u,
        tableIds: presenti.map((t) => t.id),
        posti: presenti.reduce((somma, t) => somma + t.seats, 0),
        nomi: presenti.map((t) => t.label).join(" + "),
      },
    ];
  });
}

/**
 * Crea un'unione. Le regole sono quelle di una tavolata vera, perché
 * un'unione esiste solo per diventarlo: almeno due tavoli, tutti del locale,
 * tutti nella sala indicata e tutti unibili. Due unioni con gli stessi tavoli
 * sono la stessa unione.
 */
export async function creaUnione(
  venueId: string,
  dati: { roomId: string; tableIds: string[]; label?: string | null },
): Promise<UnionePrevista> {
  const unici = [...new Set(dati.tableIds)];
  if (unici.length < 2) throw new UnioneError(422, "servono_due_tavoli", "Un'unione ha almeno due tavoli.");
  if (unici.length > MASSIMO_TAVOLI) {
    throw new UnioneError(422, "troppi_tavoli", `Un'unione ha al massimo ${MASSIMO_TAVOLI} tavoli.`);
  }

  const tavoli = await db.table.findMany({ where: { venueId, id: { in: unici } } });
  if (tavoli.length !== unici.length) throw new UnioneError(404, "tavolo_non_trovato", "Uno dei tavoli non esiste più.");
  if (tavoli.some((t) => t.roomId !== dati.roomId)) {
    throw new UnioneError(422, "sale_diverse", "I tavoli di un'unione devono stare nella stessa sala.");
  }
  const nonUnibili = tavoli.filter((t) => !t.combinable).map((t) => t.label);
  if (nonUnibili.length > 0) {
    throw new UnioneError(422, "non_unibili", `Non si può unire: ${nonUnibili.join(", ")}.`);
  }

  const chiave = [...unici].sort().join("|");
  const esistenti = await db.tableCombination.findMany({ where: { venueId, roomId: dati.roomId } });
  if (esistenti.some((u) => [...u.tableIds].sort().join("|") === chiave)) {
    throw new UnioneError(409, "unione_esistente", "Questi tavoli sono già un'unione.");
  }

  const creata = await db.tableCombination.create({
    data: { venueId, roomId: dati.roomId, tableIds: unici, label: dati.label?.trim() || null },
  });
  // L'ordine di `unici` è quello della selezione: il primo diventa il tavolo
  // principale quando l'unione si assegna a una prenotazione.
  const perId = new Map(tavoli.map((t) => [t.id, t]));
  return {
    ...creata,
    posti: tavoli.reduce((somma, t) => somma + t.seats, 0),
    nomi: unici.map((id) => perId.get(id)!.label).join(" + "),
  };
}

/** Un tavolo eliminato esce da tutte le unioni; quelle rimaste con un tavolo
 * solo spariscono. Si chiama dentro l'eliminazione del tavolo. */
export async function togliTavoloDalleUnioni(venueId: string, tableId: string) {
  const coinvolte = await db.tableCombination.findMany({ where: { venueId, tableIds: { has: tableId } } });
  for (const u of coinvolte) {
    const resto = u.tableIds.filter((id) => id !== tableId);
    if (resto.length < 2) await db.tableCombination.delete({ where: { id: u.id } });
    else await db.tableCombination.update({ where: { id: u.id }, data: { tableIds: resto } });
  }
}
