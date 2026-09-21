import { db } from "@/lib/db";

/**
 * Il cambio, da una fonte sola e salvata.
 *
 * Amazon fattura in dollari e noi ragioniamo in euro. La conversione **non**
 * si fa nella pagina: un numero convertito al volo non si può più verificare
 * — fra tre mesi nessuno sa a che tasso è stato calcolato, e due schermate
 * aperte a dieci minuti di distanza mostrano due euro diversi per lo stesso
 * dollaro.
 *
 * Quindi: il tasso si legge da `CambioValuta`, si applica nel server, e si
 * **salva accanto all'importo** insieme alla sua data (vedi `CostPeriod`).
 *
 * La tabella è del modulo costi e non è la vecchia `ExchangeRate`: quella è
 * stata eliminata il 21 settembre 2026 perché nessuno ci scriveva davvero. Qui
 * un padrone c'è, ed è questo file.
 */

export type Cambio = { tasso: number; letoIl: Date } | null;

/**
 * L'ultimo cambio conosciuto fra due valute, o `null`.
 *
 * `null` non è un errore ed è importante che non lo diventi: significa che
 * non sappiamo convertire, e la risposta giusta è mostrare i dollari dicendo
 * che il cambio manca. Un 1:1 per difetto sarebbe uno sbaglio del 13% — quanto
 * basta a far sembrare in regola un cliente che sta sforando.
 */
export async function cambioCorrente(da: string, a: string): Promise<Cambio> {
  if (da === a) return { tasso: 1, letoIl: new Date() };

  const riga = await db.cambioValuta.findFirst({
    where: { da, a },
    orderBy: { lettoIl: "desc" },
  });
  if (!riga) return null;

  return { tasso: Number(riga.tasso), letoIl: riga.lettoIl };
}

/**
 * Registra un cambio. Una riga per lettura, mai un aggiornamento.
 *
 * Lo storico serve: il costo di agosto è stato contabilizzato al cambio di
 * agosto, e sovrascrivere il tasso renderebbe irripetibile il conto di un mese
 * già chiuso.
 */
export async function registraCambio(
  da: string,
  a: string,
  tasso: number,
  quando = new Date(),
  fonte = "MANUALE",
) {
  return db.cambioValuta.create({ data: { da, a, tasso, lettoIl: quando, fonte } });
}
