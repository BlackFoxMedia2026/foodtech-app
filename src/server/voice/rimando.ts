import { db } from "@/lib/db";

/**
 * Rimandare la chiamata al locale, e non farla girare per sempre.
 *
 * ## Il ciclo, e perche nasce da due cose giuste
 *
 * Il ristoratore chiede all'operatore la deviazione **su occupato**: mentre e
 * al telefono con un cliente, le altre chiamate arrivano a noi invece di
 * squillare a vuoto. Giusto.
 *
 * Il risponditore, quando non ce la fa — una richiesta che non sa gestire, un
 * gruppo di venticinque persone, qualcuno che chiede di parlare con una
 * persona — **rimanda la chiamata al locale**. Giusto anche questo.
 *
 * Insieme fanno un cerchio: la linea e ancora occupata, quindi l'operatore
 * devia di nuovo a noi, il risponditore risponde di nuovo, rimanda di nuovo. E
 * chi ha chiamato sente lo stesso saluto tre volte e riattacca convinto che il
 * ristorante sia rotto.
 *
 * ## Perche il contatore sta nel database e non in Asterisk
 *
 * Perche **il giro passa fuori dal centralino**: ogni passaggio e una chiamata
 * nuova, con un canale nuovo, che arriva dalla rete dell'operatore. Un
 * contatore in memoria non la riconoscerebbe. A riconoscerla resta
 * l'identificativo che la chiamata porta con se, e quello sta su `PhoneCall`.
 *
 * E la difesa e **la riga aggiornata dal database**, non un controllo prima
 * della scrittura: due richieste che arrivano insieme passerebbero entrambe un
 * `if`. Qui la condizione sta dentro l'`UPDATE`, e solo una tocca la riga.
 */

/**
 * Quante volte una chiamata si puo rimandare al locale.
 *
 * Uno. Non zero, perche rimandare e la cosa giusta la prima volta — il
 * personale e la risposta migliore quando c'e. Non due, perche la seconda
 * volta in cui il locale non risponde non e un caso: e un locale occupato, e
 * la persona ha gia sentito il nostro saluto una volta.
 */
export const MAX_RIMANDI = 1;

export type EsitoRimando =
  | { rimanda: true; numero: string }
  /** Non si rimanda, e il motivo va detto al centralino: decide lui cosa fare. */
  | { rimanda: false; motivo: "chiamata_sconosciuta" | "gia_rimandata" | "nessun_numero" };

/**
 * Il centralino chiede: «questa la rimando al locale?»
 *
 * Risponde **e conta**: chiedere consuma il permesso. Chiamarla per sapere
 * senza rimandare sarebbe un uso sbagliato — ma e il verso giusto in cui
 * sbagliare, perche l'alternativa (contare solo dopo il rimando riuscito)
 * lascia il cerchio aperto ogni volta che il rimando fallisce a meta.
 */
export async function chiediRimando(venueId: string, externalId: string): Promise<EsitoRimando> {
  const chiamata = await db.phoneCall.findFirst({
    where: { venueId, externalId },
    select: { id: true },
  });
  if (!chiamata) return { rimanda: false, motivo: "chiamata_sconosciuta" };

  const conf = await db.voiceConfiguration.findUnique({
    where: { venueId },
    select: { numeroPubblico: true, numeroInoltro: true },
  });

  /* A quale numero. `numeroInoltro` quando c'e — e il numero scelto per i
     rimandi — altrimenti quello pubblico del locale, che e dove sta chi
     risponde. Se non c'e nessuno dei due non si inventa: si dice che non c'e,
     e il risponditore offre la richiamata invece di mandare la chiamata nel
     vuoto. */
  const numero = conf?.numeroInoltro ?? conf?.numeroPubblico ?? null;
  if (!numero) return { rimanda: false, motivo: "nessun_numero" };

  const esito = await db.phoneCall.updateMany({
    where: { id: chiamata.id, rimandi: { lt: MAX_RIMANDI } },
    data: { rimandi: { increment: 1 } },
  });
  if (esito.count === 0) return { rimanda: false, motivo: "gia_rimandata" };

  return { rimanda: true, numero };
}
