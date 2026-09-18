import { db } from "@/lib/db";
import { codaIdentita, telefonoLeggibile } from "@/lib/telefono";
import { trovaOCreaOspite } from "@/server/guest-match";
import {
  CIFRE_SQL,
  riconosciChiamante,
  type EsitoRiconoscimento,
} from "@/server/telefonia";

/**
 * Le chiamate al telefono del locale, mentre succedono.
 *
 * ## A cosa serve, e cosa non è
 *
 * Serve ai tre secondi in cui il telefono squilla: chi risponde vede chi sta
 * chiamando prima di dire pronto. **Non è un registro telefonico** — quello ce
 * l'ha il centralino, che vede tutto il traffico, anche quello che non riguarda
 * il ristorante.
 *
 * ## Chi scrive
 *
 * Il centralino, attraverso `/api/v1/telefonia/chiamata`. Ogni evento della
 * stessa chiamata arriva con lo stesso identificativo, e la riga si **aggiorna**
 * invece di moltiplicarsi: una consegna ripetuta — che su una rete succede — non
 * deve far comparire due volte la stessa persona sullo schermo.
 */

/** Oltre questo, una chiamata che «squilla» non sta più squillando. */
const SQUILLO_MASSIMO_MS = 90_000;

export type StatoChiamata = "RINGING" | "ANSWERED" | "MISSED" | "ENDED";

export type ChiamataViva = {
  id: string;
  /** Il numero come si legge a voce. Nullo quando arriva riservato. */
  telefono: string | null;
  stato: StatoChiamata;
  daQuandoISecondi: number;
  /** Chi sta chiamando, se lo sappiamo. */
  chi: EsitoRiconoscimento["guest"];
  prossimaPrenotazione: EsitoRiconoscimento["prossimaPrenotazione"];
  ultimaVisita: EsitoRiconoscimento["ultimaVisita"];
  altreSchede: EsitoRiconoscimento["altreSchede"];
};

/**
 * Registra un evento di chiamata.
 *
 * Il riconoscimento dell'ospite si fa **una volta**, allo squillo, e si scrive
 * sulla riga: se domani quella scheda cambia numero, questa chiamata resta
 * attribuita a chi era in quel momento. Una storia che si riscrive non è una
 * storia — ed è anche il motivo per cui non si rifà il riconoscimento agli
 * eventi successivi: costerebbe una lettura per ogni «ha risposto».
 */
export async function registraEventoChiamata(
  venueId: string,
  dati: {
    externalId: string;
    phone?: string | null;
    stato: StatoChiamata;
    quando?: Date;
  },
): Promise<{
  id: string;
  stato: StatoChiamata;
  chi: EsitoRiconoscimento["guest"];
}> {
  const adesso = dati.quando ?? new Date();
  const esistente = await db.phoneCall.findUnique({
    where: { venueId_externalId: { venueId, externalId: dati.externalId } },
    select: { id: true, guestId: true, fromNumber: true, answeredAt: true },
  });

  /* Il riconoscimento solo alla prima notizia di questa chiamata. Agli eventi
     successivi l'ospite è già sulla riga. */
  let riconosciuto: EsitoRiconoscimento | null = null;
  if (!esistente) {
    riconosciuto = await riconosciChiamante(
      venueId,
      dati.phone ?? null,
      adesso,
    );
  }

  /* L'evento corrispondente allo stato. La riga dice **com'è adesso**, questi
     dicono **cos'è successo**: senza, una chiamata andata storta tre giorni
     prima è una riga con uno stato e nessuna storia. */
  const evento = EVENTO_PER_STATO[dati.stato];

  const riga = await db.phoneCall.upsert({
    where: { venueId_externalId: { venueId, externalId: dati.externalId } },
    create: {
      venueId,
      externalId: dati.externalId,
      fromNumber: dati.phone ?? null,
      status: dati.stato,
      startedAt: adesso,
      answeredAt: dati.stato === "ANSWERED" ? adesso : null,
      endedAt:
        dati.stato === "ENDED" || dati.stato === "MISSED" ? adesso : null,
      guestId: riconosciuto?.guest?.id ?? null,
    },
    update: {
      status: dati.stato,
      /* `?? adesso` e non sovrascrittura: se il centralino manda «ha
         risposto» due volte, l'ora della risposta resta la prima. La seconda
         notizia non cambia quando è successo. */
      answeredAt:
        dati.stato === "ANSWERED"
          ? (esistente?.answeredAt ?? adesso)
          : undefined,
      endedAt:
        dati.stato === "ENDED" || dati.stato === "MISSED" ? adesso : undefined,
      // Il numero può arrivare solo con l'evento successivo (caller ID tardivo).
      fromNumber: dati.phone ?? esistente?.fromNumber ?? null,
    },
    select: { id: true, status: true, guestId: true },
  });

  /* Fuori dalla scrittura principale e senza attesa: se l'evento non si scrive,
     la chiamata è comunque registrata e sullo schermo di chi risponde compare.
     Un registro che fa perdere il fatto che registra non è un registro. */
  void db.phoneCallEvent
    .create({
      data: {
        callId: riga.id,
        kind: evento,
        actor: "provider",
        meta: dati.phone ? { numero: dati.phone } : undefined,
      },
    })
    .catch(() => {});

  return {
    id: riga.id,
    stato: riga.status as StatoChiamata,
    chi: riconosciuto?.guest ?? null,
  };
}

