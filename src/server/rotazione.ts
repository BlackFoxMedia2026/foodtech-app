import { db } from "@/lib/db";
import { DEFAULT_TIMEZONE } from "./availability";

/**
 * Quanto stanno a tavola, e quante volte gira un tavolo.
 *
 * Sono due domande che un ristoratore si fa da sempre e a cui rispondeva a
 * memoria. Tavolo le può misurare perché segna **quando qualcuno si siede** e
 * **quando il conto si chiude** — e le misura solo su quelle, senza stimare il
 * resto.
 *
 * La prima serve a una cosa pratica: la durata impostata sulle prenotazioni
 * (105 minuti) decide quanti tavoli il motore accetta di vendere. Se le cene
 * durano davvero due ore, quella durata sta regalando ritardi a ogni servizio;
 * se ne durano novanta, sta buttando via coperti. È un numero che si guarda una
 * volta al mese e si cambia una volta all'anno.
 *
 * Tre regole, le stesse di ogni altro conto di questo progetto:
 *
 * - **si misura su chi si è seduto e ha chiuso il conto.** Una prenotazione
 *   segnata «completata» senza orari non dice quanto è durata, e non entra;
 * - **si dice su quante prenotazioni è stata fatta la misura.** Una media su
 *   sei cene non è la durata media del locale, è la durata di sei cene;
 * - **sotto un minimo non si dà un numero.** «Ancora presto» è una risposta.
 */

export type RigaSeduta = {
  tableId: string | null;
  /** Il giorno di servizio, già nel fuso del locale (AAAA-MM-GG). */
  giorno: string;
  seatedAt: Date;
  closedAt: Date | null;
  /** La durata che era stata prevista quando si è prenotato. */
  durationMin: number;
};

export type RotazioneReport = {
  /** Prenotazioni con orario di arrivo **e** di chiusura: la base della misura. */
  misurate: number;
  /** Quante ne abbiamo guardate in tutto, comprese quelle senza orari. */
  sedute: number;
  durataMediaMin: number | null;
  /** La durata prevista sulle stesse prenotazioni, per confronto. */
  durataPrevistaMin: number | null;
  /** Quante volte in media un tavolo è stato usato in un giorno di servizio. */
  giri: number | null;
  tavoliUsati: number;
  giorniDiServizio: number;
  abbastanza: boolean;
};

/** Sotto questi numeri non si dà una media: sarebbe l'aneddoto di una serata. */
export const MINIMO_MISURATE = 10;

/** La parte pura: stessi dati, stesso esito, nessuna lettura. */
export function calcolaRotazione(righe: RigaSeduta[]): RotazioneReport {
  const conOrari = righe.filter((r) => r.closedAt && r.closedAt.getTime() > r.seatedAt.getTime());

  const durate = conOrari.map((r) => Math.round((r.closedAt!.getTime() - r.seatedAt.getTime()) / 60_000));
  const durataMediaMin = durate.length ? Math.round(durate.reduce((a, b) => a + b, 0) / durate.length) : null;
  const durataPrevistaMin = conOrari.length
    ? Math.round(conOrari.reduce((n, r) => n + r.durationMin, 0) / conOrari.length)
    : null;

  // I giri si contano su **tutte** le sedute con un tavolo, anche quelle senza
  // orario di chiusura: per sapere quante volte un tavolo è stato usato basta
  // sapere che qualcuno ci si è seduto.
  const conTavolo = righe.filter((r) => r.tableId);
  const perTavoloGiorno = new Map<string, number>();
  const tavoli = new Set<string>();
  const giorni = new Set<string>();
  for (const r of conTavolo) {
    const chiave = `${r.giorno}|${r.tableId}`;
    perTavoloGiorno.set(chiave, (perTavoloGiorno.get(chiave) ?? 0) + 1);
    tavoli.add(r.tableId!);
    giorni.add(r.giorno);
  }

  const giri = perTavoloGiorno.size
    ? Math.round(([...perTavoloGiorno.values()].reduce((a, b) => a + b, 0) / perTavoloGiorno.size) * 10) / 10
    : null;

  return {
    misurate: conOrari.length,
    sedute: righe.length,
    durataMediaMin,
    durataPrevistaMin,
    giri,
    tavoliUsati: tavoli.size,
    giorniDiServizio: giorni.size,
    abbastanza: conOrari.length >= MINIMO_MISURATE,
  };
}

export async function rotazioneTavoli(venueId: string, from: Date, to: Date): Promise<RotazioneReport> {
  const [venue, bookings] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        seatedAt: { not: null },
        startsAt: { gte: from, lte: to },
      },
      select: { tableId: true, seatedAt: true, closedAt: true, durationMin: true, startsAt: true },
    }),
  ]);

  const timezone = venue?.timezone ?? DEFAULT_TIMEZONE;
  // Il giorno di servizio è quello in cui la prenotazione **comincia**, letto
  // nel fuso del locale: una cena che finisce dopo mezzanotte appartiene alla
  // serata in cui è cominciata, non a quella dopo.
  const giornoDi = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });

  return calcolaRotazione(
    bookings.map((b) => ({
      tableId: b.tableId,
      giorno: giornoDi.format(b.startsAt),
      seatedAt: b.seatedAt!,
      closedAt: b.closedAt,
      durationMin: b.durationMin,
    })),
  );
}
