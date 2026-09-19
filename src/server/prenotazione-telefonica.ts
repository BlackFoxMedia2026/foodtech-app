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

/**
 * Il nome detto a voce, diviso come lo vuole la scheda dell'ospite.
 *
 * Una persona al telefono dice «Laura» o «Laura Bianchi», non due campi. Si
 * divide al primo spazio e il resto è cognome: «Anna Maria Rossi» diventa
 * Anna + «Maria Rossi», che è meno sbagliato del contrario e comunque
 * correggibile a mano.
 *
 * `null` quando non c'è niente di utile: un nome vuoto scriverebbe una scheda
 * senza nome, che è peggio del segnaposto — quella non si trova più cercando.
 */
export function dividiNomeParlato(
  detto: string | null | undefined,
): { firstName: string; lastName: string | null } | null {
  const pulito = (detto ?? "").replace(/\s+/g, " ").trim();
  if (!pulito) return null;
  const spazio = pulito.indexOf(" ");
  if (spazio < 0) return { firstName: pulito.slice(0, 80), lastName: null };
  return {
    firstName: pulito.slice(0, spazio).slice(0, 80),
    lastName: pulito.slice(spazio + 1).slice(0, 80),
  };
}

/** I nomi che mettiamo noi quando non ne abbiamo uno vero. */
const NOMI_SEGNAPOSTO = ["Da richiamare", "Prenotazione telefonica"];

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
    /**
     * Il nome su cui mettere il tavolo, quando chi ha risposto l'ha chiesto.
     *
     * Il risponditore a tasti non può chiederlo — un nome non si digita — e
     * per quello la prenotazione telefonica nasceva intestata a «Da
     * richiamare». La voce che capisce **lo chiede e lo capisce**, quindi
     * quando arriva si usa: il ristoratore legge un nome invece di un
     * segnaposto, e la scheda dell'ospite nasce già giusta.
     */
    nome?: string | null;
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

  const detto = dividiNomeParlato(dati.nome);

  /*
    Se l'ospite c'è già e si chiama ancora come l'avevamo chiamato noi, e
    adesso un nome vero è arrivato, si scrive.

    **Solo sopra un segnaposto nostro.** Sovrascrivere un nome vero con quello
    capito da una voce al telefono sarebbe peggio del problema: «Bianchi»
    diventa «Bianche» e la scheda di un cliente abituale si rovina. Qui invece
    si sostituisce «Da richiamare», che non è il nome di nessuno.
  */
  if (ospiteEsistente && detto && NOMI_SEGNAPOSTO.includes(ospiteEsistente.firstName)) {
    await db.guest.update({
      where: { id: ospiteEsistente.id },
      data: { firstName: detto.firstName, lastName: detto.lastName },
    });
  }

  const creata = await createBooking(
    venueId,
    {
      ...(ospiteEsistente
        ? { guestId: ospiteEsistente.id }
        : {
            /* Il nome, quando qualcuno l'ha chiesto. Il risponditore a tasti
               non può — un nome non si digita — e allora resta il segnaposto:
               la prenotazione esiste, e chi richiama scrive il nome vero
               parlando con la persona. */
            guest: {
              firstName:
                detto?.firstName ??
                (dati.phone ? "Da richiamare" : "Prenotazione telefonica"),
              lastName: detto?.lastName ?? null,
              phone: dati.phone ?? null,
            },
          }),
      partySize: dati.persone,
      startsAt: dati.quando,
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
        `VOICE` e non `PHONE`, e la differenza non è un'etichetta.

        `PHONE` in Tavolo significa da sempre «l'ha presa una persona dello
        staff al telefono», e per questo si autoconferma: chi l'ha scritta ha
        parlato col cliente. Questa l'ha raccolta una macchina, a tasti, da
        qualcuno che non ha parlato con nessuno — e sono le stesse tre cifre
        che il ristoratore vuole vedere separate a fine mese, quando chiede
        «quante me le prende il risponditore?».

        La fonte passa da qui e non dai dati: `BookingInput` non accetta
        `VOICE`, così nessuna richiesta può dichiararsi raccolta da una
        macchina — né una raccolta da una macchina può dichiararsi presa da
        una persona.
      */
      source: "VOICE",
      /*
        Da confermare, detto **due volte**, e non è una ripetizione inutile.

        Da quando la fonte è `VOICE`, `determineBookingStatus` la lascia già
        «da confermare» da sé: la regola sta nella fonte, dov'è giusto che
        stia. Questa riga resta perché è quella che **non dipende** da
        quell'elenco: il giorno che qualcuno aggiungesse `VOICE` fra le fonti
        che si autoconfermano, una prenotazione raccolta a tasti diventerebbe
        un tavolo tenuto per certo, e nessun test lo racconterebbe meglio di
        questa riga.

        Lo `status` dentro i **dati** invece viene ignorato di proposito: se si
        accettasse dal corpo di una richiesta, una prenotazione dal widget
        pubblico potrebbe dichiararsi confermata da sola. Il primo tentativo
        passava `status: "PENDING"` fra i dati e otteneva una prenotazione
        **confermata**: un campo ignorato in silenzio è una trappola, e ci sono
        cascato.
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
    /* Il nome che torna è quello **dopo** l'aggiornamento: se fosse quello
       letto prima, il centralino si sentirebbe rispondere «Da richiamare»
       subito dopo aver scritto «Laura». */
    ospite: ospiteEsistente
      ? {
          id: ospiteEsistente.id,
          nome: nomeLeggibile(
            detto && NOMI_SEGNAPOSTO.includes(ospiteEsistente.firstName)
              ? detto
              : { firstName: ospiteEsistente.firstName, lastName: ospiteEsistente.lastName },
          ),
        }
      : null,
  };
}

/** Nome e cognome come si leggono in una riga. */
function nomeLeggibile(p: { firstName: string; lastName: string | null }): string {
  return `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`;
}
