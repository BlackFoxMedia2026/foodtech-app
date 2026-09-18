import { db } from "@/lib/db";
import type { EsitoChiamata } from "@/lib/voice-esiti";

/**
 * I numeri del telefono: quante chiamate, a che ora, quante diventano tavoli.
 *
 * ## La domanda per cui esiste
 *
 * Una sola, e nessuna schermata di Tavolo la sapeva: **a che ora squilla il
 * telefono, e in quelle ore c'è qualcuno che risponde?** Un ristorante che
 * perde cinque chiamate fra le 20 e le 21 non ha un problema di telefono, ha
 * una persona in meno in quella fascia — e questo si vede solo mettendo in
 * fila le ore.
 *
 * La seconda: **quante telefonate diventano prenotazioni.** È la ragione per
 * cui un locale paga il centralino, e fin qui era una cosa che si sentiva
 * addosso senza poterla dire.
 *
 * ## Quello che questa lettura ammette di non sapere
 *
 * `senzaEsito` conta le chiamate a cui qualcuno ha risposto e che **nessuno ha
 * chiuso**. Serve a non presentare una percentuale come se fosse tutta la
 * verità: se su cento telefonate quaranta non hanno esito, «il 12% diventa
 * prenotazione» è un numero che si commenta da sé — e senza questo dato
 * sembrerebbe un risultato invece di un campione.
 *
 * È lo stesso principio del tetto sulle liste: un numero senza la sua base è
 * una bugia.
 *
 * ## Aggregati, e solo aggregati
 *
 * Qui non escono nomi né numeri di telefono: sono conteggi. Per questo la
 * pagina delle analitiche non chiede `use_phone` — chi legge i numeri del
 * locale non sta leggendo i clienti, e lo storico con nomi e numeri resta
 * dietro il suo permesso.
 */

export type OraDelTelefono = {
  /** L'ora del locale, 0-23. */
  ora: number;
  risposte: number;
  perse: number;
};

export type NumeriTelefono = {
  totale: number;
  risposte: number;
  perse: number;
  /** Quante hanno prodotto una prenotazione. */
  prenotazioni: number;
  /** Percentuale di telefonate diventate prenotazione, o `null` se non ce ne sono. */
  conversione: number | null;
  /** Chiamate a cui si è risposto e che nessuno ha chiuso con un esito. */
  senzaEsito: number;
  /** Quante per ogni esito, dal più frequente. */
  esiti: { esito: EsitoChiamata; quante: number }[];
  ore: OraDelTelefono[];
  /** L'ora in cui se ne perdono più: è il consiglio, e si dà solo se esiste. */
  oraPeggiore: { ora: number; perse: number } | null;
};

export async function numeriTelefono(
  venueId: string,
  da: Date,
  a: Date,
  fuso = "Europe/Rome",
): Promise<NumeriTelefono> {
  const righe = await db.phoneCall.findMany({
    where: { venueId, startedAt: { gte: da, lte: a } },
    select: {
      startedAt: true,
      status: true,
      outcome: true,
      bookingId: true,
    },
  });

  /* L'ora si legge nel **fuso del locale** e non in quello del server: una
     chiamata delle 20:40 di Torino, letta in UTC, finisce nella fascia delle
     18 — e il consiglio che ne esce («metti qualcuno al telefono alle 18»)
     manderebbe una persona a rispondere a un telefono che non squilla. */
  const oraDi = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    hour12: false,
    timeZone: fuso,
  });

  const ore: OraDelTelefono[] = Array.from({ length: 24 }, (_, ora) => ({
    ora,
    risposte: 0,
    perse: 0,
  }));

  const perEsito = new Map<EsitoChiamata, number>();
  let perse = 0;
  let risposte = 0;
  let prenotazioni = 0;
  let senzaEsito = 0;

  for (const r of righe) {
    const ora = Number(oraDi.format(r.startedAt)) % 24;
    const persa = r.status === "MISSED";
    if (persa) {
      perse += 1;
      ore[ora]!.perse += 1;
    } else {
      risposte += 1;
      ore[ora]!.risposte += 1;
    }
    if (r.bookingId) prenotazioni += 1;
    if (r.outcome) {
      const e = r.outcome as EsitoChiamata;
      perEsito.set(e, (perEsito.get(e) ?? 0) + 1);
    } else if (!persa) {
      senzaEsito += 1;
    }
  }

  const totale = righe.length;

  /* L'ora peggiore solo se le perse di quell'ora sono **almeno due**: su una
     sola, «alle 15 perdi le chiamate» è un caso, e un consiglio ricavato da un
     caso fa perdere fiducia in tutti gli altri. */
  const peggiore = [...ore].sort((x, y) => y.perse - x.perse)[0];
  const oraPeggiore =
    peggiore && peggiore.perse >= 2
      ? { ora: peggiore.ora, perse: peggiore.perse }
      : null;

  return {
    totale,
    risposte,
    perse,
    prenotazioni,
    conversione: totale > 0 ? Math.round((prenotazioni / totale) * 100) : null,
    senzaEsito,
    esiti: [...perEsito.entries()]
      .map(([esito, quante]) => ({ esito, quante }))
      .sort((x, y) => y.quante - x.quante),
    ore,
    oraPeggiore,
  };
}
