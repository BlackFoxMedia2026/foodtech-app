import { db } from "@/lib/db";
import {
  canaleTelefonoPerLocale,
  enqueueMessage,
  registraNonMandato,
} from "@/server/messaging/send";

/**
 * Il messaggio a chi ha prenotato al telefono, quando la sala conferma.
 *
 * ## Perché un messaggio sul telefono e non una mail
 *
 * Perché di chi chiama sappiamo **il numero**, non l'indirizzo. Chiederglielo
 * a voce vorrebbe dire far dettare una mail al telefono, che si sbaglia una
 * volta su tre — e una conferma mandata a un indirizzo sbagliato è peggio di
 * nessuna conferma: il cliente aspetta qualcosa che non arriverà.
 *
 * ## Perché parte alla conferma e non alla prenotazione
 *
 * Perché la prenotazione presa da una voce nasce **da confermare**: quella
 * sera il locale può aprire per una comunione o tenere due tavoli per un
 * cliente che si annuncia sempre all'ultimo. Mandare «è confermata» quando
 * nessuno l'ha confermata è la promessa che il ristorante non ha fatto — e la
 * mantiene comunque, tenendo un tavolo che non voleva dare.
 *
 * ## WhatsApp quando ci sarà, un SMS da subito
 *
 * WhatsApp costa meno e si legge di più, ma vuole un account WhatsApp Business
 * e un **modello approvato da Meta** per ogni tipo di messaggio: fuori dalle
 * ventiquattr'ore da un messaggio del cliente, un testo libero non si può
 * mandare, ed è una regola del canale. Dal 21 settembre 2026 c'è il canale
 * SMS, quindi questa conferma **parte davvero** — e il giorno in cui WhatsApp
 * si accende cambia da sola, perché il canale lo sceglie
 * `canaleTelefonoPerLocale` — che chiede anche il consenso del locale, perché
 * un SMS si paga.
 *
 * Se non c'è nessuno dei due resta una riga `SKIPPED` nel registro col testo
 * che sarebbe partito: nessuno crede che il cliente sia stato avvisato.
 */

/** Il tipo di messaggio: con `bookingId` è anche la chiave anti-doppione. */
export const TIPO_CONFERMA_VOCE = "booking.confirmation_voice";

export type EsitoAvviso =
  | { mandato: true; messageLogId: string }
  | { mandato: false; perche: "non_telefonica" | "senza_numero" | "duplicato" | "senza_canale" | "non_trovata"; messageLogId?: string };

export function testoConferma(dati: {
  locale: string;
  nome: string | null;
  persone: number;
  quando: Date;
  fuso: string;
}): string {
  const quando = new Intl.DateTimeFormat("it-IT", {
    timeZone: dati.fuso,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dati.quando);

  /* Senza nome la frase comincia con la maiuscola: «la sua prenotazione…» con
     la minuscola si legge come un messaggio tagliato a metà — e su WhatsApp
     un messaggio che sembra rotto si legge come un imbroglio. */
  const inizio = dati.nome
    ? `${dati.nome}, la sua prenotazione`
    : "La sua prenotazione";
  return (
    `${inizio} al ${dati.locale} è confermata: ` +
    `${quando}, ${dati.persone} ${dati.persone === 1 ? "persona" : "persone"}. ` +
    `Se qualcosa cambia, ci basta una chiamata.`
  );
}

/**
 * Avvisa chi ha prenotato al telefono che la sala ha confermato.
 *
 * Non solleva mai: un messaggio che non parte non deve impedire a chi gestisce
 * la sala di confermare una prenotazione. L'esito torna a chi chiama, che ne
 * fa quello che serve.
 */
export async function avvisaConfermaWhatsapp(
  venueId: string,
  bookingId: string,
): Promise<EsitoAvviso> {
  const b = await db.booking.findFirst({
    /* Una prenotazione cancellata non manda messaggi: il cliente riceverebbe
       «confermata» per un tavolo che in sala non esiste piu. */
    where: { id: bookingId, venueId, deletedAt: null },
    select: {
      id: true,
      source: true,
      partySize: true,
      startsAt: true,
      guestId: true,
      guest: { select: { firstName: true, lastName: true, phone: true } },
      venue: { select: { name: true, timezone: true, smsAttivi: true } },
    },
  });
  if (!b) return { mandato: false, perche: "non_trovata" };

  /* Solo le prenotazioni nate al telefono da una voce: chi ha prenotato dal
     sito ha già avuto la sua mail, e chi l'ha presa in sala di persona non si
     aspetta un messaggio da noi. */
  if (b.source !== "VOICE") return { mandato: false, perche: "non_telefonica" };

  const numero = b.guest?.phone?.trim();
  if (!numero) return { mandato: false, perche: "senza_numero" };

  const nome = b.guest?.firstName?.trim() || null;
  const testo = testoConferma({
    locale: b.venue.name,
    /* Il segnaposto non si usa come nome: «Da richiamare, la sua prenotazione
       è confermata» è un messaggio che si capisce da solo. */
    nome: nome && !["Da richiamare", "Prenotazione telefonica"].includes(nome) ? nome : null,
    persone: b.partySize,
    quando: b.startsAt,
    fuso: b.venue.timezone,
  });

  /*
    Il canale lo decide `canaleTelefonoPerLocale`: WhatsApp quando ci sarà, un SMS
    finché non c'è. Arriva sullo stesso telefono, e nel registro c'è scritto
    quale dei due è partito — non «WhatsApp» per un SMS.

    Quando non c'è nessuno dei due si sceglie `WHATSAPP` per la traccia: è il
    canale che quel messaggio **vorrebbe**, e la riga `SKIPPED` dice al locale
    cosa manca per accenderlo.
  */
  const canale = canaleTelefonoPerLocale(b.venue.smsAttivi) ?? ("WHATSAPP" as const);

  const messaggio = {
    venueId,
    channel: canale,
    to: numero,
    body: testo,
    guestId: b.guestId,
    bookingId: b.id,
    kind: TIPO_CONFERMA_VOCE,
    venueName: b.venue.name,
  };

  const esito = await enqueueMessage(messaggio);
  if (esito.queued) return { mandato: true, messageLogId: esito.messageLogId };

  if (esito.reason === "duplicate") return { mandato: false, perche: "duplicato" };

  /* Nessun canale — oggi il caso normale. Resta la riga col testo che sarebbe
     partito, così il locale vede cosa aspetta il cliente e cosa no. */
  const traccia = await registraNonMandato(messaggio, esito.detail ?? esito.reason);
  return { mandato: false, perche: "senza_canale", messageLogId: traccia.messageLogId };
}
