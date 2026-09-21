import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { deriveTableLiveStatus } from "@/lib/table-status";
import { dateKeyInVenue, oraInVenue } from "@/lib/venue-time";
import { proponiTavoli, type Proposta, type TavoloCandidato } from "@/lib/suggerimento-tavolo";
import type { AuditActor } from "@/server/audit";
import {
  assignBookingToTable,
  BookingAssignError,
  combineTablesForBooking,
} from "@/server/booking-floor";
import { updateBooking } from "@/server/bookings";
import { durataConsigliata } from "@/server/durata-consigliata";
import { seatWalkIn, type WalkInInputType } from "@/server/walk-in";
import {
  ospiteDaAccomodare,
  ospitiDaAccomodare,
  type OspiteDaAccomodare,
} from "./da-accomodare";
import { servizioCorrente, tavoliAssegnatiA } from "./sala";

/**
 * **Accomodare qualcuno, dal telefono.**
 *
 * ## I due percorsi, e perché sono lo stesso codice
 *
 * In sala si lavora in due modi, e nella stessa serata:
 *
 * 1. **si parte dall'ospite** — arriva Rossi, si cerca un tavolo da quattro;
 * 2. **si parte dal tavolo** — il sei è appena stato sparecchiato, chi ci
 *    metto?
 *
 * Sono due schermate e **una** scrittura: `accomoda()`. Se fossero due
 * funzioni, fra un mese una delle due dimenticherebbe di aggiornare i coperti
 * o di registrare l'ora — e sarebbe quella usata meno, cioè quella di cui
 * nessuno si accorge che è rotta.
 *
 * ## Cosa succede quando si conferma, tutto insieme
 *
 * Il §5 del brief chiede dieci cose. Otto le fa già l'impianto che c'è, e
 * questo modulo si limita a chiamarlo nell'ordine giusto:
 *
 * - **il tavolo si assegna** con `assignBookingToTable` (o
 *   `combineTablesForBooking` per una tavolata), che è la stessa strada della
 *   piantina del back office: transazione serializzabile, conflitto rilevato,
 *   posti verificati. Passare da `db.booking.update` avrebbe voluto dire
 *   perdere quei controlli e poter sedere due tavolate sullo stesso tavolo;
 * - **lo stato passa a `SEATED`** con `updateBooking`, che scrive `seatedAt`
 *   (l'ora effettiva dell'accomodamento) e riallinea le statistiche
 *   dell'ospite;
 * - **il tavolo diventa occupato** senza che nessuno lo scriva: lo stato del
 *   tavolo è derivato dalle prenotazioni che gli stanno sopra
 *   (`lib/table-status.ts`), quindi cambia nello stesso istante;
 * - **la disponibilità della sala** cambia per lo stesso motivo: il motore
 *   legge le prenotazioni, non una colonna;
 * - **il contesto per le comande** esiste da subito: `contoDelTavolo` cerca la
 *   prenotazione seduta su quel tavolo, e adesso la trova;
 * - **i coperti** sono quelli della prenotazione, che è il posto dove già
 *   stavano.
 *
 * La differenza rispetto a prima non è nessuna di queste: è che **erano dieci
 * gesti** e adesso sono un pulsante.
 *
 * ## Perché non c'è un'entità `Seating`
 *
 * Il brief ne propone una (`reservationId`, `tableIds[]`, `seatedAt`,
 * `releasedAt`, `assignedBy`). Oggi quei fatti stanno su `Booking` —
 * `tableId`, `combinedTableIds`, `seatedAt`, `closedAt` — e li leggono trenta
 * moduli: la sala viva, il motore di disponibilità, la rotazione, il profilo
 * del tavolo, il conto. Una tabella accanto sarebbe **una seconda fonte** per
 * «chi è a quel tavolo adesso», e la prima volta che una delle due non viene
 * aggiornata il prodotto dice due cose diverse dello stesso tavolo.
 *
 * Quello che l'entità darebbe in più — la storia di chi ha accomodato e dei
 * cambi tavolo — si ottiene senza: `assignBookingToTable` registra già
 * l'assegnazione nel registro di audit, e qui si aggiunge un `BookingEvent`
 * per l'accomodamento. Il giorno in cui servirà davvero una seduta separata
 * dalla prenotazione — due sedute nella stessa serata sullo stesso tavolo, un
 * cambio tavolo di cui conservare entrambe le tratte — si estrae da questi
 * eventi, che a quel punto ci sono già.
 */

