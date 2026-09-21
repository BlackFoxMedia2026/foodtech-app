import { db } from "@/lib/db";
import { segnaEventoChiamata } from "@/server/chiamate";
import {
  ESITI_A_MANO,
  esitoDerivato,
  NOME_ESITO,
  type EsitoAMano,
  type EsitoChiamata,
} from "@/lib/voice-esiti";

/**
 * Chiudere una telefonata: dire com'è finita.
 *
 * ## Il buco che questo chiude
 *
 * Una chiamata a cui qualcuno ha risposto restava nello storico come «risposta
 * · 2m 14s». Cioè: si sapeva che era squillata e che qualcuno aveva parlato, e
 * non si sapeva **niente** di cosa fosse successo. A fine mese il locale non
 * poteva dire quante telefonate diventano prenotazioni, che è la sola domanda
 * per cui uno guarda lo storico del telefono.
 *
 * ## Quello che non si fa qui
 *
 * Non si obbliga nessuno. La chiamata senza esito resta senza esito — «non si
 * sa» è un'informazione vera, e un modulo obbligatorio alla fine di ogni
 * telefonata, in un locale pieno, si compila a caso: si prenderebbe il valore
 * più veloce da premere e il conto di fine mese sarebbe peggio di nessun
 * conto.
 *
 * Non si sovrascrive un esito **derivato**: se da quella chiamata è nata una
 * prenotazione, «niente da fare» è una dichiarazione che contraddice una riga
 * del database. Un esito scritto a mano invece si corregge, perché chi l'ha
 * scritto può essersi sbagliato.
 */

export class EsitoNonModificabileError extends Error {
  constructor(public readonly esito: EsitoChiamata) {
    super(`esito_derivato:${esito}`);
    this.name = "EsitoNonModificabileError";
  }

  /** La frase da leggere, che dice **perché** e non «operazione non consentita». */
  get spiegazione(): string {
    return `Questa chiamata è già chiusa da un fatto: ${NOME_ESITO[this.esito].toLowerCase()}. Un esito scritto a mano non può contraddirlo.`;
  }
}

export function esitoAMano(valore: string): valore is EsitoAMano {
  return (ESITI_A_MANO as readonly string[]).includes(valore);
}

/**
 * Dice com'è finita una chiamata.
 *
 * `nota` è facoltativa e **non cancella** quella che c'era: chi chiude una
 * chiamata senza scrivere niente non sta dicendo «togli la nota di prima».
 */
export async function impostaEsito(
  venueId: string,
  callId: string,
  esito: EsitoAMano,
  opzioni: { nota?: string | null; attore?: string | null } = {},
): Promise<{ id: string; esito: EsitoChiamata }> {
  const chiamata = await db.phoneCall.findFirst({
    where: { id: callId, venueId },
    select: { id: true, outcome: true },
  });
  if (!chiamata) throw new Error("not_found");

  if (chiamata.outcome && esitoDerivato(chiamata.outcome as EsitoChiamata)) {
    throw new EsitoNonModificabileError(chiamata.outcome as EsitoChiamata);
  }

  const nota = opzioni.nota?.trim();
  await db.phoneCall.update({
    where: { id: chiamata.id },
    data: {
      outcome: esito,
      /* Chi risponde a mano è una persona: se l'esito lo scrive qualcuno da
         una schermata, quella chiamata l'ha gestita una persona. Il
         risponditore automatico scriverà il suo `handler` da sé. */
      handler: "HUMAN",
      ...(nota ? { notes: nota.slice(0, 1000) } : {}),
    },
  });

  await segnaEventoChiamata(chiamata.id, "OUTCOME_SET", {
    actor: opzioni.attore ?? null,
    meta: { esito, ...(nota ? { nota } : {}) },
  });

  return { id: chiamata.id, esito };
}

/**
 * Gli esiti che **hanno prodotto qualcosa**.
 *
 * Sono i soli che un fatto successivo non sovrascrive: una volta che da quella
 * telefonata è nata una prenotazione, la telefonata è riuscita e resta
 * riuscita. Tutto il resto cede al fatto.
 */
const ESITI_RIUSCITI: readonly EsitoChiamata[] = [
  "BOOKING_CREATED",
  "BOOKING_UPDATED",
  "WAITLIST_ADDED",
];

/**
 * Scrive un esito **derivato**, dal codice che conosce il fatto.
 *
 * ## L'ordine di precedenza, e perché non è «il primo che arriva»
 *
 * Il caso che lo decide è quello che capita ogni giorno: qualcuno chiama, non
 * trova nessuno — esito «nessuno ha risposto» — e chi arriva in servizio lo
 * richiama e prende la prenotazione dalla stessa riga. Se il primo esito
 * restasse, nello storico ci sarebbe una chiamata «persa» con una
 * prenotazione attaccata: due cose che si contraddicono nella stessa riga, e
 * a fine mese quella telefonata risulterebbe fra le occasioni buttate.
 *
 * Quindi: **un fatto sovrascrive**, tranne quando quello che c'è ha già
 * prodotto una prenotazione o un posto in coda. Quello non si declassa.
 */
export async function esitoDalFatto(
  callId: string,
  esito: EsitoChiamata,
): Promise<void> {
  await db.phoneCall
    .updateMany({
      where: {
        id: callId,
        OR: [{ outcome: null }, { outcome: { notIn: [...ESITI_RIUSCITI] } }],
      },
      data: { outcome: esito },
    })
    .catch(() => {
      /* Un esito non scritto non deve far fallire l'operazione che lo ha
         prodotto: una prenotazione creata e non etichettata è molto meglio di
         una prenotazione non creata. */
    });
}
