import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";

/**
 * Un segnale corto che dice **se** qualcosa è cambiato nel servizio.
 *
 * Sala, Servizio e Attesa si riaggiornavano da sole ogni trenta secondi
 * riscaricando l'intera fotografia. Trenta secondi in sala sono lunghi: chi
 * accomoda un tavolo e chi guarda la mappa dall'altra parte della sala vedono
 * due cose diverse per mezzo minuto, e in mezzo minuto si può portare una
 * persona a un tavolo già occupato.
 *
 * ## Perché non il push vero
 *
 * Su Vercel non ci sono WebSocket, e una connessione SSE tenuta aperta da ogni
 * tablet costa una funzione per tutto il servizio — per poi dover comunque
 * interrogare il database dall'interno, perché `LISTEN/NOTIFY` di Postgres non
 * passa attraverso il pooler di Neon. Il push «vero» qui costerebbe più
 * lavoro sul database di quello che risparmia, non meno.
 *
 * Quindi: si chiede spesso una domanda **piccola** («è cambiato qualcosa?») e
 * si scarica la fotografia intera **solo quando la risposta cambia**. Cinque
 * secondi invece di trenta, con meno lavoro di prima.
 *
 * ## Come è fatto
 *
 * Per ogni cosa che conta durante il servizio: quante righe ci sono e qual è
 * la più recentemente toccata. Il conteggio serve perché `max(updatedAt)` da
 * solo non vede le cancellazioni — una prenotazione tolta non aggiorna niente,
 * fa solo diminuire il totale.
 *
 * Le tre interrogazioni usano indici che esistono già e toccano solo le righe
 * di **oggi** (o la coda aperta, che è corta per natura): nessuna scansione di
 * tabella, nessuna migrazione.
 */
export async function versioneServizio(venueId: string, adesso = new Date()) {
  const inizio = startOfDay(adesso);
  const fine = endOfDay(adesso);

  const [prenotazioni, coda, conti] = await Promise.all([
    // Indice: [venueId, startsAt]
    db.booking.aggregate({
      where: { venueId, startsAt: { gte: inizio, lte: fine }, deletedAt: null },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    // Indice: [venueId, status, createdAt]. La coda chiusa non cambia più.
    db.waitlistEntry.aggregate({
      where: { venueId, status: { in: ["WAITING", "NOTIFIED", "CONFIRMED"] } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    // I conti aperti: quello che si muove durante il servizio.
    db.order.aggregate({
      where: { venueId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
  ]);

  const pezzo = (a: { _count: { _all: number }; _max: { updatedAt: Date | null } }) =>
    `${a._count._all}.${a._max.updatedAt?.getTime() ?? 0}`;

  return `${pezzo(prenotazioni)}-${pezzo(coda)}-${pezzo(conti)}`;
}
