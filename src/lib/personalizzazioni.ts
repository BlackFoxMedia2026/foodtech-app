import type { ComandaModificaKind } from "@prisma/client";

/**
 * Le personalizzazioni di un piatto: **suggerimenti, non un catalogo**.
 *
 * Nessun locale ha le stesse varianti, e un elenco chiuso costringerebbe chi
 * prende la comanda a scrivere «altro» nove volte su dieci. Quello che segue
 * sono le voci che quasi tutte le cucine usano, offerte con un tap; tutto il
 * resto si scrive.
 *
 * Sta in `lib` e non in `server` perché lo legge la bottom sheet, che è un
 * componente client: nessun import di `db`, nessuna interrogazione.
 */

export const MODIFICA_LABELS: Record<ComandaModificaKind, string> = {
  COTTURA: "Cottura",
  VARIANTE: "Variante",
  SENZA: "Senza",
  EXTRA: "Extra",
  PORZIONE: "Porzione",
};

/**
 * L'ordine in cui le variazioni si leggono sul foglio della cucina.
 *
 * Non è alfabetico ed è una scelta: la cottura cambia **come si cuoce** e va
 * letta per prima, il «senza» è quello che non deve finire nel piatto e viene
 * subito dopo — sono i due che, sbagliati, tornano indietro. Gli extra e le
 * porzioni cambiano il conto, non la sicurezza.
 */
export const ORDINE_MODIFICHE: ComandaModificaKind[] = [
  "COTTURA",
  "SENZA",
  "VARIANTE",
  "EXTRA",
  "PORZIONE",
];

export const COTTURE = ["Al sangue", "Media", "Ben cotta"] as const;

export const PORZIONI = ["Mezza porzione", "Porzione piccola", "Porzione abbondante"] as const;

/**
 * Le richieste che tornano in ogni servizio, qualunque sia il piatto.
 *
 * «Senza» ha una lista sua perché la cosa più utile — gli ingredienti veri di
 * **quel** piatto — non la sappiamo: il menu di Tavolo ha allergeni e regimi,
 * non la ricetta. Finché non ci sarà, questi sono i tolti più frequenti, e il
 * campo libero copre il resto.
 */
export const SENZA_FREQUENTI = [
  "Senza sale",
  "Senza glutine",
  "Senza lattosio",
  "Senza cipolla",
  "Senza aglio",
  "Senza piccante",
  "Senza salsa",
] as const;

/** Ordina le variazioni di una riga come vanno stampate. */
export function ordinaModifiche<T extends { kind: ComandaModificaKind; ordering?: number }>(
  modifiche: readonly T[],
): T[] {
  return [...modifiche].sort((a, b) => {
    const d = ORDINE_MODIFICHE.indexOf(a.kind) - ORDINE_MODIFICHE.indexOf(b.kind);
    return d !== 0 ? d : (a.ordering ?? 0) - (b.ordering ?? 0);
  });
}

/**
 * Le variazioni in una riga sola, per la card della comanda.
 *
 * `null` quando non ce ne sono: chi la mostra deve poter non disegnare
 * niente, invece di disegnare una riga vuota.
 */
export function riassuntoModifiche(
  modifiche: readonly { kind: ComandaModificaKind; label: string }[],
): string | null {
  if (modifiche.length === 0) return null;
  return ordinaModifiche(modifiche)
    .map((m) => m.label)
    .join(" · ");
}
