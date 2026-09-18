import { db } from "@/lib/db";
import { normalizzaE164 } from "@/lib/telefono";
import { segnaEventoChiamata } from "@/server/chiamate";
import { esitoDalFatto } from "@/server/voice/esiti";

/**
 * Lega una prenotazione alla telefonata da cui è nata.
 *
 * ## Il giro che senza questo non si chiudeva
 *
 * Qualcuno chiama e non trova nessuno. Chi arriva in servizio apre il
 * telefono, vede la chiamata persa, preme «Prenota» e prende la prenotazione.
 * Fino a ieri quella prenotazione nasceva **senza nessun legame** con la
 * telefonata: la chiamata restava «nessuno ha risposto» per sempre, restava
 * nel conto delle occasioni buttate, e la richiamata in coda continuava a
 * chiedere di telefonare a una persona che aveva già il tavolo.
 *
 * Tre scritture, e nessuna è un dettaglio:
 *
 * 1. la chiamata porta la prenotazione (`bookingId`), quindi nello storico
 *    diventa una telefonata **riuscita**;
 * 2. l'esito lo scrive il fatto, non una persona;
 * 3. la richiamata aperta per quel numero si chiude: una coda che non si
 *    spegne quando il lavoro è fatto si impara a ignorare, e allora smette di
 *    servire anche quando avrebbe ragione.
 *
 * Fuori transazione di proposito: se una di queste tre fallisce, la
 * prenotazione resta. Una prenotazione senza il suo legame è molto meglio di
 * nessuna prenotazione.
 */
export async function collegaPrenotazioneAChiamata(
  venueId: string,
  callId: string,
  prenotazione: { id: string; reference: string },
  attore?: string | null,
): Promise<void> {
  const chiamata = await db.phoneCall.findFirst({
    where: { id: callId, venueId },
    select: { id: true, bookingId: true, fromNumber: true },
  });
  /* Silenzio e non errore: la prenotazione è già stata creata, e farla
     fallire adesso perché l'identificativo della chiamata non torna sarebbe
     il peggiore dei due esiti. */
  if (!chiamata) return;
  /* Già legata a un'altra prenotazione: la prima resta. Una telefonata
     produce una prenotazione, e riscrivere il legame cancellerebbe la storia
     di quella di prima. */
  if (chiamata.bookingId) return;

  await db.phoneCall
    .update({
      where: { id: chiamata.id },
      data: { bookingId: prenotazione.id, handler: "HUMAN" },
    })
    .catch(() => {});

  await esitoDalFatto(chiamata.id, "BOOKING_CREATED");

  await segnaEventoChiamata(chiamata.id, "BOOKING_CREATED", {
    actor: attore ?? null,
    meta: { bookingId: prenotazione.id, reference: prenotazione.reference },
  });

  /* La coda si spegne da sé.

     Si chiudono per **numero** e non solo per chiamata: la richiamata può
     essere stata aperta da un'altra telefonata della stessa persona, e chi ha
     preso la prenotazione non deve andare a cercare quale. */
  /* Normalizzato, non come l'ha mandato il centralino: in coda i numeri si
     scrivono in forma `+39…`, e confrontare «3471234567» con «+393471234567»
     non troverebbe mai niente — la coda resterebbe accesa senza che nessuno
     capisca perché. */
  const inCoda = normalizzaE164(chiamata.fromNumber);
  if (inCoda) {
    await db.voiceCallback
      .updateMany({
        where: {
          venueId,
          stato: "OPEN",
          OR: [{ callId: chiamata.id }, { numero: inCoda }],
        },
        data: {
          stato: "DONE",
          chiusoIl: new Date(),
          chiusoDa: attore ?? null,
          nota: `Prenotazione ${prenotazione.reference}`,
        },
      })
      .catch(() => {});
  }
}
