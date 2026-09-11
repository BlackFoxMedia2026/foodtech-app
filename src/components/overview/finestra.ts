/**
 * Quante righe si vedono insieme nella linea temporale: quella prima, quella
 * adesso, quella dopo.
 */
export const VISIBILI = 3;

/**
 * Quante prenotazioni attraversa la finestra scorrendo.
 *
 * Più di quante se ne vedano, altrimenti non c'è niente da scorrere.
 */
export const FINESTRA = 5;

/*
  Perché queste due costanti stanno in un modulo loro e non in `rotazione.tsx`.

  Quel file è `"use client"`, e nell'App Router un componente server che
  importa un valore **non componente** da un modulo client non riceve il valore
  ma un riferimento client. `ProssimePrenotazioni` faceva
  `prenotazioni.slice(0, FINESTRA)` con quel riferimento al posto del numero —
  cioè `slice(0, NaN)` — e la card mostrava «Nessuna prenotazione per oggi» con
  undici prenotazioni in agenda, e in intestazione «Le prossime 0 di 11». Un
  componente importato da lì funziona (`Binario` lo è); una costante no.
*/