/**
 * Quale evento corrisponde a quale stato.
 *
 * `MISSED` diventa `CALL_MISSED` e non `CALL_ENDED`: per il ristoratore sono
 * due cose diverse — una persona da richiamare e una conversazione avvenuta —
 * e nel registro devono restare distinte, o la differenza si perde proprio
 * dove serve rileggerla.
 */
const EVENTO_PER_STATO: Record<StatoChiamata, "CALL_RECEIVED" | "CALL_ANSWERED" | "CALL_MISSED" | "CALL_ENDED"> = {
  RINGING: "CALL_RECEIVED",
  ANSWERED: "CALL_ANSWERED",
  MISSED: "CALL_MISSED",
  ENDED: "CALL_ENDED",
};

/**
 * Scrive un evento su una chiamata.
 *
 * Il posto unico da cui passano gli eventi che **non** nascono da un cambio di
 * stato: una prenotazione creata durante la chiamata, un messaggio mandato,
 * una nota scritta. Sta qui e non sparso perché un registro con due porte
 * d'ingresso finisce per avere due formati.
 */
export async function segnaEventoChiamata(
  callId: string,
  kind: EventoChiamataKind,
  opzioni: { actor?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  await db.phoneCallEvent
    .create({
      data: {
        callId,
        kind,
        actor: opzioni.actor ?? null,
        meta: opzioni.meta as never,
      },
    })
    .catch(() => {
      /* Un evento perso non deve far fallire l'operazione che lo ha
         prodotto: una prenotazione creata e non annotata è molto meglio di
         una prenotazione non creata. */
    });
}

export type EventoChiamataKind =
  | "CALL_RECEIVED"
  | "CALL_ANSWERED"
  | "CALL_HELD"
  | "CALL_RESUMED"
  | "CALL_TRANSFERRED"
  | "CALL_ENDED"
  | "CALL_MISSED"
  | "AI_STARTED"
  | "AI_ESCALATED"
  | "BOOKING_CREATED"
  | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED"
  | "WAITLIST_ADDED"
  | "MESSAGE_SENT"
  | "CALLBACK_CREATED"
  | "CALLBACK_RESOLVED"
  | "CRM_INSIGHT_CREATED"
  | "NOTE_ADDED";

/** Gli eventi di una chiamata, dal primo all'ultimo. */
export async function eventiDiChiamata(venueId: string, callId: string) {
  const chiamata = await db.phoneCall.findFirst({
    where: { id: callId, venueId },
    select: { id: true },
  });
  if (!chiamata) return [];
  return db.phoneCallEvent.findMany({
    where: { callId },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, actor: true, meta: true, createdAt: true },
  });
}

