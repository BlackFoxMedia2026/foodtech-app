/**
 * Il recupero di una telefonata interrotta, dal lato delle parole.
 *
 * Sta in `lib/` perché lo leggono il server (che scrive le righe) e le
 * schermate (che le mostrano): un elenco di passi duplicato in due posti
 * divergerebbe al primo nome cambiato, e allora i conti dell'abbandono
 * direbbero due cose diverse.
 */

/**
 * Dove si è interrotta la telefonata.
 *
 * Elenco **chiuso** e in ordine di conversazione, perché il suo scopo non è
 * descrivere: è contare. «Su cosa riattacca la gente?» è la domanda che fa
 * migliorare il dialogo invece di indovinarlo — e con un campo libero quella
 * domanda non si può rispondere.
 */
export const PASSI_RECUPERO = [
  /** Ha sentito il saluto e ha chiuso: non abbiamo ancora chiesto niente. */
  "saluto",
  "persone",
  "orario",
  "giorno",
  "nome",
  /** Aveva tutto e non ha confermato: è l'abbandono che pesa più di tutti. */
  "conferma",
] as const;

export type PassoRecupero = (typeof PASSI_RECUPERO)[number];

export const NOME_PASSO: Record<PassoRecupero, string> = {
  saluto: "Al saluto",
  persone: "Su quante persone",
  orario: "Sull'ora",
  giorno: "Sul giorno",
  nome: "Sul nome",
  conferma: "Alla conferma",
};

/** Com'è andato l'invio del link, per chi legge una schermata. */
export const NOME_INVIO = {
  DA_MANDARE: "Da mandare",
  MANDATO: "Mandato",
  SENZA_CANALE: "Nessun canale per mandarlo",
  NON_RIUSCITO: "Invio non riuscito",
} as const;

export function passoValido(valore: string | null | undefined): PassoRecupero | null {
  if (!valore) return null;
  return (PASSI_RECUPERO as readonly string[]).includes(valore)
    ? (valore as PassoRecupero)
    : null;
}
