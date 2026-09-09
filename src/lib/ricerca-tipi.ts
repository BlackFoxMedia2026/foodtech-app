/**
 * Le costanti e le forme della ricerca globale, **senza il database**.
 *
 * Sta in `lib` e non in `server/ricerca` perché le usa anche il client: la
 * finestra di ricerca ha bisogno di sapere da quante lettere si comincia e che
 * forma hanno i risultati. Importandole dal modulo del server, dentro il
 * pacchetto del browser finirebbe anche Prisma — è già successo una volta con
 * i livelli degli avvisi, e la seconda volta si evita.
 */

/** Da quante lettere si comincia a cercare: sotto, sono troppi risultati. */
export const MINIMO_LETTERE = 2;

/** Quante cifre servono perché una stringa sia trattata come un numero. */
export const MINIMO_CIFRE = 4;

/** Quanti risultati per tipo. Chi cerca un nome non scorre trenta righe. */
export const MAX_PER_TIPO = 6;

/**
 * Da quante lettere una domanda può essere un **riferimento** di prenotazione.
 *
 * Sei: è il numero di caratteri che una persona legge al telefono senza
 * sbagliare, e sotto quella lunghezza un frammento di identificativo
 * corrisponderebbe a mezzo archivio.
 */
export const MINIMO_RIFERIMENTO = 6;

/** La finestra delle prenotazioni: una settimana indietro, un mese avanti. */
export const GIORNI_INDIETRO = 7;
export const GIORNI_AVANTI = 30;

export type OspiteTrovato = {
  id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  visite: number;
  /** VIP o ambassador: è la cosa che cambia come si risponde al telefono. */
  livello: string;
};

export type PrenotazioneTrovata = {
  id: string;
  nome: string;
  /** Vero quando è stata trovata per riferimento e non per nome. */
  perRiferimento?: boolean;
  /** Arriva dal server come `Date`, e via JSON come stringa: si legge con `new Date`. */
  quando: Date | string;
  partySize: number;
  stato: string;
  tavolo: string | null;
};

export type EsitoRicerca = {
  /** La domanda, ripulita: serve al client per non mostrare esiti vecchi. */
  q: string;
  ospiti: OspiteTrovato[];
  prenotazioni: PrenotazioneTrovata[];
  /** Quanti ospiti corrispondono in tutto, anche oltre le righe restituite. */
  ospitiTotali: number;
  prenotazioniTotali: number;
};

/** Solo le cifre, per confrontare due numeri scritti in modi diversi. */
export function soloCifre(raw: string): string {
  return raw.replace(/\D/g, "");
}