/** Cosa proporre a chi ha davanti un ospite arrivato. */
export type ProposteAccoglienza = {
  ospite: OspiteDaAccomodare;
  proposta: Proposta;
};

export class AccoglienzaError extends Error {
  constructor(
    readonly codice: "ospite_non_in_attesa" | "nessun_tavolo",
    message: string,
  ) {
    super(message);
    this.name = "AccoglienzaError";
  }
}

/* -------------------------------------------------------------------------- */
/*  I candidati                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Tutti i tavoli del locale, giudicabili.
 *
 * **Tutti**, anche quelli di altri camerieri, e non è un permesso aggirato: di
 * un tavolo qui non escono né il nome di chi c'è seduto né il suo conto né le
 * sue allergie. Escono la misura, la forma e uno stato — cioè esattamente
 * quello che un cameriere ottiene girandosi e guardando la sala, ed è il
 * motivo per cui `OpzioniSala.ancheLiberi` esiste già con la stessa
 * giustificazione scritta accanto.
 *
 * ## Perché non passa da `getFloorLive`
 *
 * La fotografia della sala calcola lo stesso stato, e la prima versione di
 * questa funzione la usava. Due ragioni per non farlo:
 *
 * 1. **la prenotazione che si sta accomodando occupa il proprio tavolo.** Un
 *    ospite `ARRIVED` con un tavolo già scritto sopra rende quel tavolo
 *    «in arrivo» — cioè il suggerimento gli negava proprio il tavolo che
 *    qualcuno gli aveva assegnato. Serve una derivazione che **escluda** la
 *    prenotazione in corso di accomodamento, e `getFloorLive` non sa farlo;
 * 2. **costo**: quella fotografia carica anche ospiti, conti, pagamenti e
 *    previsioni di liberazione. Qui non serve niente di tutto questo.
 *
 * Lo stato si deriva con `deriveTableLiveStatus`, **la stessa funzione** che
 * usa la sala: nessun secondo vocabolario, nessun rischio che un tavolo sia
 * «libero» qui e «prenotato» là. Tre letture in tutto, nessuna per tavolo.
 */
