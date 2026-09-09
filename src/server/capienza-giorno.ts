import { db } from "@/lib/db";

/**
 * Quanti coperti può servire il locale **in un giorno**.
 *
 * È la somma dei turni attivi di quel giorno della settimana: pranzo più cena
 * sono due servizi diversi con due sale piene diverse, e chi si siede a
 * mezzogiorno libera il posto per la sera.
 *
 * Questa domanda aveva due risposte, e si contraddicevano sulla stessa
 * giornata. La Panoramica prendeva la capienza di **un solo turno** — quello in
 * corso, o il prossimo — e ci divideva i coperti di **tutta** la giornata:
 * con turni da 60 e 90, 75 coperti facevano 125%, e un `Math.min(100, …)`
 * trasformava l'errore in un tranquillo «100% pieno». La previsione, invece,
 * sommava i turni e diceva 44%. Lo stesso giorno, due numeri, entrambi
 * scritti dal prodotto.
 *
 * Restituisce `null` quando non c'è nessun turno configurato. Nullo non è
 * zero e non è un valore di ripiego: se il locale non ha dichiarato i suoi
 * turni non sappiamo quanto sia pieno, e va detto invece di dividere per un
 * numero inventato (prima era `?? 90`, cioè la capienza di un ristorante che
 * non è questo).
 */
export async function capienzaDelGiorno(venueId: string, day: Date): Promise<number | null> {
  const turni = await db.shift.findMany({
    where: { venueId, weekday: day.getDay(), active: true },
    select: { capacity: true },
  });
  if (turni.length === 0) return null;
  const somma = turni.reduce((s, t) => s + t.capacity, 0);
  return somma > 0 ? somma : null;
}

/**
 * Quanto è pieno, in percentuale, senza tetto a cento.
 *
 * Il tetto era la ragione per cui l'errore di sopra è vissuto a lungo: 125%
 * si nota, «100% pieno» no. E oltre il cento c'è un'informazione vera — il
 * locale accetta prenotazioni oltre la capienza (`overbookingPct`), e chi
 * gestisce la sala deve saperlo prima del servizio, non durante.
 */
export function quantoPieno(coperti: number, capienza: number | null): number | null {
  if (capienza == null || capienza <= 0) return null;
  return Math.round((coperti / capienza) * 100);
}