/**
 * Le chiamate da mostrare **adesso** in Servizio.
 *
 * Solo quelle che squillano o a cui si sta parlando, e solo quelle degli ultimi
 * novanta secondi: una riga rimasta «RINGING» perché il centralino non ha mai
 * mandato la chiusura non deve restare sullo schermo per sempre. È il caso che
 * capita — una rete che salta a metà chiamata — e lasciarlo scoperto vuol dire
 * un telefono che sembra squillare mentre il locale è silenzioso.
 */
export async function chiamateVive(
  venueId: string,
  adesso: Date = new Date(),
): Promise<ChiamataViva[]> {
  const righe = await db.phoneCall.findMany({
    where: {
      venueId,
      status: { in: ["RINGING", "ANSWERED"] },
      startedAt: { gte: new Date(adesso.getTime() - SQUILLO_MASSIMO_MS) },
    },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: {
      id: true,
      fromNumber: true,
      status: true,
      startedAt: true,
      guestId: true,
    },
  });
  if (righe.length === 0) return [];

  /* Il riconoscimento si rilegge qui, non si conserva: le allergie e il blocco
     devono essere quelli di adesso. L'ospite **quale** è già deciso (sta sulla
     riga); quello che si rilegge è cosa sappiamo di lui. */
  return Promise.all(
    righe.map(async (r) => {
      const esito = r.fromNumber
        ? await riconosciChiamante(venueId, r.fromNumber, adesso)
        : null;
      return {
        id: r.id,
        telefono: r.fromNumber ? telefonoLeggibile(r.fromNumber) : null,
        stato: r.status as StatoChiamata,
        daQuandoISecondi: Math.max(
          0,
          Math.round((adesso.getTime() - r.startedAt.getTime()) / 1000),
        ),
        chi: esito?.guest ?? null,
        prossimaPrenotazione: esito?.prossimaPrenotazione ?? null,
        ultimaVisita: esito?.ultimaVisita ?? null,
        altreSchede: esito?.altreSchede ?? [],
      };
    }),
  );
}

/**
 * Il segnale per la sonda: qualcosa è cambiato nelle chiamate?
 *
 * Corto di proposito, come gli altri pezzi di `versione-servizio`: il conteggio
 * serve perché la sola ora dell'ultima modifica non vede una chiamata che
 * **smette** di squillare.
 */