async function candidati(
  ctx: { venueId: string; timezone: string; waiterId: string },
  opts: {
    adesso: Date;
    /** La prenotazione che si sta accomodando: i suoi tavoli non sono un conflitto. */
    escludiBookingId?: string;
    tableIdAtteso?: string | null;
  },
): Promise<TavoloCandidato[]> {
  const { adesso } = opts;
  const servizio = await servizioCorrente(ctx.venueId, ctx.timezone, adesso);
  const giorno = dateKeyInVenue(adesso, ctx.timezone);

  const [tavoli, miei, prenotazioni, blocchi] = await Promise.all([
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      orderBy: { label: "asc" },
      select: {
        id: true,
        label: true,
        seats: true,
        combinable: true,
        roomId: true,
        room: { select: { name: true } },
      },
    }),
    tavoliAssegnatiA(ctx.venueId, ctx.waiterId, giorno, servizio),
    /*
      Le prenotazioni di oggi — **tutte**, non solo le future.

      Servono a due cose insieme: derivare lo stato del tavolo adesso (chi è
      seduto, chi sta arrivando, chi ha appena lasciato) e sapere quando su
      quel tavolo arriva il prossimo nome. È il pezzo che il suggerimento
      aggiunge a quello che la sala sapeva già: un tavolo libero alle 20:30
      con un nome sopra alle 21:15 non è un tavolo libero per una cena, e
      nessuna schermata lo diceva a chi stava decidendo dove sedere qualcuno.
    */
    db.booking.findMany({
      where: {
        venueId: ctx.venueId,
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
        startsAt: { gte: startOfDay(adesso), lte: endOfDay(adesso) },
        ...(opts.escludiBookingId ? { id: { not: opts.escludiBookingId } } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: {
        status: true,
        startsAt: true,
        durationMin: true,
        closedAt: true,
        tableId: true,
        combinedTableIds: true,
      },
    }),
    db.tableBlock.findMany({
      where: { venueId: ctx.venueId, startsAt: { lte: adesso }, endsAt: { gte: adesso } },
      select: { tableId: true },
    }),
  ]);

  /*
    Una prenotazione che ha unito due tavoli li occupa entrambi, e va
    indicizzata su tutti — `tableId` più `combinedTableIds`. È lo stesso
    accorgimento che sta in `floor-live.ts`, e senza si offrirebbe come libero
    il secondo tavolo di una tavolata.
  */
  const perTavolo = new Map<string, typeof prenotazioni>();
  for (const b of prenotazioni) {
    for (const id of [b.tableId, ...b.combinedTableIds]) {
      if (!id) continue;
      const lista = perTavolo.get(id);
      if (lista) lista.push(b);
      else perTavolo.set(id, [b]);
    }
  }

  /* Il prossimo nome su ogni tavolo. L'elenco è ordinato per orario, quindi la
     prima futura che si incontra è la più vicina. */
  const prossima = new Map<string, Date>();
  for (const b of prenotazioni) {
    if (b.startsAt <= adesso) continue;
    if (b.status !== "CONFIRMED" && b.status !== "PENDING" && b.status !== "ARRIVED") continue;
    for (const id of [b.tableId, ...b.combinedTableIds]) {
      if (id && !prossima.has(id)) prossima.set(id, b.startsAt);
    }
  }

  const bloccati = new Set(blocchi.map((b) => b.tableId));

  return tavoli.map((t) => {
    const stato = deriveTableLiveStatus({ active: true }, perTavolo.get(t.id) ?? [], adesso, {
      blocked: bloccati.has(t.id),
    });
    const dopo = prossima.get(t.id) ?? null;

    return {
      tableId: t.id,
      label: t.label,
      posti: t.seats,
      roomId: t.roomId,
      roomName: t.room?.name ?? null,
      /*
        **Libero adesso**, che non è la stessa cosa di «libero per tutta la
        sera».

        `PRENOTATO` conta come libero: quel tavolo è vuoto in questo momento e
        ha un nome sopra più tardi. È il caso che il brief chiede di mostrare —
        «T5 · 4 posti · prenotato tra 90 min» — e se ci sta la seduta è un
        tavolo perfettamente usabile. Chi decide se ci sta è il giudizio di
        `proponiTavoli`, che confronta i minuti al prossimo nome con la durata:
        toglierlo qui vorrebbe dire nascondere mezza sala alle nove di sera.

        Restano fuori: `OCCUPATO` e `CONTO` (c'è gente), `IN_ARRIVO` (qualcuno
        sta entrando proprio per quel tavolo), `PULIZIA` (vuoto ma da
        sparecchiare: mandarci quattro persone è peggio che dire «un attimo»,
        e torna disponibile da sé) e `BLOCCATO`.
      */
      libero: stato === "LIBERO" || stato === "PRENOTATO",
      unibile: t.combinable,
      mio: miei.has(t.id),
      atteso: !!opts.tableIdAtteso && t.id === opts.tableIdAtteso,
      minutiAllaProssima: dopo ? Math.round((dopo.getTime() - adesso.getTime()) / 60_000) : null,
      oraProssima: dopo ? oraInVenue(dopo, ctx.timezone) : null,
    } satisfies TavoloCandidato;
  });
}

/**
 * «Dove faccio sedere Rossi?» — il percorso che parte dall'ospite.
 */
