import { db } from "@/lib/db";
import { startOfDay } from "@/lib/utils";

/**
 * Quante assenze aspettarsi su un certo numero di prenotazioni.
 *
 * È la quota storica di no-show **di questo locale** applicata alle
 * prenotazioni di una giornata. Prima si moltiplicava la media di
 * `Guest.noShowCount` (un campo che nessuno aggiornava) per un fattore 0,1
 * scelto a occhio; qui è una proporzione su fatti — quante prenotazioni sono
 * finite in assenza negli ultimi novanta giorni.
 *
 * Il calcolo stava dentro `getOverview`, perché il numero si leggeva solo in
 * Panoramica. Ora si legge anche in Prenotazioni, accanto al conteggio della
 * giornata, e una formula in due posti diverge sempre: sta qui, e chi la
 * mostra la chiede. **Le query e l'arrotondamento sono gli stessi.**
 *
 * `oggi` è il giorno da cui si guarda indietro per la quota, e va distinto
 * dalla giornata di cui si contano le prenotazioni: in Prenotazioni si può
 * aprire sabato prossimo, e la quota deve restare quella misurata fino a
 * oggi — allargando la finestra fino a sabato vi entrerebbero le prenotazioni
 * dei prossimi giorni, che non hanno ancora un esito, e la quota scenderebbe
 * da sola.
 */
export async function assenzeAttese({
  venueId,
  prenotazioni,
  oggi = new Date(),
}: {
  venueId: string;
  /** Le prenotazioni della giornata, annullate escluse. */
  prenotazioni: number;
  oggi?: Date;
}): Promise<number> {
  const novantaGiorni = new Date(startOfDay(oggi));
  novantaGiorni.setDate(novantaGiorni.getDate() - 90);

  const [storiche, storicheAssenti] = await Promise.all([
    db.booking.count({
      where: { venueId, startsAt: { gte: novantaGiorni, lt: startOfDay(oggi) }, status: { not: "CANCELLED" } },
    }),
    db.booking.count({
      where: { venueId, startsAt: { gte: novantaGiorni, lt: startOfDay(oggi) }, status: "NO_SHOW" },
    }),
  ]);

  const quota = storiche > 0 ? storicheAssenti / storiche : 0;
  return Math.round(quota * prenotazioni);
}
