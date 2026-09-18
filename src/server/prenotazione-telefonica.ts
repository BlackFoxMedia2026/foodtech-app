import { db } from "@/lib/db";
import { AvailabilityError, checkAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { durataConsigliata } from "@/server/durata-consigliata";
import { riconosciChiamante } from "@/server/telefonia";
import { segnaEventoChiamata } from "@/server/chiamate";
import { esitoDalFatto } from "@/server/voice/esiti";

/**
 * La prenotazione presa al telefono che diventa una prenotazione vera.
 *
 * Il risponditore del centralino raccoglie tre cose a tasti — quante persone,
 * che giorno, che ora — e le manda qui. Da qui entra in Tavolo come una
 * prenotazione normale: compare in Prenotazioni, nel Servizio, nella sala.
 *
 * ## Arriva **da confermare**, non confermata
 *
 * L'ha presa una macchina, a tasti, da qualcuno che non ha parlato con
 * nessuno. Chi decide è il locale: il numero c'è, si richiama, si conferma.
 * Segnarla confermata vorrebbe dire dare per buono un tavolo prenotato da una
 * sequenza di tasti — e la prima volta che uno sbaglia un tasto il ristorante
 * tiene un tavolo vuoto un sabato sera.
 *
 * ## Se non ci sta, si prende comunque
 *
 * Fuori orario, turno pieno, troppo in là: la prenotazione **si crea
 * ugualmente**, con il motivo scritto nelle note interne. Rifiutarla
 * vorrebbe dire perdere una persona che ha già telefonato, e che a quel punto
 * chiama il ristorante di fianco. Il locale la vede, legge perché non torna, e
 * richiama per spostarla.
 *
 * Il contrario — un controllo che rifiuta — sposta la decisione su una
 * macchina che non sa che quella sera si apre per una comunione.
 *
 * ## Due volte la stessa non fanno due prenotazioni
 *
 * Il centralino può rimandare la stessa notizia se non ha ricevuto la nostra
 * risposta. La chiave dell'idempotenza è la sua, e sta su un indice unico: la
 * seconda richiesta ritrova la prima invece di creare un doppione, e lo scopre
 * dal database — non da un controllo che due richieste in parallelo si
 * scambierebbero senza vedersi.
 */

export type EsitoPrenotazioneTelefonica = {
  id: string;
  reference: string;
  /** `true` quando questa richiesta ha ritrovato una prenotazione già creata. */
  giaEsistente: boolean;
  /** Perché richiede attenzione, quando la richiede. Vuoto se tutto torna. */
  avvertimenti: string[];
  /** L'ospite a cui è stata attribuita, se riconosciuto dal numero. */
  ospite: { id: string; nome: string } | null;
};

/** Come si chiama la chiave dell'idempotenza: il prefisso dice da dove viene. */
function chiaveTentativo(idCentralino: string): string {
  return `centralino:${idCentralino}`;
}

export async function registraPrenotazioneTelefonica(
  venueId: string,
  dati: {
    /** L'identificativo della prenotazione **nel centralino**. */
    idCentralino: string;
    /** L'identificativo della chiamata da cui nasce, per collegarle. */
    idChiamata?: string | null;
    phone?: string | null;
    persone: number;
    quando: Date;
    nota?: string | null;
  },
  adesso: Date = new Date(),
): Promise<EsitoPrenotazioneTelefonica> {
  const chiave = chiaveTentativo(dati.idCentralino);

  /* Prima si guarda se c'è già: costa una lettura su un indice unico, e
     risparmia tutto il resto quando il centralino sta solo ritentando. */
  const gia = await db.booking.findUnique({
    where: { idempotencyKey: chiave },
    select: {
      id: true,
      reference: true,
      venueId: true,
      guest: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (gia) {
    /* Stessa chiave, altro locale: non può succedere con token per locale, ma
       se succedesse sarebbe un dato di un cliente restituito a un altro. Si
       tace e si finge che non esista. */
    if (gia.venueId !== venueId) throw new Error("not_found");
    return {
      id: gia.id,
      reference: gia.reference,
      giaEsistente: true,
      avvertimenti: [],
      ospite: gia.guest
        ? {
            id: gia.guest.id,
            nome: `${gia.guest.firstName}${gia.guest.lastName ? ` ${gia.guest.lastName}` : ""}`,
          }
        : null,
    };
  }

  /* Chi è: si riusa il riconoscimento del chiamante, che sa già confrontare i
     numeri come li scrivono le persone. Se lo si rifacesse qui a modo proprio,
     la stessa persona sarebbe riconosciuta al telefono e non riconosciuta
     nella prenotazione che nasce da quella telefonata. */
  const riconosciuto = dati.phone
    ? await riconosciChiamante(venueId, dati.phone, adesso)
    : null;
  const ospiteEsistente = riconosciuto?.guest ?? null;

  /* Perché richiede attenzione. Si **guarda** la disponibilità ma non si
     rifiuta: il motivo finisce nelle note interne, dove il locale lo legge
     insieme alla prenotazione. */
  const avvertimenti: string[] = [];
  try {
    /* La durata: quella che il locale misura per un gruppo così, a quell'ora.
       Serve al controllo — è la durata che decide se ci sta — e la stessa la
       calcolerà `createBooking`. */
    const { durataMin } = await durataConsigliata(venueId, {
      partySize: dati.persone,
      startsAt: dati.quando,
    });
    /* Due canali per due domande diverse, e il primo tentativo li aveva
       confusi.

       Il controllo usa **`pubblico`**, cioè le regole severe: la domanda è
       «un cliente avrebbe potuto prenotare così?», e la risposta serve a
       *raccontarlo* al locale. Con `interno` non tornava nessun avvertimento
       nemmeno per quaranta persone alle quattro del mattino — giusto, perché
       quel canale salta le regole per chi risponde al telefono alle 20:40, e
       sbagliato come strumento di misura.

       La **scrittura** invece resta `interno` e senza controllo: il locale
       decide, e una prenotazione persa è peggio di una da guardare. */
    const esito = await checkAvailability(venueId, {
      startsAt: dati.quando,
      partySize: dati.persone,
      durationMin: durataMin,
      tableId: null,
      canale: "pubblico",
      now: adesso,
    });
    if (!esito.available) {
      for (const p of esito.issues) avvertimenti.push(p.message);
    }
  } catch (err) {
    /* Un guasto nel controllo non deve far perdere la prenotazione: si
       registra che non si è potuto controllare, e si va avanti. */
    avvertimenti.push(
      err instanceof AvailabilityError
        ? err.message
        : "Non è stato possibile controllare la disponibilità.",
    );
  }

  const noteInterne = [
    "Presa dal risponditore telefonico: da confermare richiamando.",
    ...(dati.nota ? [dati.nota] : []),
    ...(avvertimenti.length > 0
      ? [`Da guardare: ${avvertimenti.join(" ")}`]
      : []),
  ].join("\n");

  const creata = await createBooking(
    venueId,
    {
      ...(ospiteEsistente
        ? { guestId: ospiteEsistente.id }
        : {
            /* Senza nome non si può creare una scheda, e il risponditore non
               chiede il nome — chiederlo a tasti non si può. Si usa il numero
               come nome provvisorio, così la prenotazione esiste e chi
               richiama scrive il nome vero parlando con la persona. */
            guest: {
              firstName: dati.phone
                ? "Da richiamare"
                : "Prenotazione telefonica",
              lastName: null,
              phone: dati.phone ?? null,
            },
          }),
      partySize: dati.persone,
      startsAt: dati.quando,
      source: "PHONE",
      internalNotes: noteInterne,
    },
    {
      /* Il controllo si è già fatto sopra, per **raccontarlo**: rifarlo qui
         farebbe sollevare e perdere la prenotazione, che è esattamente quello
         che non si vuole. */
      skipAvailabilityCheck: true,
      canale: "interno",
      idempotencyKey: chiave,
      /*
        Da confermare, e lo stato va imposto **da qui**.

        `source: "PHONE"` in Tavolo significa da sempre «l'ha presa una
        persona dello staff al telefono», e per questo si autoconferma: chi
        l'ha scritta ha parlato con il cliente. Una macchina che raccoglie
        tasti non è la stessa cosa, e lo `status` dentro i dati della
        prenotazione viene **ignorato di proposito** — se si accettasse dal
        corpo di una richiesta, una prenotazione dal widget pubblico potrebbe
        dichiararsi confermata da sola. La porta giusta è questa, che si
        raggiunge solo da codice server.

        Il primo tentativo passava `status: "PENDING"` fra i dati e otteneva
        una prenotazione **confermata**: un campo che viene ignorato in
        silenzio è una trappola, e ci sono cascato.
      */
      status: "PENDING",
    },
  );

  /* Si lega alla chiamata da cui nasce: nello storico del telefono quella
     chiamata smette di essere «nessuno ha risposto» e diventa una chiamata
     riuscita. Fuori transazione di proposito — se questo fallisce, la
     prenotazione resta, e una prenotazione senza il collegamento è molto
     meglio di nessuna prenotazione. */
  if (dati.idChiamata) {
    const collegata = await db.phoneCall
      .findUnique({
        where: {
          venueId_externalId: { venueId, externalId: dati.idChiamata },
        },
        select: { id: true },
      })
      .catch(() => null);

    if (collegata) {
      await db.phoneCall
        .update({
          where: { id: collegata.id },
          data: { bookingId: creata.id },
        })
        .catch(() => {});
      /* L'esito lo scrive il fatto, non chi risponde: da questa telefonata è
         nata una prenotazione, e nello storico quella riga smette di essere
         «nessuno ha risposto». È il caso di ogni giorno — una chiamata persa
         richiamata dopo — e senza questo resterebbe una chiamata «persa» con
         una prenotazione attaccata. */
      await esitoDalFatto(collegata.id, "BOOKING_CREATED");
      await segnaEventoChiamata(collegata.id, "BOOKING_CREATED", {
        /* «centralino» e non una persona: questa prenotazione l'ha raccolta
           il risponditore a tasti, e il registro della chiamata deve dirlo —
           è la differenza fra una prenotazione da confermare e una presa da
           chi ha parlato col cliente. `handler` invece non si tocca: nessuno
           ha risposto a quella telefonata, e scrivere «una persona» sarebbe
           falso. */
        actor: "centralino",
        meta: { bookingId: creata.id, reference: creata.reference },
      });
    }
  }

  return {
    id: creata.id,
    reference: creata.reference,
    giaEsistente: false,
    avvertimenti,
    ospite: ospiteEsistente
      ? {
          id: ospiteEsistente.id,
          nome: `${ospiteEsistente.firstName}${ospiteEsistente.lastName ? ` ${ospiteEsistente.lastName}` : ""}`,
        }
      : null,
  };
}