export async function propostePerOspite(
  ctx: { venueId: string; timezone: string; waiterId: string },
  bookingId: string,
  adesso = new Date(),
): Promise<ProposteAccoglienza> {
  const ospite = await ospiteDaAccomodare(ctx.venueId, bookingId, ctx.timezone, adesso);
  if (!ospite) {
    throw new AccoglienzaError(
      "ospite_non_in_attesa",
      "Questa prenotazione non è più in attesa: forse l'ha già accomodata un collega.",
    );
  }

  const lista = await candidati(ctx, {
    adesso,
    escludiBookingId: bookingId,
    tableIdAtteso: ospite.tableIdAtteso,
  });

  return {
    ospite,
    proposta: proponiTavoli(lista, {
      coperti: ospite.coperti,
      durataMin: ospite.durataMin,
      roomIdAtteso: ospite.roomIdAtteso,
    }),
  };
}

/**
 * «Chi metto su questo tavolo?» — il percorso che parte dal tavolo.
 *
 * Restituisce la coda **con l'idoneità di quel tavolo per ciascuno**: mettere
 * sei persone su un quattro posti è una forzatura, e chi la fa deve saperlo
 * prima di toccare il nome, non dopo.
 */
export async function ospitiPerTavolo(
  ctx: { venueId: string; timezone: string; waiterId: string },
  tableId: string,
  adesso = new Date(),
): Promise<{ ospiti: (OspiteDaAccomodare & { ciStanno: boolean })[]; posti: number }> {
  const [tavolo, coda] = await Promise.all([
    db.table.findFirst({
      where: { id: tableId, venueId: ctx.venueId },
      select: { seats: true },
    }),
    ospitiDaAccomodare(ctx.venueId, ctx.timezone, adesso),
  ]);

  const posti = tavolo?.seats ?? 0;
  return {
    posti,
    ospiti: coda.map((o) => ({ ...o, ciStanno: o.coperti <= posti })),
  };
}

/* -------------------------------------------------------------------------- */
/*  La scrittura                                                              */
/* -------------------------------------------------------------------------- */

/**
 * **Accomoda.** Un tavolo, o più di uno per una tavolata.
 *
 * L'ordine dei due passi conta: prima il tavolo, poi lo stato. Al contrario,
 * una prenotazione risulterebbe seduta senza tavolo per la frazione di
 * secondo fra le due scritture — e in quella frazione la sala di chiunque
 * altro mostrerebbe una seduta fantasma su nessun tavolo. Se
 * l'assegnazione fallisce (il collega ha appena preso quel tavolo), lo stato
 * non si muove e l'ospite resta in coda, che è la cosa giusta.
 */