export async function versioneChiamate(
  venueId: string,
  adesso: Date = new Date(),
) {
  const r = await db.phoneCall.aggregate({
    where: {
      venueId,
      status: { in: ["RINGING", "ANSWERED"] },
      startedAt: { gte: new Date(adesso.getTime() - SQUILLO_MASSIMO_MS) },
    },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return `${r._count._all}:${r._max.updatedAt?.getTime() ?? 0}`;
}

/**
 * Chiude le chiamate che nessuno ha chiuso.
 *
 * Il centralino manda la fine di una chiamata, ma se salta la rete nel momento
 * sbagliato quella notizia non arriva mai. Senza questa pulizia la riga resta
 * `RINGING` per sempre nel database — invisibile sullo schermo grazie al limite
 * dei novanta secondi, ma sporca nei conti di domani.
 */
export async function chiudiChiamateAppese(
  adesso: Date = new Date(),
): Promise<number> {
  const esito = await db.phoneCall.updateMany({
    where: {
      status: { in: ["RINGING", "ANSWERED"] },
      startedAt: { lt: new Date(adesso.getTime() - 60 * 60 * 1000) },
    },
    data: { status: "ENDED", endedAt: adesso },
  });
  return esito.count;
}

/** Il numero ha una forma utilizzabile? Serve alla rotta per rifiutare presto. */
export function numeroUtilizzabile(phone: string | null | undefined): boolean {
  return codaIdentita(phone) != null;
}

/* -------------------------------------------------------------------------- */
/*  Lo storico                                                                */
/* -------------------------------------------------------------------------- */

export type ChiamataInElenco = {
  id: string;
  telefono: string | null;
  stato: StatoChiamata;
  quando: Date;
  /** Quanto è durata, in secondi. Nullo se non ha risposto nessuno. */
  durataSecondi: number | null;
  ospite: {
    id: string;
    nome: string;
    blocked: boolean;
    noShowCount: number;
    allergies: string | null;
  } | null;
  /** La prenotazione nata da questa chiamata, se ne è nata una. */
  prenotazione: { id: string; reference: string; startsAt: Date; partySize: number } | null;
};

export type ElencoChiamate = {
  chiamate: ChiamataInElenco[];
  /** Quante ce ne sono in tutto nel periodo: un tetto senza totale è una bugia. */
  totale: number;
  /** Quante sono rimaste senza risposta e non hanno prodotto una prenotazione. */
  daRichiamare: number;
};

/** Quante righe alla volta. */
const PER_PAGINA = 50;

/**
 * Le chiamate di questo locale, dalla più recente.
 *
 * L'ospite si legge dalla **relazione** e non dal numero: qui si guarda il
 * passato, e il passato è chi era attribuito a quella chiamata quando è
 * arrivata — non chi risponde a quel numero oggi.
 */
export async function elencoChiamate(
  venueId: string,
  opzioni: { giorni?: number; solo?: "perse" | "tutte"; pagina?: number } = {},
): Promise<ElencoChiamate> {
  const giorni = opzioni.giorni ?? 7;
  const solo = opzioni.solo ?? "tutte";
  const pagina = Math.max(1, opzioni.pagina ?? 1);
  const da = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000);

  const dove = {
    venueId,
    startedAt: { gte: da },
    ...(solo === "perse" ? { status: "MISSED" as const } : {}),
  };

  const [righe, totale, daRichiamare] = await Promise.all([
    db.phoneCall.findMany({
      where: dove,
      orderBy: { startedAt: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      select: {
        id: true,
        fromNumber: true,
        status: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        guest: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            blocked: true,
            noShowCount: true,
            allergies: true,
          },
        },
        booking: { select: { id: true, reference: true, startsAt: true, partySize: true } },
      },
    }),
    db.phoneCall.count({ where: dove }),
    /* Da richiamare: nessuno ha risposto **e** non è nata una prenotazione.
       Senza la seconda condizione ci finirebbe chi ha riprovato subito dopo e
       ha prenotato — cioè si richiamerebbe chi è già a posto. */
    db.phoneCall.count({
      where: { venueId, startedAt: { gte: da }, status: "MISSED", bookingId: null },
    }),
  ]);

  return {
    totale,
    daRichiamare,
    chiamate: righe.map((r) => ({
      id: r.id,
      telefono: r.fromNumber ? telefonoLeggibile(r.fromNumber) : null,
      stato: r.status as StatoChiamata,
      quando: r.startedAt,
      durataSecondi:
        r.answeredAt && r.endedAt
          ? Math.max(0, Math.round((r.endedAt.getTime() - r.answeredAt.getTime()) / 1000))
          : null,
      ospite: r.guest
        ? {
            id: r.guest.id,
            nome: `${r.guest.firstName}${r.guest.lastName ? ` ${r.guest.lastName}` : ""}`,
            blocked: r.guest.blocked,
            noShowCount: r.guest.noShowCount,
            allergies: r.guest.allergies,
          }
        : null,
      prenotazione: r.booking,
    })),
  };
}

/** Quante righe entrano in una pagina dell'elenco. */
export const CHIAMATE_PER_PAGINA = PER_PAGINA;

/* -------------------------------------------------------------------------- */
/*  Le chiamate di un contatto                                                */
/* -------------------------------------------------------------------------- */

export type ChiamataDiOspite = {
  id: string;
  quando: Date;
  stato: StatoChiamata;
  durataSecondi: number | null;
  /** La prenotazione nata da quella chiamata, se ne è nata una. */
  prenotazione: { id: string; startsAt: Date; partySize: number } | null;
};

