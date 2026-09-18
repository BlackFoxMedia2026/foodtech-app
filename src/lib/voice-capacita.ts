/**
 * Cosa sa fare il telefono di questo locale.
 *
 * ## Perché sta in `lib` e non in `server`
 *
 * Perché la legge anche l'interfaccia: i pulsanti che compaiono dipendono da
 * questo. Da un modulo `"use client"` il server non può leggere un valore
 * esportato, quindi il tipo e le parole stanno qui, e le implementazioni dei
 * fornitori in `server/voice/`.
 *
 * ## La regola che questo file esiste per far rispettare
 *
 * **Quello che il fornitore non sa fare non compare.** Non compare spento, non
 * compare con un cartello «in arrivo», non compare con un messaggio d'errore
 * quando lo si premo: non c'è.
 *
 * Un pulsante «Trasferisci» che non trasferisce è peggio dell'assenza del
 * pulsante, perché chi ha una persona in linea lo premo e resta lì ad
 * aspettare. E un'interfaccia che mostra dodici comandi di cui tre funzionano
 * insegna a non fidarsi di nessuno dei dodici.
 */

export type CapacitaVoice = {
  /** Riceve le chiamate: è il minimo perché Voice serva a qualcosa. */
  entranti: boolean;
  /** Può chiamare lui. Serve al pulsante «Richiama». */
  uscenti: boolean;
  /** Si risponde dal browser (WebRTC). */
  browser: boolean;
  /** Si può passare la chiamata a un altro numero o a una persona. */
  trasferimento: boolean;
  /** Si può mettere in attesa. */
  attesa: boolean;
  /** Si possono mandare i toni: serve per i risponditori altrui. */
  toni: boolean;
  /** Produce la registrazione della chiamata. */
  registrazione: boolean;
  /** Produce la trascrizione. */
  trascrizione: boolean;
  /** Ha una segreteria. */
  segreteria: boolean;
  /** Sa far rispondere una macchina. */
  ai: boolean;
};

/**
 * Nessuna capacità.
 *
 * È il punto di partenza di ogni fornitore, e il valore quando non c'è nessun
 * fornitore configurato: così un fornitore nuovo deve **dichiarare** cosa sa
 * fare, invece di ereditare un elenco di sì che nessuno ha verificato.
 */
export const NESSUNA_CAPACITA: CapacitaVoice = {
  entranti: false,
  uscenti: false,
  browser: false,
  trasferimento: false,
  attesa: false,
  toni: false,
  registrazione: false,
  trascrizione: false,
  segreteria: false,
  ai: false,
};

/** Come si chiamano, per la schermata dello stato del fornitore. */
export const NOME_CAPACITA: Record<keyof CapacitaVoice, string> = {
  entranti: "Riceve le chiamate",
  uscenti: "Chiama",
  browser: "Si risponde dal browser",
  trasferimento: "Trasferisce",
  attesa: "Mette in attesa",
  toni: "Manda i toni",
  registrazione: "Registra",
  trascrizione: "Trascrive",
  segreteria: "Segreteria",
  ai: "Risponde con una voce automatica",
};

/**
 * Le capacità in ordine di quanto contano per chi legge.
 *
 * «Riceve le chiamate» prima di «manda i toni»: la schermata dello stato si
 * legge dall'alto quando qualcosa non va, e la prima riga deve essere quella
 * che spiega il novanta per cento dei casi.
 */
export const ORDINE_CAPACITA: (keyof CapacitaVoice)[] = [
  "entranti",
  "browser",
  "uscenti",
  "ai",
  "registrazione",
  "trascrizione",
  "segreteria",
  "trasferimento",
  "attesa",
  "toni",
];

/**
 * Se con queste capacità il telefono serve a qualcosa.
 *
 * Un fornitore che non riceve chiamate non è un fornitore a metà: è un
 * fornitore che non fa la cosa per cui Voice esiste, e la schermata deve
 * dirlo in cima invece di elencare nove «no» e lasciar cercare.
 */
export function utilizzabile(c: CapacitaVoice): boolean {
  return c.entranti;
}
