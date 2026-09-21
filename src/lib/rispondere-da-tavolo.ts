/**
 * Rispondere alle telefonate **dentro Tavolo**: spento.
 *
 * ## Perché esiste questo interruttore invece di codice cancellato
 *
 * Il modello del prodotto è quello del concorrente, e in quel modello **Tavolo
 * non risponde**: il cellulare del locale squilla e risponde una persona; se
 * non risponde o è occupato, la telefonata la prende il risponditore del
 * centralino. Tavolo governa i dati — prenotazioni, ospiti, sala, storico — e
 * la telefonia sta tutta dall'altra parte.
 *
 * Il telefono nel browser era costruito e funzionante (WebRTC, permesso del
 * microfono, pannello su ogni schermata). Cancellarlo sarebbe stato l'errore
 * caro: il modello è cambiato tre volte in due giorni, e un locale con una
 * postazione in cassa potrebbe volerlo domani. Quindi resta dov'è, **scollegato
 * da un punto solo**.
 *
 * ## Cosa spegne, esattamente
 *
 * - il pannello della chiamata nel guscio (`(app)/layout.tsx`): niente
 *   riquadro che compare in basso a destra, niente richiesta del microfono;
 * - il passo «Rispondi dentro Tavolo» nella procedura di collegamento, con i
 *   campi SIP e il pulsante del permesso;
 * - la riga in `/telefono` che dice dove si risponde.
 *
 * **Non** spegne il riquadro «chi sta chiamando»: quello non serve a
 * rispondere, serve a sapere chi è — e vale per le telefonate che il
 * centralino ci racconta.
 *
 * ## Per riaccenderlo
 *
 * Questa costante a `true`. Non c'è altro da fare, ed è il motivo per cui è
 * una costante e non tre condizioni sparse: cercare `RISPONDE_DAL_BROWSER` dice
 * in tre secondi tutto quello che quella funzione toccava.
 */
export const RISPONDE_DAL_BROWSER = false;
