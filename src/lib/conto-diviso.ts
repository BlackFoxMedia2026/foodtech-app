/**
 * Dividere un conto senza perdere né inventare centesimi.
 *
 * Tutto quello che c'è qui dentro è aritmetica su numeri interi di centesimi,
 * senza dipendenze e senza database, perché è la parte che deve essere giusta
 * per prima: un errore qui non si vede sullo schermo, si vede a fine serata
 * quando la cassa non torna di due centesimi e nessuno sa dove cercarli.
 *
 * **Mai virgola mobile.** `0.1 + 0.2` in JavaScript fa `0.30000000000000004`,
 * e un conto di sei portate lo scopre. Gli importi entrano ed escono da qui in
 * centesimi interi; gli euro esistono solo nel momento in cui si stampano.
 */

/**
 * Il conto in parti il più uguali possibile, che sommano **esattamente** il
 * totale.
 *
 * I centesimi che avanzano vanno ai primi, uno ciascuno: €100 fra tre diventa
 * 33,34 · 33,33 · 33,33 e non 33,33 · 33,33 · 33,33, che farebbe sparire un
 * centesimo, né 33,34 · 33,34 · 33,34, che ne creerebbe due dal nulla.
 *
 * Chi paga per primo paga il centesimo in più. È la scelta meno arbitraria
 * delle tre possibili: darlo all'ultimo significa che chi arriva tardi paga di
 * più senza averlo scelto, e distribuirlo a caso rende il conto irriproducibile
 * — due schermate dello stesso tavolo mostrerebbero due divisioni diverse.
 */
export function dividiCentesimi(totaleCents: number, parti: number): number[] {
  if (!Number.isInteger(totaleCents) || totaleCents < 0) throw new RangeError("totaleCents non valido");
  if (!Number.isInteger(parti) || parti < 1) throw new RangeError("parti non valido");

  const base = Math.floor(totaleCents / parti);
  const resto = totaleCents - base * parti;
  return Array.from({ length: parti }, (_, i) => base + (i < resto ? 1 : 0));
}

/**
 * Quanto paga **la prossima persona** che divide il residuo in `parti`.
 *
 * Non è `totale / parti`: è il residuo di adesso diviso per le quote che
 * mancano, arrotondato per eccesso. La differenza conta, perché fra quando
 * Giulia sceglie «in quattro» e quando preme «paga» qualcun altro può aver
 * già pagato — e la divisione deve lavorare su quello che resta davvero,
 * non su quello che c'era quando la pagina si è aperta.
 *
 * Arrotondare per eccesso e non per difetto è ciò che garantisce che il conto
 * **si chiuda**: per difetto, quattro quote da 33,33 su 133,33 lascerebbero un
 * centesimo orfano che nessuna delle quattro persone ha motivo di pagare, e il
 * tavolo resterebbe aperto per un centesimo. Per eccesso, l'ultima quota è
 * sempre ≤ delle precedenti e il residuo arriva a zero.
 */
export function quotaDivisa(residuoCents: number, parti: number): number {
  if (!Number.isInteger(residuoCents) || residuoCents < 0) throw new RangeError("residuoCents non valido");
  if (!Number.isInteger(parti) || parti < 1) throw new RangeError("parti non valido");
  // Nessun tetto sul residuo: `ceil(r / p)` con `p >= 1` non può superare `r`,
  // e restituisce almeno 1 finché c'è qualcosa da pagare.
  return Math.ceil(residuoCents / parti);
}

/**
 * Quante quote mancano ancora, data la quota scelta.
 *
 * Serve solo per dirlo a schermo («ne restano 3»): il residuo è la verità, e
 * questo è un modo gentile di raccontarlo a chi è a tavola. Non si usa per
 * decidere nulla lato server.
 */
export function quoteRimaste(residuoCents: number, quotaCents: number): number {
  if (quotaCents <= 0) return 0;
  return Math.ceil(residuoCents / quotaCents);
}

/**
 * La mancia di una percentuale sul conto.
 *
 * Si arrotonda al centesimo più vicino, e si calcola **sul conto** e mai sul
 * totale con la mancia dentro: il 10% di 30 € è 3 €, non il 10% di 33.
 */
export function manciaPercentuale(billCents: number, percentuale: number): number {
  if (!Number.isInteger(billCents) || billCents < 0) throw new RangeError("billCents non valido");
  if (!Number.isFinite(percentuale) || percentuale < 0) throw new RangeError("percentuale non valida");
  return Math.round((billCents * percentuale) / 100);
}

/**
 * Da «12,50» a 1250.
 *
 * Accetta quello che una persona scrive davvero in un campo importo su un
 * telefono: la virgola italiana, il punto, gli spazi, il simbolo dell'euro.
 * Restituisce `null` su tutto il resto invece di un numero approssimato —
 * `parseFloat("12,50")` risponde `12`, cioè cinquanta centesimi in meno senza
 * dire niente a nessuno, ed è esattamente il genere di silenzio che non deve
 * esistere in un modulo di pagamento.
 *
 * Il passaggio finale usa `Math.round` su un prodotto in virgola mobile: è
 * l'unico punto in cui è inevitabile — il numero arriva come testo decimale —
 * ed è per questo che i decimali vengono **tagliati a due** prima, invece di
 * fidarsi dell'arrotondamento.
 */
export function centesimiDaTesto(raw: string): number | null {
  const pulito = raw.trim().replace(/[€\s ]/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(pulito)) return null;
  const [interi, decimali = ""] = pulito.split(".");
  return Number.parseInt(interi, 10) * 100 + Number.parseInt(decimali.padEnd(2, "0"), 10);
}
