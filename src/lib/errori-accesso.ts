/**
 * Cosa scrivere sotto il modulo d'accesso quando non si entra.
 *
 * Sta in `lib/` e non nella pagina perché il valore lo scrive il
 * **middleware** (che è server) e lo legge la schermata d'accesso (che è
 * client): una costante esportata da un modulo `"use client"` il server non
 * la vede.
 */

/**
 * Il codice che il limite di frequenza mette nella risposta del login.
 *
 * Non è un errore di NextAuth: lo aggiunge il nostro middleware, perché
 * altrimenti il 429 non arriverebbe alla schermata in nessuna forma. La
 * risposta del callback deve contenere un campo `url`, e NextAuth ci cerca
 * dentro il parametro `error`: senza quel campo `signIn()` costruisce
 * `new URL(undefined)` e **solleva**, lasciando la pagina su «Accesso in
 * corso…» per sempre.
 */
export const ERRORE_TROPPI_TENTATIVI = "TroppiTentativi";

/**
 * «Credenziali non valide» era la risposta a **tutto**, anche a un 429.
 *
 * È il caso che manda fuori strada chi sta già in difficoltà: dopo dieci
 * tentativi in dieci minuti il limite rifiuta ogni richiesta senza nemmeno
 * arrivare al controllo della password, quindi anche la password **giusta**
 * riceveva «credenziali non valide». Chi legge quel messaggio conclude che la
 * password è sbagliata, la cambia, e resta fuori — perché il problema era il
 * tempo, non la password.
 */
export const ERRORE_SERVE_CODICE = "ServeCodice";
export const ERRORE_CODICE_NON_VALIDO = "CodiceNonValido";

/** Vero quando la schermata deve **chiedere** il codice a sei cifre. */
export function chiedeIlCodice(errore: string | null | undefined): boolean {
  return errore === ERRORE_SERVE_CODICE || errore === ERRORE_CODICE_NON_VALIDO;
}

export function messaggioAccesso(errore: string | null | undefined, stato?: number): string {
  if (errore === ERRORE_TROPPI_TENTATIVI || stato === 429) {
    return "Troppi tentativi di seguito. Aspetta qualche minuto e riprova: non è detto che la password sia sbagliata.";
  }
  /*
    I due fattori: due messaggi diversi, e nessuno dei due parla di password.

    «Credenziali non valide» a chi ha i due fattori accesi è il messaggio che
    manda a cambiare una password che va benissimo — la stessa trappola del
    429, in un altro punto.
  */
  if (errore === ERRORE_SERVE_CODICE) {
    return "Su questo accesso serve anche il codice a sei cifre dell'app di autenticazione.";
  }
  if (errore === ERRORE_CODICE_NON_VALIDO) {
    return "Il codice non è valido o è già stato usato. Aspetta che l'app ne mostri uno nuovo, oppure usa un codice di recupero.";
  }
  return "Credenziali non valide.";
}
