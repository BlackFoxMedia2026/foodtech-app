/**
 * Cosa conta come **visita**.
 *
 * Una definizione sola, in un posto solo. Era scritta in tre: in
 * `server/guest-intelligence.ts`, in `scripts/refresh-guest-stats.ts` e nel
 * seed della demo — e tre copie della stessa regola sono tre occasioni perché
 * l'elenco ospiti, i segmenti delle campagne e la demo rispondano in modo
 * diverso alla stessa domanda («quante volte è venuto?»).
 *
 * `COMPLETED` è chi ha cenato e se n'è andato; `SEATED` è chi è a tavola
 * adesso, e conta perché la visita sta succedendo. Non contano le prenotazioni
 * confermate ma non ancora arrivate: una prenotazione non è una visita finché
 * la persona non si siede.
 */
export const STATI_DI_VISITA = ["COMPLETED", "SEATED"] as const;

/** Vero se questo stato di prenotazione è una visita avvenuta o in corso. */
export function eUnaVisita(stato: string): boolean {
  return (STATI_DI_VISITA as readonly string[]).includes(stato);
}

/**
 * Visite, assenze e ultima visita, contate dalle righe.
 *
 * Restituisce i tre contatori che stanno su `Guest`. `totalSpend` resta fuori
 * di proposito: senza conti chiusi collegati a un ospite, scriverci una cifra
 * sarebbe inventarla.
 */
export function contatoriDaPrenotazioni(
  prenotazioni: { status: string; startsAt: Date }[],
): { visite: number; assenze: number; ultimaVisita: Date | null } {
  const visite = prenotazioni.filter((b) => eUnaVisita(b.status));
  const ultima = visite.map((b) => b.startsAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    visite: visite.length,
    assenze: prenotazioni.filter((b) => b.status === "NO_SHOW").length,
    ultimaVisita: ultima,
  };
}
