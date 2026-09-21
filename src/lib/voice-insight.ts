/**
 * Le informazioni che emergono al telefono, e dove finiscono.
 *
 * Sta in `lib` perché lo legge anche l'interfaccia: da un modulo `"use client"`
 * il server non può leggere un valore esportato.
 */

/**
 * I tre tipi, e non uno in più.
 *
 * Ognuno ha un **posto preciso** nella scheda dell'ospite: senza quel posto un
 * tipo sarebbe una categoria che non cambia niente. È il motivo per cui
 * «occasione» non c'è: un'occasione è di una prenotazione, non di una persona,
 * e metterla nel profilo la farebbe tornare a ogni cena per sempre.
 */
export const TIPI_INSIGHT = ["allergia", "preferenza", "nota"] as const;

export type TipoInsight = (typeof TIPI_INSIGHT)[number];

export const NOME_TIPO: Record<TipoInsight, string> = {
  allergia: "Allergia o intolleranza",
  preferenza: "Preferenza",
  nota: "Nota",
};

/** Dove va a finire, detto a chi decide se approvarla. */
export const DOVE_FINISCE: Record<TipoInsight, string> = {
  allergia: "fra le allergie della scheda — si vede in sala, su ogni cena",
  preferenza: "fra le preferenze della scheda",
  nota: "nelle note interne della scheda",
};

export function tipoInsightValido(valore: string): valore is TipoInsight {
  return (TIPI_INSIGHT as readonly string[]).includes(valore);
}