export async function accomoda(
  ctx: { venueId: string; timezone: string; waiterId: string },
  opts: {
    bookingId: string;
    /** In ordine: il primo diventa il tavolo principale della seduta. */
    tableIds: string[];
    /** Un motivo scritto, quando i posti non bastano. */
    forceReason?: string | null;
    actor?: AuditActor;
    adesso?: Date;
  },
): Promise<{ bookingId: string; tableId: string; label: string; ospite: string; coperti: number }> {
  const tableIds = [...new Set(opts.tableIds)].filter(Boolean);
  if (tableIds.length === 0) {
    throw new AccoglienzaError("nessun_tavolo", "Scegli un tavolo su cui accomodare.");
  }

  const prenotazione = await db.booking.findFirst({
    where: { id: opts.bookingId, venueId: ctx.venueId, deletedAt: null },
    select: { id: true, status: true, partySize: true },
  });
  if (!prenotazione) {
    throw new AccoglienzaError("ospite_non_in_attesa", "Prenotazione non trovata.");
  }
  if (prenotazione.status === "SEATED") {
    throw new AccoglienzaError(
      "ospite_non_in_attesa",
      "Questa prenotazione è già a tavola: l'ha accomodata un collega.",
    );
  }

  const forzatura = opts.forceReason?.trim();
  const assegnata =
    tableIds.length === 1
      ? await assignBookingToTable(ctx.venueId, opts.bookingId, tableIds[0], {
          force: !!forzatura,
          forceReason: forzatura ?? undefined,
          actor: opts.actor,
        })
      : await combineTablesForBooking(ctx.venueId, opts.bookingId, tableIds, {
          force: !!forzatura,
          forceReason: forzatura ?? undefined,
          actor: opts.actor,
        });

  /*
    Lo stato, e con lui l'ora vera dell'accomodamento (`seatedAt`, scritta da
    `updateBooking`). `skipAvailabilityCheck` perché il tavolo l'ha appena
    verificato l'assegnazione, in transazione: ricontrollarlo qui
    rifiuterebbe di sedere su un tavolo occupato da questa stessa
    prenotazione — è la ragione già scritta in `/api/bookings/[id]/status`.
  */
  await updateBooking(
    ctx.venueId,
    opts.bookingId,
    { status: "SEATED" },
    { skipAvailabilityCheck: true, actor: opts.actor },
  );

  /*
    L'evento sulla prenotazione: è la storia che il brief voleva dall'entità
    `Seating` — chi ha accomodato, dove, quando, in quanti — scritta dove le
    altre tappe di questa prenotazione stanno già.
  */
  await db.bookingEvent.create({
    data: {
      bookingId: opts.bookingId,
      kind: "STATUS_CHANGED",
      message: `Accomodato ai tavoli ${assegnata.table?.label ?? tableIds[0]}`,
      actorId: ctx.waiterId,
      meta: {
        tavoli: tableIds,
        coperti: prenotazione.partySize,
        daTelefono: true,
        ...(forzatura ? { motivoForzatura: forzatura } : {}),
      },
    },
  });

  return {
    bookingId: opts.bookingId,
    tableId: tableIds[0],
    label: assegnata.table?.label ?? "",
    ospite:
      assegnata.guest?.lastName?.trim() ||
      assegnata.guest?.firstName ||
      "L'ospite",
    coperti: prenotazione.partySize,
  };
}

/**
 * **Walk-in**: due persone senza prenotazione, e un tavolo.
 *
 * Non riscrive niente — `seatWalkIn` esisteva per il back office e fa già
 * tutto: crea la prenotazione `WALK_IN` già `SEATED`, passa dal motore di
 * disponibilità, registra l'audit, e crea la scheda ospite **solo** se un
 * nome è stato scritto. Quello che mancava era la strada dal telefono.
 */
export async function walkInDalTelefono(
  ctx: { venueId: string },
  input: WalkInInputType,
  actor?: AuditActor,
) {
  return seatWalkIn(ctx.venueId, input, actor);
}

/**
 * I tavoli su cui un walk-in di N persone può sedere **adesso**.
 *
 * Passa dallo stesso giudizio degli ospiti arrivati, così le due schermate
 * consigliano lo stesso tavolo: un walk-in da due non deve occupare il sei
 * posti solo perché è arrivato da un'altra porta del prodotto.
 */
export async function tavoliPerWalkIn(
  ctx: { venueId: string; timezone: string; waiterId: string },
  coperti: number,
  adesso = new Date(),
): Promise<Proposta> {
  const lista = await candidati(ctx, { adesso });
  const durataMin = await durataDelWalkIn(ctx.venueId, coperti, adesso);
  return proponiTavoli(lista, { coperti, durataMin });
}

/**
 * Quanto sta a tavola un walk-in: la misura del locale, non un 105 fisso.
 *
 * È la stessa funzione che usa `findFreeTables` per cercare — e usare due
 * durate diverse per cercare e per sedere vuol dire offrire un tavolo che
 * fra due ore ha già un nome sopra.
 */
async function durataDelWalkIn(venueId: string, coperti: number, adesso: Date): Promise<number> {
  const d = await durataConsigliata(venueId, { partySize: coperti, startsAt: adesso });
  return d.durataMin;
}

export { BookingAssignError };

