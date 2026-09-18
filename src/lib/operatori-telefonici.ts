/**
 * Gli operatori telefonici, e la regola che questo file esiste per far
 * rispettare.
 *
 * **Le istruzioni per attivare la deviazione non si inventano.**
 *
 * Su una SIM italiana la deviazione di chiamata su *non risposta* e su
 * *occupato* si imposta con dei codici, e quei codici cambiano da operatore a
 * operatore: alcuni li accettano dal telefono, altri li impostano solo dal
 * loro servizio clienti, altri sulla loro area personale. Scrivere qui un
 * codice «che di solito funziona» e mostrarlo a un ristoratore significa
 * mandarlo a smanettare sulla propria SIM: se sbaglia, **perde le chiamate
 * vere** — non le nostre, le sue — e non c'e niente in Tavolo che glielo
 * possa dire.
 *
 * Quindi: `provato` parte **falso per tutti**, e finche e falso la schermata
 * dice l'unica cosa sicuramente vera, che e anche quella che il concorrente
 * dice a voce ai suoi clienti: *chiama il tuo operatore e chiedi la deviazione
 * su non risposta e su occupato verso questo numero*.
 *
 * ## Come si accende un operatore
 *
 * Non si accende leggendo una pagina di supporto. Si accende cosi:
 *
 * 1. una SIM di quell'operatore, in mano;
 * 2. si imposta la deviazione come le istruzioni che si vogliono scrivere;
 * 3. si chiama quel numero e si lascia squillare: la chiamata deve arrivare;
 * 4. si richiama mentre la linea e occupata: deve arrivare anche quella;
 * 5. si annulla la deviazione e si verifica che il telefono squilli di nuovo —
 *    perche un cliente che non sa tornare indietro e un cliente che ci chiama
 *    il sabato sera.
 *
 * Solo dopo si scrive `provato: true` con i passi **provati**, e la data.
 */

export type Operatore = {
  /** Come sta nel database. */
  id: string;
  nome: string;
  /**
   * Le istruzioni sono state provate con una SIM di questo operatore?
   *
   * Falso = la schermata mostra la frase generica. Non e una mancanza da
   * nascondere: e la differenza fra «lo so» e «credo».
   */
  provato: boolean;
  /** I passi, **solo** quando `provato`. Con la data della prova. */
  istruzioni?: { passi: string[]; provatoIl: string };
};

export const OPERATORI: Operatore[] = [
  { id: "tim", nome: "TIM", provato: false },
  { id: "vodafone", nome: "Vodafone", provato: false },
  { id: "windtre", nome: "WindTre", provato: false },
  { id: "iliad", nome: "Iliad", provato: false },
  { id: "fastweb", nome: "Fastweb", provato: false },
  { id: "ho", nome: "ho. / Very / altri virtuali", provato: false },
  { id: "altro", nome: "Un altro operatore", provato: false },
];

export function operatoreDa(id: string | null | undefined): Operatore | null {
  if (!id) return null;
  return OPERATORI.find((o) => o.id === id) ?? null;
}

/** Gli identificativi validi, per la convalida sul server. */
export const ID_OPERATORI = OPERATORI.map((o) => o.id);

/**
 * Cosa chiedere all'operatore, quando non abbiamo istruzioni provate.
 *
 * Due richieste e non una: la deviazione su non risposta porta le chiamate
 * che nessuno prende, quella su occupato porta quelle che arrivano **mentre**
 * si e al telefono con un altro cliente — che in un ristorante alle otto di
 * sera sono la meta di quelle perse.
 */
export const COSA_CHIEDERE = [
  "la deviazione di chiamata quando non rispondi, dopo 4 squilli",
  "la deviazione di chiamata quando la linea è occupata",
];
