/**
 * Le quattro viste di Analytics: i nomi e la lettura dell'indirizzo.
 *
 * Sta in `lib` e **non** dentro il componente delle pillole, che è un
 * `"use client"`: da un modulo client il server non può leggere un valore
 * esportato — quello che attraversa quel confine sono riferimenti a
 * componenti, non costanti. Importando `VISTE` da lì, la pagina di Analytics
 * si rompeva con «An error occurred in the Server Components render».
 *
 * È la terza volta che questo confine morde in questo progetto (i livelli
 * degli avvisi, i tipi della ricerca, e ora le viste): la regola è che
 * costanti e funzioni pure condivise fra server e client stanno in `lib`, e i
 * componenti stanno dove sono resi.
 *
 * Il nome di ogni vista è **la domanda**, non l'argomento: «com'è andata» e
 * non «performance».
 */
export const VISTE = [
  { id: "andamento", titolo: "Com'è andata", sottotitolo: "il periodo in numeri" },
  { id: "carta", titolo: "Cibo e carta", sottotitolo: "costo, margine, piatti" },
  { id: "servizio", titolo: "Servizio", sottotitolo: "assenze, rotazione, attesa" },
  { id: "domanda", titolo: "Domanda e ospiti", sottotitolo: "previsione, voti, fonti" },
] as const;

export type VistaId = (typeof VISTE)[number]["id"];

/** La vista scelta nell'indirizzo, o la prima. */
export function vistaDa(valore: string | null | undefined): VistaId {
  return VISTE.find((v) => v.id === valore)?.id ?? VISTE[0].id;
}