/**
 * Le telefonate di questa persona.
 *
 * Sulla scheda di un cliente le chiamate valgono più che nello storico del
 * telefono: là sono righe, qui sono **il rapporto con quella persona**. «Ha
 * chiamato tre volte in due settimane e non ha mai prenotato» è una cosa che
 * un ristoratore vuole sapere quando gli risponde, e non c'era nessun posto
 * dove si potesse leggere.
 *
 * Si legge dalla **relazione** e non dal numero: se domani la scheda cambia
 * numero, queste restano le sue chiamate — sono quelle che le erano state
 * attribuite quando sono arrivate.
 */
export async function chiamateDiOspite(
  venueId: string,
  guestId: string,
  limite = 20,
): Promise<ChiamataDiOspite[]> {
  const righe = await db.phoneCall.findMany({
    where: { venueId, guestId },
    orderBy: { startedAt: "desc" },
    take: limite,
    select: {
      id: true,
      startedAt: true,
      answeredAt: true,
      endedAt: true,
      status: true,
      booking: { select: { id: true, startsAt: true, partySize: true } },
    },
  });

  return righe.map((r) => ({
    id: r.id,
    quando: r.startedAt,
    stato: r.status as StatoChiamata,
    durataSecondi:
      r.answeredAt && r.endedAt
        ? Math.max(0, Math.round((r.endedAt.getTime() - r.answeredAt.getTime()) / 1000))
        : null,
    prenotazione: r.booking,
  }));
}

/**
 * Attacca una chiamata a un contatto, creandolo se non c'è.
 *
 * È il gesto che mancava: una persona chiama, il numero non è di nessuno, e
 * quel numero resta una riga nello storico invece di diventare un cliente.
 * Prima non esisteva **nessun** modo di creare un contatto
 * dall'interfaccia — la rotta c'era e nessuna schermata la chiamava — e questa
 * è la porta più naturale per farlo: non si inventa un contatto dal nulla, si
 * dà un nome a qualcuno che ha appena telefonato.
 *
 * Passa da `trovaOCreaOspite`, quindi **non crea doppioni**: se quel numero è
 * già di una scheda (scritto in un'altra forma, o inserito nel frattempo da
 * un'altra parte), si attacca a quella e le completa i campi vuoti.
 */
export async function collegaChiamataAContatto(
  venueId: string,
  chiamataId: string,
  dati: { firstName: string; lastName?: string | null; email?: string | null },
): Promise<{ guestId: string; giaConosciuto: boolean }> {
  const chiamata = await db.phoneCall.findFirst({
    where: { id: chiamataId, venueId },
    select: { id: true, fromNumber: true, guestId: true },
  });
  if (!chiamata) throw new Error("not_found");

  const esito = await trovaOCreaOspite(venueId, {
    firstName: dati.firstName.trim(),
    lastName: dati.lastName?.trim() || null,
    email: dati.email?.trim() || null,
    phone: chiamata.fromNumber,
  });

  /* Si attaccano **tutte** le chiamate di quel numero, non solo questa: sono
     della stessa persona, e lasciare le altre «non riconosciute» vorrebbe dire
     che chi ha appena dato un nome a un numero lo deve ridare per ogni riga. */
  const coda = codaIdentita(chiamata.fromNumber);
  if (coda) {
    await db.$executeRaw`
      UPDATE "PhoneCall"
      SET "guestId" = ${esito.guestId}
      WHERE "venueId" = ${venueId}
        AND "guestId" IS NULL
        AND "fromNumber" IS NOT NULL
        AND right(regexp_replace("fromNumber", '[^0-9]', '', 'g'), ${CIFRE_SQL}) = ${coda}
    `;
  } else {
    await db.phoneCall.update({
      where: { id: chiamata.id },
      data: { guestId: esito.guestId },
    });
  }

  return esito;
}
