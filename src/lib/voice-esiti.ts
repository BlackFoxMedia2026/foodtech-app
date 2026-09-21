/**
 * Com'è finita una telefonata, in una parola sola.
 *
 * ## Perché un elenco chiuso e non un campo di testo
 *
 * Perché sulla fine delle telefonate si fanno i conti: quante hanno prodotto
 * una prenotazione, quante erano richieste d'informazioni, quante sono andate
 * perse. Con un campo libero ognuno scrive la sua parola — «prenotato»,
 * «prenotazione», «ok» — e a fine mese non si può contare niente.
 *
 * ## Due famiglie, e la differenza conta
 *
 * - **derivati**: li scrive il sistema perché c'è un *fatto* sotto. È nata una
 *   prenotazione, è nata una riga in lista d'attesa, nessuno ha risposto. Non
 *   si scelgono a mano: sarebbero una dichiarazione che contraddice il dato.
 * - **a mano**: li dice la persona che ha risposto, perché nessun dato li
 *   conosce. «Voleva sapere se siamo aperti a Pasqua» non lascia traccia da
 *   nessuna parte se non la lascia chi ha risposto.
 *
 * Sta in `lib` perché lo legge anche l'interfaccia: da un modulo `"use client"`
 * il server non può leggere un valore esportato.
 */

/** Gli stessi valori dell'enum `PhoneCallOutcome`, senza importare Prisma nel browser. */
export type EsitoChiamata =
  | "BOOKING_CREATED"
  | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED"
  | "WAITLIST_ADDED"
  | "INFORMATION"
  | "TRANSFERRED"
  | "CALLBACK_REQUIRED"
  | "MISSED"
  | "VOICEMAIL"
  | "NO_ACTION"
  | "FAILED";

/**
 * Come si legge un esito in una schermata.
 *
 * Al passato e in italiano parlato: chi legge queste righe sta ricostruendo
 * una serata, non consultando un registro di sistema.
 */
export const NOME_ESITO: Record<EsitoChiamata, string> = {
  BOOKING_CREATED: "Prenotazione presa",
  BOOKING_UPDATED: "Prenotazione modificata",
  BOOKING_CANCELLED: "Prenotazione disdetta",
  WAITLIST_ADDED: "Messo in lista d'attesa",
  INFORMATION: "Voleva un'informazione",
  TRANSFERRED: "Passata a qualcun altro",
  CALLBACK_REQUIRED: "Da richiamare",
  MISSED: "Nessuno ha risposto",
  VOICEMAIL: "Ha lasciato un messaggio",
  NO_ACTION: "Niente da fare",
  FAILED: "Chiamata non riuscita",
};

/**
 * Gli esiti che una persona può scegliere.
 *
 * Quattro, e in quest'ordine: i due che capitano più spesso davanti, e la
 * lista è corta di proposito. Un elenco di undici voci su un'azione che si fa
 * venti volte in una sera si smette di usare alla terza.
 *
 * Gli altri sette non sono scelte: sono fatti. «Prenotazione presa» lo dice la
 * prenotazione che esiste, «nessuno ha risposto» lo dice il centralino.
 */
export const ESITI_A_MANO = [
  "INFORMATION",
  "NO_ACTION",
  "CALLBACK_REQUIRED",
  "TRANSFERRED",
] as const satisfies readonly EsitoChiamata[];

export type EsitoAMano = (typeof ESITI_A_MANO)[number];

/**
 * Questo esito lo scrive il sistema?
 *
 * Serve al server per rifiutare una correzione che contraddice un fatto, e
 * all'interfaccia per non offrire il menu su una chiamata già chiusa da sé.
 */
export function esitoDerivato(esito: EsitoChiamata): boolean {
  return !(ESITI_A_MANO as readonly string[]).includes(esito);
}

/** Il tono del bollino: verde quello che ha prodotto qualcosa, rosso quello che si è perso. */
export const TONO_ESITO: Record<
  EsitoChiamata,
  "success" | "warning" | "danger" | "neutral"
> = {
  BOOKING_CREATED: "success",
  BOOKING_UPDATED: "success",
  WAITLIST_ADDED: "success",
  INFORMATION: "neutral",
  NO_ACTION: "neutral",
  TRANSFERRED: "neutral",
  BOOKING_CANCELLED: "warning",
  CALLBACK_REQUIRED: "warning",
  VOICEMAIL: "warning",
  MISSED: "danger",
  FAILED: "danger",
};

/** Chi ha risposto. Gli stessi valori dell'enum `PhoneCallHandler`. */
export type ChiHaRisposto = "HUMAN" | "AI" | "HYBRID" | "NONE";

export const NOME_CHI_RISPONDE: Record<ChiHaRisposto, string> = {
  HUMAN: "in sala",
  AI: "il risponditore",
  HYBRID: "il risponditore, poi una persona",
  NONE: "nessuno",
};
