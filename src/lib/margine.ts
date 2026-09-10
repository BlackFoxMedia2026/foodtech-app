/**
 * Come si legge un margine: guadagno, pari, perdita.
 *
 * Nell'editor della carta il margine si scriveva sempre allo stesso modo —
 * «margine 25,84 € · 68%» in grigio tenue — **anche quando era negativo**.
 * Un piatto venduto in perdita aveva l'aspetto di un piatto che rende, e il
 * costo lo scrive il locale a mano: un dito sbagliato sul tastierino e il
 * numero resta lì per mesi, dentro le analisi del food cost.
 *
 * L'accento, su questo prodotto, è «ciò che avvisa». Un margine negativo è
 * esattamente questo.
 */

export type StatoMargine = "guadagno" | "pari" | "perdita";

export function statoMargine(margineCents: number): StatoMargine {
  if (margineCents < 0) return "perdita";
  if (margineCents === 0) return "pari";
  return "guadagno";
}

/**
 * La frase da mostrare accanto al prezzo.
 *
 * In perdita si dice **«in perdita»** e si scrive il valore senza il segno
 * meno: «in perdita 5,00 €» si legge di sfuggita, «margine -5,00 €» chiede di
 * notare un segno alto due pixel.
 */
export function fraseMargine(
  margineCents: number,
  pct: number | null,
  euro: (cents: number) => string,
): string {
  const stato = statoMargine(margineCents);
  const percentuale = pct != null ? ` · ${Math.abs(pct)}%` : "";
  if (stato === "perdita") return `in perdita ${euro(Math.abs(margineCents))}${percentuale}`;
  if (stato === "pari") return "venduto a costo, nessun margine";
  return `margine ${euro(margineCents)}${percentuale}`;
}
