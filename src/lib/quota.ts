import { accorda, type Parola } from "./accordo";

/**
 * Quando una percentuale si può dire, e quando no.
 *
 * Una prenotazione andata a vuoto su una sola prenotazione fa «100% di
 * assenze»: è vero e non significa niente. Su numeri piccoli una percentuale
 * **dice più di quello che sa** — e chi la legge la prende per una misura,
 * perché ha la forma di una misura.
 *
 * La regola esisteva già in `server/no-show.ts`, applicata al pannello delle
 * assenze, dove sotto la soglia la riga scrive «nessuna» invece di «0%». Le
 * tre schede in cima alla stessa pagina — completamento, no-show,
 * cancellazioni — la ignoravano: con due prenotazioni e una mancata
 * scrivevano «50%», e con **zero** prenotazioni scrivevano «0%», cioè
 * «abbiamo misurato zero assenze» dove non c'era niente da misurare.
 *
 * Vive in `lib` perché la usano il server (che calcola) e le pagine (che
 * decidono se mostrare).
 */

/** Sotto questo numero di casi una percentuale non si mostra. */
export const MINIMO_PER_QUOTA = 10;

/** `true` quando su questa base una percentuale ha senso. */
export function quotaAffidabile(base: number): boolean {
  return base >= MINIMO_PER_QUOTA;
}

/**
 * Perché la percentuale non c'è, detto a chi la sta cercando.
 *
 * Due assenze diverse, e non vanno dette allo stesso modo: con **zero** casi
 * non è «troppo pochi», è che non è ancora accaduto niente.
 *
 * La parola contata si passa come coppia singolare/plurale: la prima versione
 * la singolarizzava da sola togliendo la «i» finale, che funziona su
 * «prenotazioni» e sbaglia su tutto il resto — e un prodotto che scrive
 * «nessuna risposte» sembra fatto da una macchina.
 */
export function perchePercentualeAssente(
  base: number,
  cosa: Parola = ["prenotazione", "prenotazioni"],
): string {
  if (base === 0) return `Ancora nessuna ${accorda(cosa, 1)} nel periodo`;
  return `Servono almeno ${MINIMO_PER_QUOTA} ${accorda(cosa, MINIMO_PER_QUOTA)}: su ${base} ${
    accorda(cosa, base)
  } una percentuale direbbe più di quello che sa`;
}
