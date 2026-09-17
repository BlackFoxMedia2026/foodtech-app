/**
 * I numeri di telefono, confrontati come li scrivono le persone.
 *
 * `Guest.phone` è testo libero, riempito da chi prende la prenotazione al
 * telefono: nello stesso archivio convivono `333 123 4567`,
 * `+39 333 1234567`, `00393331234567` e `3331234567`. Confrontare le stringhe
 * non funziona, e questo conta perché su questa funzione poggia il
 * riconoscimento del cliente **mentre il telefono squilla**.
 *
 * Due operazioni diverse, e non vanno confuse:
 *
 *  - **normalizzare** (`normalizzaE164`) serve alla *scrittura*: un numero
 *    nuovo si salva in una forma sola;
 *  - **identificare** (`codaIdentita`) serve alla *lettura*: si confrontano le
 *    ultime nove cifre, che sono l'unica parte che nessun operatore riscrive.
 *    Il prefisso internazionale, gli spazi, lo zero di rete e il `00` davanti
 *    cambiano da un archivio all'altro; le ultime nove no.
 *
 * Il confronto a cifre esiste già nella ricerca globale
 * (`src/server/ricerca.ts`), ma là serve a **cercare** — sottostringa, da
 * quattro cifre in su, per trovare «3358842» dentro «+39 335 8842910». Qui
 * serve a **identificare una persona**, che è una domanda diversa e pretende
 * una corrispondenza esatta sulla coda: una sottostringa identificherebbe la
 * persona sbagliata.
 */

/**
 * Quante cifre finali identificano un numero.
 *
 * Nove: un cellulare italiano ne ha dieci (`333 1234567`) e un fisso col
 * prefisso pure (`011 5550123`), quindi nove cifre saltano esattamente la
 * parte che varia — lo zero di rete o la prima cifra del prefisso — e tengono
 * tutto il resto.
 */
export const CIFRE_IDENTITA = 9;

/** Il prefisso del paese quando chi ha scritto il numero non l'ha messo. */
export const PAESE_PREDEFINITO = "39";

/** Solo le cifre, senza spazi, punti, parentesi, trattini o `+`. */
export function soloCifre(valore: string): string {
  return valore.replace(/\D/g, "");
}

/**
 * Le ultime nove cifre, che identificano il numero.
 *
 * `null` quando le cifre non bastano: sotto le nove non si identifica
 * nessuno — è un interno, un numero incompleto o un troncone — e tirare a
 * indovinare vorrebbe dire attribuire una telefonata alla persona sbagliata.
 * Meglio «non riconosciuto» che riconosciuto male.
 */
export function codaIdentita(valore: string | null | undefined): string | null {
  if (!valore) return null;
  const cifre = soloCifre(valore);
  if (cifre.length < CIFRE_IDENTITA) return null;
  return cifre.slice(-CIFRE_IDENTITA);
}

/** Due numeri scritti in qualunque modo sono lo stesso numero? */
export function stessoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = codaIdentita(a);
  const cb = codaIdentita(b);
  return ca != null && ca === cb;
}

/**
 * La forma da salvare: `+` e il prefisso del paese davanti.
 *
 * Le regole, in ordine, e ognuna esiste per un caso visto davvero:
 *
 *  1. se chi ha scritto il numero ha messo il `+`, gli si crede — è l'unico
 *     modo di rispettare un numero straniero;
 *  2. `00` davanti è il `+` scritto all'europea;
 *  3. se le cifre cominciano col prefisso del paese **e sono più di dieci**,
 *     il prefisso c'era già senza il `+`. Il controllo sulla lunghezza non è
 *     un dettaglio: `393 1234567` è un cellulare italiano vero che comincia
 *     per «39», e senza quel controllo diventerebbe `+393 1234567`, cioè un
 *     altro numero;
 *  4. altrimenti è un numero nazionale scritto senza prefisso.
 */
export function normalizzaE164(
  valore: string | null | undefined,
  paese: string = PAESE_PREDEFINITO,
): string | null {
  if (!valore) return null;
  const grezzo = valore.trim();
  const cifre = soloCifre(grezzo);
  if (!cifre) return null;

  if (grezzo.startsWith("+")) return `+${cifre}`;
  if (cifre.startsWith("00")) {
    const senzaZeri = cifre.slice(2);
    return senzaZeri ? `+${senzaZeri}` : null;
  }
  if (cifre.startsWith(paese) && cifre.length > 10) return `+${cifre}`;
  return `+${paese}${cifre}`;
}

/**
 * Come si scrive un numero per farlo leggere a una persona.
 *
 * Serve nell'interfaccia: `+393331234567` si legge male al telefono, e chi
 * deve richiamare un cliente legge il numero a voce.
 */
export function telefonoLeggibile(valore: string | null | undefined): string | null {
  if (!valore) return null;
  const cifre = soloCifre(valore);
  if (!cifre) return null;

  // Italia: prefisso paese + tre cifre + il resto. Per gli altri paesi non si
  // inventa un raggruppamento che potrebbe non essere il loro: si tiene la
  // forma internazionale.
  const e164 = normalizzaE164(valore);
  if (!e164) return null;
  if (!e164.startsWith(`+${PAESE_PREDEFINITO}`)) return e164;

  const nazionale = e164.slice(1 + PAESE_PREDEFINITO.length);
  if (nazionale.length < 6) return e164;
  return `+${PAESE_PREDEFINITO} ${nazionale.slice(0, 3)} ${nazionale.slice(3)}`;
}
