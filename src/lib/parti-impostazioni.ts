/**
 * Le quattro parti delle Impostazioni: i nomi e la lettura dell'indirizzo.
 *
 * In `lib` e non nel componente dell'indice, che è un `"use client"`: da un
 * modulo client il server non può leggere un valore esportato. Stessa ragione
 * di `lib/viste-insights`.
 *
 * Il criterio del raggruppamento è **di chi è la decisione**: il locale (chi
 * siamo, chi lavora, com'è fatta la sala), le prenotazioni (le regole con cui
 * si accettano), gli ospiti (cosa si fa con chi è venuto), il sistema (le cose
 * che riguardano il funzionamento, non il ristorante).
 */
export const PARTI = [
  { id: "locale", titolo: "Il locale", sottotitolo: "Chi siamo, chi lavora, com'è fatta la sala" },
  { id: "prenotazioni", titolo: "Prenotazioni", sottotitolo: "Le regole con cui si accettano" },
  { id: "ospiti", titolo: "Ospiti", sottotitolo: "Cosa si fa con chi è venuto" },
  { id: "sistema", titolo: "Sistema", sottotitolo: "Invii, integrazioni, stato dei lavori" },
] as const;

export type ParteId = (typeof PARTI)[number]["id"];

/** La parte scelta nell'indirizzo, o la prima. */
export function parteDa(valore: string | null | undefined): ParteId {
  return PARTI.find((p) => p.id === valore)?.id ?? PARTI[0].id;
}
