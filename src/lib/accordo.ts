/**
 * L'accordo fra un numero e la parola che lo segue.
 *
 * «1 confermati · stanno arrivando» non è italiano, e un prodotto che lo
 * scrive sembra fatto da una macchina. Le etichette dei contatori erano
 * plurali fisse: con un solo gruppo in coda si leggeva «1 Confermati».
 *
 * Sta in `lib` perché la usano i componenti resi nel browser e le frasi
 * costruite sul server — vedi la nota in `lib/durata.ts`.
 */

/** Una parola che non cambia, o la coppia singolare/plurale. */
export type Parola = string | [singolare: string, plurale: string];

/**
 * Accorda una parola col numero che la precede.
 *
 * Con **zero** si usa il plurale, come si dice in italiano («0 avvisati»).
 * Con un valore **non numerico** — «3/17 tavoli» — resta il plurale: su una
 * frazione la coppia non ha senso.
 */
export function accorda(parola: Parola, valore: number | string): string {
  if (typeof parola === "string") return parola;
  return valore === 1 ? parola[0] : parola[1];
}
