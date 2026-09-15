import type { WizardState } from "./wizard-context";

/**
 * La quota del piano nella forma che il riepilogo si aspetta, o niente.
 *
 * Sta in una funzione sola perché la usano due passi — «Segmento» e «Filtri» —
 * e perché la condizione «il dato c'è» va decisa in un posto: quando il piano
 * non è stato letto (una bozza aperta da un percorso che non lo passa) la
 * colonna non deve mostrare «0 invii disponibili», che è un allarme falso.
 */
export function quotaDelPiano(state: WizardState): { disponibili: number; limite: number } | null {
  if (state.quotaDisponibili === null || state.quotaLimite === null) return null;
  return { disponibili: state.quotaDisponibili, limite: state.quotaLimite };
}
