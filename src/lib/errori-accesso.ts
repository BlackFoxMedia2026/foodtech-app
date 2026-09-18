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
export function messaggioAccesso(errore: string | null | undefined, stato?: number): string {
  if (errore === ERRORE_TROPPI_TENTATIVI || stato === 429) {
    return "Troppi tentativi di seguito. Aspetta qualche minuto e riprova: non è detto che la password sia sbagliata.";
  }
  return "Credenziali non valide.";
}
