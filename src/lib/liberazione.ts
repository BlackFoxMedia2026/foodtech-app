import { DURATA_PREDEFINITA_MIN } from "./durata";

/**
 * Quando si libera questo tavolo.
 *
 * È la domanda che chi accoglie fa cinquanta volte in una serata, e finora il
 * prodotto rispondeva con un conto solo: *orario prenotato + durata prevista*.
 * Due cose sbagliate, entrambe visibili in sala:
 *
 * - **partiva dall'orario prenotato, non da quando si sono seduti.** Un tavolo
 *   delle 20:00 che si siede alle 20:30 risultava «libero fra 15 minuti»
 *   mentre stavano leggendo il menu. Chi c'è dentro il servizio lo sa e
 *   smette di guardare il numero: un dato che non ci si fida a leggere è
 *   peggio di un dato assente, perché occupa lo spazio della risposta vera;
 * - **usava sempre i 105 minuti di default**, anche in un locale che ha
 *   duecento cene misurate che dicono centoquaranta.
 *
 * Qui la risposta si costruisce così:
 *
 * 1. si parte da **quando si sono seduti** — se non si sono ancora seduti,
 *    dall'orario prenotato, che è tutto quello che si sa;
 * 2. la durata è quella **misurata nel locale** quando c'è, ma solo se
 *    nessuno ne ha decisa una per questa prenotazione: se una persona ha
 *    scritto 180 minuti per una tavolata di dodici, sa più della mediana e
 *    la mediana non la corregge;
 * 3. l'esito **dice sempre da dove viene** (`MISURATO` o `PREVISTO`), perché
 *    «libero verso le 22:30» e «libero verso le 22:30, su 214 cene misurate»
 *    autorizzano decisioni diverse.
 *
 * La funzione è pura e vive in `lib`: la usano il motore della sala, la
 * fotografia del servizio e i componenti che girano nel browser — una
 * domanda, una formula. Averne due era il difetto: la mappa e il centro
 * controllo rispondevano con due conti scritti in due file.
 */

/** La durata tipica di una seduta, misurata sulle cene chiuse del locale. */
export type DurataTipica = {
  /** La mediana, in minuti. Mediana e non media: vedi `rotazione`. */
  medianaMin: number;
  /** Su quante sedute è stata misurata. Va detto insieme al numero. */
  misurate: number;
};

export type Liberazione = {
  /** L'istante in cui il tavolo si libera, come si prevede adesso. */
  fine: Date;
  /** Minuti da adesso. Negativo: il tavolo è già oltre. */
  minuti: number;
  /** La durata usata per il conto. */
  durataMin: number;
  /**
   * `MISURATO`: la durata viene dalle cene chiuse di questo locale.
   * `PREVISTO`: viene dalla durata scritta sulla prenotazione.
   */
  fonte: "MISURATO" | "PREVISTO";
  /** Vero se si è partiti dall'orario di arrivo reale e non da quello prenotato. */
  daSeduta: boolean;
};

export function previsioneLiberazione(
  prenotazione: { startsAt: Date; seatedAt?: Date | null; durationMin: number },
  now: Date,
  tipica?: DurataTipica | null,
): Liberazione {
  const inizio = prenotazione.seatedAt ?? prenotazione.startsAt;

  // La misura sostituisce **solo** il default: una durata decisa da una
  // persona per questa prenotazione resta quella.
  const durataDecisa = prenotazione.durationMin !== DURATA_PREDEFINITA_MIN;
  const usaMisura = !durataDecisa && !!tipica && tipica.medianaMin > 0;

  const durataMin = usaMisura ? tipica!.medianaMin : prenotazione.durationMin;
  const fine = new Date(inizio.getTime() + durataMin * 60_000);

  return {
    fine,
    minuti: Math.round((fine.getTime() - now.getTime()) / 60_000),
    durataMin,
    fonte: usaMisura ? "MISURATO" : "PREVISTO",
    daSeduta: !!prenotazione.seatedAt,
  };
}
