/**
 * I conti della riconciliazione, senza database e senza Amazon.
 *
 * Tre numeri che non vanno mai fusi, ed è tutta la fase 4:
 *
 * - **dichiarato**: quanto Amazon fattura all'account, per servizio e mese;
 * - **attribuito**: quanto il nostro ledger ha messo in capo ai clienti;
 * - **non attribuito**: la differenza.
 *
 * Il terzo non è un errore da far sparire. Sono i costi che l'account sostiene
 * e che nessun cliente ha generato da solo — verifiche di dominio, invii di
 * prova, traffico di servizio — più l'imprecisione del listino. Spalmarlo sui
 * clienti pro quota darebbe numeri che sembrano precisi e non lo sono, e su
 * quei numeri decideremmo i prezzi dei piani.
 */

export type EsitoRiconciliazione = {
  dichiarato: number | null;
  attribuito: number;
  nonAttribuito: number | null;
  /** Di quanto il reale si scosta dalla stima, in percentuale. */
  scostamentoPct: number | null;
  stato: "IN_ATTESA" | "RICONCILIATO" | "SOLO_STIMA";
};

/**
 * Mette insieme i tre numeri.
 *
 * Senza il dato di Amazon lo stato è `SOLO_STIMA` e le altre due colonne
 * restano nulle: non si finge di aver riconciliato qualcosa confrontando una
 * stima con se stessa.
 *
 * Lo scostamento si calcola sulla **stima**, non sul reale: la domanda a cui
 * risponde è «di quanto sbaglia il nostro listino», e il denominatore di
 * quella domanda è ciò che il listino ha prodotto.
 */
export function riconcilia(dichiarato: number | null, attribuito: number): EsitoRiconciliazione {
  if (dichiarato === null) {
    return {
      dichiarato: null,
      attribuito,
      nonAttribuito: null,
      scostamentoPct: null,
      stato: "SOLO_STIMA",
    };
  }

  const nonAttribuito = arrotonda(dichiarato - attribuito);
  const scostamentoPct =
    attribuito > 0 ? Math.round(((dichiarato - attribuito) / attribuito) * 10_000) / 100 : null;

  return {
    dichiarato: arrotonda(dichiarato),
    attribuito: arrotonda(attribuito),
    nonAttribuito,
    scostamentoPct,
    stato: "RICONCILIATO",
  };
}

/**
 * Il listino andrebbe corretto?
 *
 * Una soglia esiste perché uno scostamento piccolo è normale: arrotondamenti,
 * messaggi di servizio, un cambio letto un giorno prima. Sotto il cinque per
 * cento non si tocca niente — inseguire il rumore significa cambiare il
 * listino ogni mese e non poter più confrontare due mesi fra loro.
 */
export function listinoDaCorreggere(scostamentoPct: number | null, soglia = 5): boolean {
  if (scostamentoPct === null) return false;
  return Math.abs(scostamentoPct) >= soglia;
}

/**
 * Gli eventi di Amazon tornano indietro?
 *
 * Confronta gli invii che il nostro contatore dichiara con gli eventi `SEND`
 * che SES ci ha rimandato. Se i secondi sono molto meno dei primi, la catena
 * degli eventi è rotta: le campagne partono e le statistiche restano ferme,
 * che è il guasto invisibile per eccellenza — nessun errore, nessuna schermata
 * rossa, solo numeri che smettono di crescere.
 *
 * Tolleranza al dieci per cento: gli eventi arrivano con qualche minuto di
 * ritardo, e un ciclo guardato a metà giornata ne ha sempre qualcuno in volo.
 */
export function eventiInArrivo(inviiLedger: number, inviiSes: number, tolleranza = 0.1): boolean {
  if (inviiLedger === 0) return true;
  return inviiSes >= inviiLedger * (1 - tolleranza);
}

function arrotonda(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
