import { db } from "@/lib/db";
import { chiamateVive, type ChiamataViva } from "@/server/chiamate";

/**
 * Quello che il telefono chiede di fare **adesso**, per il guscio.
 *
 * ## Perché non riusa la fotografia del servizio
 *
 * Perché questo lo legge **ogni pagina**. La fotografia del servizio è grande
 * — prenotazioni, tavoli, coda, conti — e scaricarla mentre si guarda la carta
 * o le impostazioni vorrebbe dire pagare tutto il Servizio per sapere se
 * squilla il telefono.
 *
 * Il **segnale** invece è lo stesso: la sonda condivisa a cinque secondi
 * (`use-servizio-vivo`) dice «è cambiato qualcosa», e le chiamate sono già
 * dentro quella firma. Cambia solo cosa si scarica quando la risposta è sì.
 *
 * ## Le due cose che contano, e sono diverse
 *
 * - **chi sta chiamando adesso**: dura venti secondi, e va mostrato addosso;
 * - **quante azioni sono in sospeso**: chiamate perse da gestire e persone da
 *   richiamare. Non è un conteggio delle telefonate di oggi — quello è una
 *   statistica, e un numero in testata che dice «47» non chiede niente a
 *   nessuno.
 */

export type StatoVivoTelefono = {
  /** Chi sta chiamando o è in linea. Vuoto quasi sempre, ed è normale. */
  chiamate: ChiamataViva[];
  /** Le chiamate perse che nessuno ha ancora gestito. */
  perseDaGestire: number;
  /** Le persone da richiamare, in coda. */
  richiamateAperte: number;
  /**
   * Le azioni in sospeso: la somma delle due.
   *
   * È il numero da mettere nel bollino in testata. **Non** le chiamate di
   * oggi: un bollino che dice «47» non chiede niente a nessuno, e dopo due
   * giorni non lo si guarda più.
   */
  azioni: number;
};

export const VUOTO: StatoVivoTelefono = {
  chiamate: [],
  perseDaGestire: 0,
  richiamateAperte: 0,
  azioni: 0,
};

/** Da quanto indietro si contano le perse «da gestire». */
const FINESTRA_PERSE_ORE = 24;

export async function statoVivoTelefono(
  venueId: string,
  adesso: Date = new Date(),
): Promise<StatoVivoTelefono> {
  const da = new Date(adesso.getTime() - FINESTRA_PERSE_ORE * 60 * 60 * 1000);

  const [chiamate, perse, richiamate] = await Promise.all([
    chiamateVive(venueId, adesso),
    /* Perse **da gestire**: senza una prenotazione nata dopo e senza una
       richiamata già in coda. Senza queste due condizioni il bollino
       resterebbe acceso su chiamate a cui qualcuno ha già risposto in un
       altro modo, e un bollino che non si spegne si impara a ignorare. */
    db.phoneCall.count({
      where: {
        venueId,
        status: "MISSED",
        startedAt: { gte: da },
        bookingId: null,
        callbacks: { none: {} },
      },
    }),
    db.voiceCallback.count({ where: { venueId, stato: "OPEN" } }),
  ]);

  return {
    chiamate,
    perseDaGestire: perse,
    richiamateAperte: richiamate,
    azioni: perse + richiamate,
  };
}
