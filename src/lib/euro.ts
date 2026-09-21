import { formatCurrency } from "@/lib/utils";

/**
 * Un importo della Staff App, scritto in euro a partire dai centesimi.
 *
 * È una scorciatoia su `formatCurrency`, non un secondo formattatore: in sala
 * gli importi compaiono in una decina di punti — card del tavolo, comanda,
 * conto, menù — e scriverli ogni volta per esteso significava, prima o poi,
 * dimenticare `useGrouping` da qualche parte e rimettere in circolo lo
 * *hydration mismatch* che `formatCurrency` documenta e risolve.
 *
 * La valuta resta un parametro perché il locale ce l'ha in tabella, ma la
 * Staff App oggi non la trasporta fin qui: finché non lo fa, l'euro del nome
 * è anche il valore predefinito.
 */
export function euro(cents: number, currency = "EUR") {
  return formatCurrency(cents, currency);
}
