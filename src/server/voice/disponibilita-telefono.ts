import { db } from "@/lib/db";
import {
  AvailabilityError,
  checkAvailability,
  getDayAvailability,
  prossimiGiorniLiberi,
  zonedCalendarDate,
} from "@/server/availability";
import { durataConsigliata } from "@/server/durata-consigliata";

/**
 * «C'è posto alle nove?» — la domanda che il risponditore deve saper fare.
 *
 * ## Perché guarda ma non decide
 *
 * La prenotazione presa al telefono da una macchina nasce **da confermare**, e
 * resta così anche quando la disponibilità torna. Il motivo è sempre lo
 * stesso: quella sera il locale può aprire per una comunione, o tenere due
 * tavoli per un cliente che si annuncia sempre all'ultimo. Chi decide è chi
 * gestisce la sala.
 *
 * Quello che cambia è **cosa si dice a chi chiama**. Prima la voce prendeva
 * qualunque orario e riattaccava; adesso, se a quell'ora non ci sta, propone
 * gli orari che ci stanno — ed è la differenza fra un cliente che richiama e
 * un cliente che chiama il ristorante di fianco.
 *
 * ## Le regole severe, di proposito
 *
 * Il controllo usa il canale **`pubblico`**: la domanda è «un cliente avrebbe
 * potuto prenotare così?». Col canale interno non tornerebbe nessun
 * avvertimento nemmeno per quaranta persone alle quattro del mattino — giusto
 * per chi risponde al telefono in sala, inutile come misura. È la stessa
 * scelta di `prenotazione-telefonica.ts`, e vale la pena che sia la stessa.
 *
 * ## Se il motore non risponde, non si perde la telefonata
 *
 * Un guasto qui non deve diventare un «mi dispiace, non posso prenotare». Si
 * torna `controllato: false` e la voce prende la prenotazione come faceva
 * prima: da confermare, come tutte.
 */

/** Quante alternative si propongono. Tre sono quelle che una persona ricorda. */
export const MAX_ALTERNATIVE_VOCE = 3;

export type AlternativaTelefono = {
  /** L'istante, in ISO con il fuso: è quello che la voce rimanda indietro. */
  quando: string;
  /** Come si legge: «20:30». */
  ora: string;
  /** Il giorno, quando è diverso da quello chiesto: «venerdì 25 settembre». */
  giorno?: string;
};

export type EsitoDisponibilita = {
  /** Vero quando si è potuto guardare davvero. */
  controllato: boolean;
  /** Vero quando a quell'ora, per quelle persone, ci sta. */
  libero: boolean;
  /** Perché non ci sta, in parole che la voce può leggere. */
  motivi: string[];
  alternative: AlternativaTelefono[];
};

export async function disponibilitaPerTelefono(
  venueId: string,
  dati: { persone: number; quando: Date },
  adesso: Date = new Date(),
): Promise<EsitoDisponibilita> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  });
  const fuso = venue?.timezone ?? "Europe/Rome";

  try {
    /* La durata che il locale misura per un gruppo così, a quell'ora: è quella
       che decide se ci sta, e la stessa che userà la prenotazione. */
    const { durataMin } = await durataConsigliata(venueId, {
      partySize: dati.persone,
      startsAt: dati.quando,
    });

    const esito = await checkAvailability(venueId, {
      startsAt: dati.quando,
      partySize: dati.persone,
      durationMin: durataMin,
      tableId: null,
      canale: "pubblico",
      now: adesso,
    });

    if (esito.available) {
      return { controllato: true, libero: true, motivi: [], alternative: [] };
    }

    const motivi = esito.issues.map((p) => p.message);
    const alternative = await alternativeVicine(venueId, dati, durataMin, fuso, adesso);
    return { controllato: true, libero: false, motivi, alternative };
  } catch (err) {
    /* `AvailabilityError` qui non è un errore del programma: è il motore che
       dice «così non si può». Le altre eccezioni sì, e in entrambi i casi la
       telefonata va avanti. */
    return {
      controllato: false,
      libero: false,
      motivi: err instanceof AvailabilityError ? [err.message] : [],
      alternative: [],
    };
  }
}

/**
 * Gli orari che ci stanno: prima nello stesso giorno, poi nei giorni dopo.
 *
 * L'ordine non è un dettaglio. Chi chiama per stasera vuole stasera: proporgli
 * venerdì prossimo quando alle 21:30 c'era posto è il modo di perdere un
 * coperto che c'era.
 */
async function alternativeVicine(
  venueId: string,
  dati: { persone: number; quando: Date },
  durataMin: number,
  fuso: string,
  adesso: Date,
): Promise<AlternativaTelefono[]> {
  const data = zonedCalendarDate(dati.quando, fuso);

  const giorno = await getDayAvailability(venueId, data, dati.persone, {
    durationMin: durataMin,
    now: adesso,
    canale: "pubblico",
  });

  const liberi = giorno.shifts
    .flatMap((s) => s.slots)
    .filter((s) => s.available)
    .map((s) => ({ quando: s.startsAt, ora: s.label, distanza: distanza(s.startsAt, dati.quando) }))
    /* Vicino all'ora chiesta, non all'inizio del turno: chi ha chiesto le nove
       preferisce le nove e mezza alle sette. */
    .sort((a, b) => a.distanza - b.distanza)
    .slice(0, MAX_ALTERNATIVE_VOCE)
    .map(({ quando, ora }) => ({ quando, ora }));

  if (liberi.length > 0) return liberi;

  const altriGiorni = await prossimiGiorniLiberi(venueId, data, dati.persone, {
    durationMin: durataMin,
    now: adesso,
    canale: "pubblico",
    limite: MAX_ALTERNATIVE_VOCE,
  });

  return altriGiorni.map((g) => ({
    quando: g.primoOrario.startsAt,
    ora: g.primoOrario.label,
    giorno: g.label,
  }));
}

function distanza(iso: string, chiesto: Date): number {
  return Math.abs(new Date(iso).getTime() - chiesto.getTime());
}
