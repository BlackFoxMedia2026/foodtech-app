import type { BookingStatus, StaffCapability, WaiterStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { dateKeyInVenue, DEFAULT_VENUE_TIMEZONE } from "@/lib/venue-time";
import { deriveTableLiveStatus, type TableLiveStatus } from "@/lib/table-status";
import { comeLiberoVerso, previsioneLiberazione, type LiberoVerso } from "@/lib/liberazione";
import { cosaSapere, type RigaDaSapere } from "@/lib/cosa-sapere";
import { STATI_IMPEGNATIVI, STATI_INCASSATI } from "@/lib/pagamento-vista";
import { TABLE_ASSIGNABLE_CAPABILITIES } from "@/lib/staff-roles";
import { durataTipicaSeduta } from "./rotazione";

/**
 * Il **profilo di un tavolo**: tutto quello che sta succedendo su quel pezzo di
 * sala, in una lettura sola.
 *
 * ## Perché esiste
 *
 * Il tavolo era un oggetto grafico. Per sapere chi c'era si guardava la mappa,
 * per il conto si apriva il Servizio, per il personale si passava dai tre
 * puntini della Sala, per il QR da un'altra voce degli stessi tre puntini, e
 * lo storico non c'era affatto. Cinque posti per cinque domande che chi sta in
 * sala si fa **insieme**, guardando lo stesso tavolo: «chi c'è, da quanto,
 * quanto deve, chi lo serve, quando si libera».
 *
 * ## Niente di nuovo nel database
 *
 * Non c'è una tabella «profilo» e non c'è una colonna di stato: **tutto è
 * derivato** dalle entità che esistono già, con le stesse funzioni pure che
 * usano la mappa della Sala e quella del Servizio —
 * `deriveTableLiveStatus`, `previsioneLiberazione`, `cosaSapere`. È la
 * condizione perché il pannello e la mappa non possano dire due cose diverse
 * dello stesso tavolo: la matematica è una sola, cambia solo quante righe si
 * leggono.
 *
 * Rispetto a `getFloorLive`, che risponde per **una sala intera** e serve a
 * disegnarla, qui si legge **un tavolo** e si scende più in profondità: le
 * righe del conto, i singoli pagamenti, il personale assegnato, i servizi
 * passati. Chiamare `getFloorLive` per un tavolo solo vorrebbe dire leggere
 * l'intera giornata di tutta la sala a ogni apertura del pannello.
 *
 * ## Lo storico non è una copia
 *
 * Si ricostruisce aggregando `Booking` + `Order` + `Payment` +
 * `StaffAssignment`, tenuti insieme da `Table.id` — mai da `Table.label`, che
 * è un nome e cambia. `Booking.tableId` e `Payment.tableId` sopravvivono alla
 * chiusura del servizio, ed è per questo che la domanda «cos'è successo su
 * questo tavolo a settembre» ha una risposta senza aggiungere niente.
 */

/* -------------------------------------------------------------------------- */
/*  Come viaggia verso l'interfaccia                                          */
/* -------------------------------------------------------------------------- */

export type PersonaAlTavolo = {
  ruolo: (typeof TABLE_ASSIGNABLE_CAPABILITIES)[number];
  waiterId: string;
  nome: string;
  status: WaiterStatus;
  photoUrl: string | null;
};

/** Un pagamento davvero arrivato o in corso su questo conto. */
export type QuotaPagata = {
  id: string;
  /** Il conto, senza la mancia. */
  importoCents: number;
  manciaCents: number;
  stato: "PAGATA" | "IN_CORSO";
  /** Quando il denaro è stato confermato. Nullo per chi sta pagando adesso. */
  quando: string | null;
  /** `card`, `apple_pay`, `link`: come lo racconta Stripe. */
  metodo: string | null;
};

export type ContoDelTavolo = {
  orderId: string;
  riferimento: string;
  /** Quante righe sono state battute. Zero righe non è «zero euro». */
  righe: number;
  totaleCents: number;
  /** Gift card e punti già scalati in sala. */
  scontiCents: number;
  daPagareCents: number;
  pagatoCents: number;
  /** Impegnato da chi sta pagando in questo momento. */
  inCorsoCents: number;
  residuoCents: number;
  manceCents: number;
  quote: QuotaPagata[];
};

export type OspiteDelTavolo = {
  guestId: string | null;
  nome: string;
  /** Quante volte è già stato qui. Nullo per chi non è nel CRM. */
  visite: number | null;
  affezionato: boolean;
  telefono: string | null;
};

/** Chi c'è adesso, o chi sta arrivando. */
export type SedutaCorrente = {
  bookingId: string;
  ospite: OspiteDelTavolo;
  coperti: number;
  /** L'orario prenotato. */
  startsAt: string;
  /** Quando si sono davvero seduti, se si sono seduti. */
  seatedAt: string | null;
  arrivedAt: string | null;
  status: string;
  /** Minuti da quando si sono seduti. Nullo se non ancora seduti. */
  daMinuti: number | null;
  /** Minuti all'orario prenotato (negativo = in ritardo), per chi deve arrivare. */
  minutiAllArrivo: number | null;
  liberoVerso: LiberoVerso | null;
  note: string | null;
  noteInterne: string | null;
  daSapere: RigaDaSapere[];
  /** Gli altri tavoli della stessa tavolata. */
  unitoA: string[];
};

export type ProssimaPrenotazione = {
  bookingId: string;
  ospite: OspiteDelTavolo;
  startsAt: string;
  coperti: number;
  note: string | null;
};

/** Un servizio già chiuso su questo tavolo. */
export type ServizioPassato = {
  bookingId: string;
  /** Il giorno di servizio nel fuso del locale, `YYYY-MM-DD`. */
  giorno: string;
  /** «Pranzo», «Cena»: dedotto dalle fasce del locale. Nullo se non ricade in nessuna. */
  servizio: string | null;
  /** Quando si sono seduti — o, in mancanza, quando erano attesi. */
  arrivo: string;
  /** Quando il tavolo si è liberato. Nullo se nessuno l'ha chiuso. */
  liberato: string | null;
  durataMin: number | null;
  coperti: number;
  ospite: OspiteDelTavolo | null;
  personale: string[];
  totaleCents: number;
  pagatoCents: number;
  manceCents: number;
};

export type ProfiloTavolo = {
  now: string;
  timezone: string;
  currency: string;
  tavolo: {
    id: string;
    label: string;
    seats: number;
    shape: string;
    attivo: boolean;
    roomId: string | null;
    sala: string | null;
  };
  /** Il servizio in corso secondo le fasce del locale, per l'assegnazione del personale. */
  servizio: string | null;
  /** Il giorno di servizio, `YYYY-MM-DD`: la chiave con cui si assegna il personale. */
  giorno: string;
  stato: TableLiveStatus;
  /**
   * Qualcuno, a questo tavolo, sta pagando col telefono **adesso**.
   *
   * Non è uno stato a sé: è una proprietà di un tavolo occupato, e chi guarda
   * deve leggerla insieme al resto, non al posto del resto. Trattarla come
   * ottavo stato raddoppierebbe i casi senza aggiungere una decisione.
   */
  pagamentoInCorso: boolean;
  corrente: SedutaCorrente | null;
  prossima: ProssimaPrenotazione | null;
  personale: PersonaAlTavolo[];
  conto: ContoDelTavolo | null;
  /** Gli ospiti conosciuti collegati al servizio corrente, senza doppioni. */
  clienti: OspiteDelTavolo[];
  /**
   * Il QR del tavolo, quel tanto che basta alla piastrella del pannello.
   *
   * Il **segreto non passa di qui**: il link con il token lo serve
   * `/api/tables/[id]/qr/stato`, che è la rotta che già lo faceva e che ha il
   * suo controllo. Qui c'è solo quello che serve a dire «acceso, e ha già
   * incassato dodici volte» senza una seconda richiesta dal browser.
   */
  qr: {
    generato: boolean;
    attivo: boolean;
    ultimoUtilizzo: string | null;
    /** Quanti pagamenti sono arrivati da questo QR. */
    pagamenti: number;
    /** Quanto è stato incassato, mance escluse. */
    incassatoCents: number;
  };
  storico: ServizioPassato[];
  /** Quanti servizi chiusi ha in tutto questo tavolo. */
  storicoTotale: number;
};

/* -------------------------------------------------------------------------- */
/*  Il servizio di un istante                                                 */
/* -------------------------------------------------------------------------- */

type Fascia = { name: string; weekday: number; startMinute: number; endMinute: number };

const MINUTI_GIORNO = 24 * 60;

/** Giorno della settimana e minuti da mezzanotte, nel fuso del locale. */
function quandoNelLocale(instant: Date, timezone: string): { weekday: number; minuti: number } {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const valore = (tipo: string) => parti.find((p) => p.type === tipo)?.value ?? "";
  const GIORNI: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: GIORNI[valore("weekday")] ?? 0,
    minuti: Number(valore("hour")) * 60 + Number(valore("minute")),
  };
}

/**
 * In quale fascia di servizio cade un istante.
 *
 * Serve allo storico — «Cena · 20:32 → 22:14» — e all'assegnazione del
 * personale, che è scritta per `date + service`. Una fascia che scavalca la
 * mezzanotte (`endMinute > 1440`, com'è previsto da `lib/turni`) copre anche
 * le prime ore del giorno dopo: senza questo, una prenotazione dell'una di
 * notte risulterebbe fuori da ogni servizio proprio nei locali che tirano
 * tardi.
 */
export function servizioDi(instant: Date, fasce: Fascia[], timezone: string): string | null {
  const { weekday, minuti } = quandoNelLocale(instant, timezone);
  const ieri = (weekday + 6) % 7;

  for (const f of fasce) {
    if (f.weekday === weekday && minuti >= f.startMinute && minuti < f.endMinute) return f.name;
    // La coda di una fascia di ieri che ha scavalcato la mezzanotte.
    if (f.weekday === ieri && f.endMinute > MINUTI_GIORNO && minuti < f.endMinute - MINUTI_GIORNO) {
      return f.name;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Il profilo                                                                */
/* -------------------------------------------------------------------------- */

/** Gli stati in cui un conto è ancora aperto. Stessa lista di `server/orders.ts`. */
const CONTI_APERTI = ["RECEIVED", "PREPARING", "READY"] as const;

const SELECT_OSPITE = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  loyaltyTier: true,
  allergies: true,
  privateNotes: true,
  preferences: true,
  totalVisits: true,
  noShowCount: true,
} as const;

type GuestLetto = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  loyaltyTier: string;
  totalVisits: number;
};

function comeOspite(g: GuestLetto | null): OspiteDelTavolo {
  if (!g) {
    // «Senza nome» e non «Walk-in»: un tavolo può essere occupato da chi si è
    // presentato senza prenotare, e dirlo in inglese in una sala italiana è
    // rumore. È la stessa parola che usa la mappa del Servizio.
    return { guestId: null, nome: "Senza nome", visite: null, affezionato: false, telefono: null };
  }
  return {
    guestId: g.id,
    nome: `${g.firstName}${g.lastName ? ` ${g.lastName}` : ""}`,
    visite: g.totalVisits,
    affezionato: g.loyaltyTier === "VIP" || g.loyaltyTier === "AMBASSADOR",
    telefono: g.phone,
  };
}

export class ProfiloTavoloError extends Error {
  constructor(public code: "table_not_found") {
    super(code);
    this.name = "ProfiloTavoloError";
  }
}

/** Quanti servizi passati si mostrano senza chiedere. */
export const STORICO_IN_ANTEPRIMA = 3;

export async function getProfiloTavolo(
  venueId: string,
  tableId: string,
  opts: { now?: Date; giorno?: string | null; servizio?: string | null } = {},
): Promise<ProfiloTavolo> {
  const adesso = opts.now ?? new Date();

  const tavolo = await db.table.findFirst({
    where: { id: tableId, venueId },
    include: {
      room: { select: { id: true, name: true } },
      venue: { select: { timezone: true, currency: true } },
    },
  });
  if (!tavolo) throw new ProfiloTavoloError("table_not_found");

  const timezone = tavolo.venue.timezone ?? DEFAULT_VENUE_TIMEZONE;

  /*
    Il **momento** su cui si risponde.

    La Sala ha un calendario: si può guardare il sabato che non è ancora
    arrivato. Confrontare le prenotazioni di quel sabato con l'orologio di
    adesso le farebbe risultare tutte finite, e ogni tavolo libero — che è
    esattamente il difetto già corretto nella piantina (vedi `floor/page.tsx`).
    Quindi per un giorno diverso da oggi ci si mette a mezzanotte di quel
    giorno, e si legge la giornata come la si leggerebbe prima che cominci.

    Lo storico invece guarda sempre **adesso**: i servizi già chiusi sono
    chiusi, qualunque giorno si stia consultando.
  */
  const oggi = dateKeyInVenue(adesso, timezone);
  const giorno = opts.giorno ?? oggi;
  const now = giorno === oggi ? adesso : startOfDay(new Date(`${giorno}T12:00:00.000Z`));

  const [fasce, prenotazioni, blocco, tipica] = await Promise.all([
    db.shift.findMany({
      where: { venueId, active: true },
      select: { name: true, weekday: true, startMinute: true, endMinute: true },
    }),
    // Le prenotazioni di oggi su questo tavolo, comprese quelle che lo usano
    // come parte di una tavolata: un tavolo unito a un altro non è libero.
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
        startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
        OR: [{ tableId }, { combinedTableIds: { has: tableId } }],
      },
      include: { guest: { select: SELECT_OSPITE } },
      orderBy: { startsAt: "asc" },
    }),
    db.tableBlock.findFirst({
      where: { venueId, tableId, startsAt: { lte: now }, endsAt: { gte: now } },
      select: { id: true },
    }),
    durataTipicaSeduta(venueId, { now }),
  ]);

  // Il servizio scelto nel filtro della Sala vince: è quello di cui si sta
  // guardando la copertura. Senza filtro lo si deduce dall'ora.
  const servizio = opts.servizio ?? servizioDi(now, fasce, timezone);

  const stato = deriveTableLiveStatus(tavolo, prenotazioni, now, { blocked: !!blocco });

  // «Corrente» è chi è seduto; se nessuno è seduto, chi sta arrivando. Stessa
  // regola di `getFloorLive`: le due viste devono raccontare la stessa persona.
  const seduta = prenotazioni.find((b) => b.status === "SEATED" && !b.closedAt);
  const inArrivo = prenotazioni.find(
    (b) =>
      b.status === "ARRIVED" ||
      ((b.status === "CONFIRMED" || b.status === "PENDING") &&
        new Date(b.startsAt.getTime() + b.durationMin * 60_000) > now),
  );
  const corrente = seduta ?? inArrivo ?? null;

  const liberazione =
    corrente && corrente.status === "SEATED" ? previsioneLiberazione(corrente, now, tipica) : null;

  const prossima = prenotazioni.find(
    (b) =>
      b.id !== corrente?.id &&
      (b.status === "CONFIRMED" || b.status === "PENDING") &&
      b.startsAt.getTime() > now.getTime(),
  );

  const [personale, conto, incassiQr, storico, storicoTotale] = await Promise.all([
    personaleDelTavolo(venueId, tableId, giorno, servizio),
    corrente ? contoAperto(venueId, corrente.id, now) : Promise.resolve(null),
    db.payment.aggregate({
      where: {
        venueId,
        tableId,
        kind: "TABLE_QR",
        status: { in: [...STATI_INCASSATI] },
        deletedAt: null,
      },
      _sum: { amountCents: true, tipCents: true },
      _count: true,
    }),
    listaStorico(venueId, tableId, timezone, fasce, {
      limit: STORICO_IN_ANTEPRIMA,
      prima: adesso,
    }),
    contaStorico(venueId, tableId, adesso),
  ]);

  return {
    now: now.toISOString(),
    timezone,
    currency: tavolo.venue.currency,
    tavolo: {
      id: tavolo.id,
      label: tavolo.label,
      seats: tavolo.seats,
      shape: String(tavolo.shape),
      attivo: tavolo.active,
      roomId: tavolo.roomId,
      sala: tavolo.room?.name ?? null,
    },
    servizio,
    giorno,
    stato,
    pagamentoInCorso: (conto?.inCorsoCents ?? 0) > 0,
    corrente: corrente
      ? {
          bookingId: corrente.id,
          ospite: comeOspite(corrente.guest),
          coperti: corrente.partySize,
          startsAt: corrente.startsAt.toISOString(),
          seatedAt: corrente.seatedAt?.toISOString() ?? null,
          arrivedAt: corrente.arrivedAt?.toISOString() ?? null,
          status: corrente.status,
          daMinuti: corrente.seatedAt
            ? Math.max(0, Math.round((now.getTime() - corrente.seatedAt.getTime()) / 60_000))
            : null,
          minutiAllArrivo:
            corrente.status === "SEATED"
              ? null
              : Math.round((corrente.startsAt.getTime() - now.getTime()) / 60_000),
          liberoVerso: liberazione ? comeLiberoVerso(liberazione, tipica?.misurate ?? null) : null,
          note: corrente.notes,
          noteInterne: corrente.internalNotes,
          daSapere: cosaSapere({
            allergies: corrente.guest?.allergies,
            privateNotes: corrente.guest?.privateNotes,
            preferences: corrente.guest?.preferences,
            visits: corrente.guest?.totalVisits,
            noShows: corrente.guest?.noShowCount,
            loyaltyTier: corrente.guest?.loyaltyTier,
            occasion: corrente.occasion,
          }),
          unitoA: corrente.combinedTableIds.filter((id) => id !== tableId),
        }
      : null,
    prossima: prossima
      ? {
          bookingId: prossima.id,
          ospite: comeOspite(prossima.guest),
          startsAt: prossima.startsAt.toISOString(),
          coperti: prossima.partySize,
          note: prossima.notes,
        }
      : null,
    personale,
    conto,
    /*
      I clienti del servizio corrente.

      Una prenotazione ha **un** ospite nel CRM: chi ha prenotato. Le altre
      persone sedute non esistono come righe, e inventarne sarebbe creare
      contatti che nessuno ha lasciato. Quando il tavolo è unito ad altri,
      però, gli ospiti sono davvero più d'uno — una tavolata è più
      prenotazioni — e vanno mostrati tutti, senza doppioni.
    */
    clienti: clientiDelServizio(prenotazioni, corrente?.id ?? null),
    qr: {
      generato: !!tavolo.payQrToken,
      attivo: tavolo.payQrEnabled && !!tavolo.payQrToken,
      ultimoUtilizzo: tavolo.payQrLastSeenAt?.toISOString() ?? null,
      pagamenti: incassiQr._count,
      incassatoCents: (incassiQr._sum.amountCents ?? 0) - (incassiQr._sum.tipCents ?? 0),
    },
    storico,
    storicoTotale,
  };
}

/**
 * Gli ospiti conosciuti che stanno a questo tavolo adesso.
 *
 * Si parte dalla prenotazione corrente e si aggiungono quelle unite in
 * tavolata, saltando chi non è nel CRM e chi è già in elenco: la stessa
 * persona su due prenotazioni della stessa serata è una persona sola.
 */
function clientiDelServizio(
  prenotazioni: Array<{ id: string; status: string; closedAt: Date | null; guest: GuestLetto | null }>,
  correnteId: string | null,
): OspiteDelTavolo[] {
  const vivi = prenotazioni.filter(
    (b) => b.id === correnteId || (b.status === "SEATED" && !b.closedAt),
  );
  const visti = new Set<string>();
  const fuori: OspiteDelTavolo[] = [];
  for (const b of vivi) {
    if (!b.guest || visti.has(b.guest.id)) continue;
    visti.add(b.guest.id);
    fuori.push(comeOspite(b.guest));
  }
  return fuori;
}

/* -------------------------------------------------------------------------- */
/*  Personale                                                                 */
/* -------------------------------------------------------------------------- */

const ORDINE_RUOLI = new Map(TABLE_ASSIGNABLE_CAPABILITIES.map((r, i) => [r as StaffCapability, i]));

async function personaleDelTavolo(
  venueId: string,
  tableId: string,
  giorno: string,
  servizio: string | null,
): Promise<PersonaAlTavolo[]> {
  // Senza un servizio in corso non c'è una chiave con cui leggere: le
  // assegnazioni sono scritte per `date + service`, e inventarne una
  // mostrerebbe il personale di un'altra fascia.
  if (!servizio) return [];

  const righe = await db.staffAssignment.findMany({
    where: {
      venueId,
      tableId,
      scope: "TABLE",
      service: servizio,
      date: new Date(`${giorno}T00:00:00.000Z`),
    },
    include: {
      waiter: { select: { id: true, firstName: true, lastName: true, status: true, photoUrl: true } },
    },
  });

  return righe
    .map((a) => ({
      ruolo: a.assignmentType as PersonaAlTavolo["ruolo"],
      waiterId: a.waiter.id,
      nome: `${a.waiter.firstName} ${a.waiter.lastName}`.trim(),
      status: a.waiter.status,
      photoUrl: a.waiter.photoUrl,
    }))
    .sort((a, b) => (ORDINE_RUOLI.get(a.ruolo) ?? 99) - (ORDINE_RUOLI.get(b.ruolo) ?? 99));
}

/* -------------------------------------------------------------------------- */
/*  Conto                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Il conto aperto della prenotazione corrente, con i pagamenti già arrivati.
 *
 * Il residuo **non sta in colonna**: si somma dai `Payment`, esattamente come
 * fa la pagina pubblica del QR (`server/conto-tavolo.ts`). Un totale copiato
 * accanto alle righe che lo compongono è un totale che prima o poi le
 * contraddice, e qui contraddirlo significa chiedere il conto a chi l'ha già
 * pagato.
 */
async function contoAperto(
  venueId: string,
  bookingId: string,
  now: Date,
): Promise<ContoDelTavolo | null> {
  const ordine = await db.order.findFirst({
    where: { venueId, bookingId, status: { in: [...CONTI_APERTI] } },
    orderBy: { createdAt: "desc" },
    include: { OrderItem: { select: { priceCents: true, quantity: true } } },
  });
  if (!ordine) return null;

  const [pagamenti, giftCard, punti] = await Promise.all([
    db.payment.findMany({
      where: {
        orderId: ordine.id,
        deletedAt: null,
        status: { in: [...STATI_INCASSATI, ...STATI_IMPEGNATIVI] },
      },
      select: {
        id: true,
        status: true,
        amountCents: true,
        tipCents: true,
        refundedCents: true,
        expiresAt: true,
        paidAt: true,
        createdAt: true,
        paymentMethod: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.giftCardRedemption.aggregate({ where: { orderId: ordine.id }, _sum: { amountCents: true } }),
    db.loyaltyTransaction.aggregate({
      where: { orderId: ordine.id, kind: "REDEEMED" },
      _sum: { amountCents: true },
    }),
  ]);

  let pagatoCents = 0;
  let inCorsoCents = 0;
  let manceCents = 0;
  const quote: QuotaPagata[] = [];

  for (const p of pagamenti) {
    const parteConto = p.amountCents - p.tipCents;
    if ((STATI_INCASSATI as string[]).includes(p.status)) {
      // Un rimborso parziale toglie solo quello che è tornato indietro.
      pagatoCents += Math.max(0, parteConto - p.refundedCents);
      manceCents += p.tipCents;
      quote.push({
        id: p.id,
        importoCents: Math.max(0, parteConto - p.refundedCents),
        manciaCents: p.tipCents,
        stato: "PAGATA",
        quando: (p.paidAt ?? p.createdAt).toISOString(),
        metodo: p.paymentMethod,
      });
    } else if (!p.expiresAt || p.expiresAt > now) {
      // Un tentativo scaduto non impegna più niente: contarlo lascerebbe agli
      // altri commensali un residuo che non possono pagare.
      inCorsoCents += parteConto;
      quote.push({
        id: p.id,
        importoCents: parteConto,
        manciaCents: p.tipCents,
        stato: "IN_CORSO",
        quando: null,
        metodo: p.paymentMethod,
      });
    }
  }

  // Il totale mostrato è quello calcolato dalle righe, non `Order.totalCents`:
  // stessa regola di `server/orders.ts`.
  const totaleCents = ordine.OrderItem.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  const scontiCents = (giftCard._sum.amountCents ?? 0) + (punti._sum.amountCents ?? 0);
  const daPagareCents = Math.max(0, totaleCents - scontiCents);

  return {
    orderId: ordine.id,
    riferimento: ordine.reference,
    righe: ordine.OrderItem.length,
    totaleCents,
    scontiCents,
    daPagareCents,
    pagatoCents,
    inCorsoCents,
    residuoCents: Math.max(0, daPagareCents - pagatoCents - inCorsoCents),
    manceCents,
    quote,
  };
}

/* -------------------------------------------------------------------------- */
/*  Storico                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Gli stati di una prenotazione che ha davvero occupato il tavolo.
 *
 * `NO_SHOW` e `CANCELLED` non sono servizi: nessuno si è seduto, e metterli in
 * mezzo ai conti chiusi li farebbe sembrare serate.
 */
const SERVITE: BookingStatus[] = ["COMPLETED", "SEATED", "ARRIVED", "CONFIRMED"];

/** Le prenotazioni che contano come «servizio passato» su un tavolo. */
function dovePassate(venueId: string, tableId: string, prima: Date) {
  return {
    venueId,
    deletedAt: null,
    status: { in: [...SERVITE] },
    startsAt: { lt: prima },
    OR: [{ tableId }, { combinedTableIds: { has: tableId } }],
    // Un servizio è passato quando il tavolo si è liberato. Una prenotazione
    // di ieri che nessuno ha chiuso non è storia: è una riga dimenticata, e
    // metterla in mezzo ai conti chiusi la farebbe sembrare un fatto.
    closedAt: { not: null },
  };
}

function contaStorico(venueId: string, tableId: string, prima: Date): Promise<number> {
  return db.booking.count({ where: dovePassate(venueId, tableId, prima) });
}

/**
 * I servizi già chiusi su questo tavolo, dal più recente.
 *
 * Quattro letture e non quattro per riga: prenotazioni, poi i conti di quelle
 * prenotazioni, poi i pagamenti di quei conti, poi il personale di quei giorni.
 * Aprire il pannello di un tavolo non deve costare una interrogazione per
 * riga di storico.
 */
async function listaStorico(
  venueId: string,
  tableId: string,
  timezone: string,
  fasce: Fascia[],
  opts: { limit: number; offset?: number; prima: Date },
): Promise<ServizioPassato[]> {
  const prenotazioni = await db.booking.findMany({
    where: dovePassate(venueId, tableId, opts.prima),
    include: { guest: { select: SELECT_OSPITE } },
    orderBy: { startsAt: "desc" },
    take: opts.limit,
    skip: opts.offset ?? 0,
  });
  if (prenotazioni.length === 0) return [];

  const ids = prenotazioni.map((b) => b.id);
  const giorni = [
    ...new Set(prenotazioni.map((b) => dateKeyInVenue(b.seatedAt ?? b.startsAt, timezone))),
  ];

  const [conti, assegnazioni] = await Promise.all([
    db.order.findMany({
      where: { venueId, bookingId: { in: ids } },
      select: {
        id: true,
        bookingId: true,
        OrderItem: { select: { priceCents: true, quantity: true } },
        payments: {
          where: { deletedAt: null, status: { in: [...STATI_INCASSATI] } },
          select: { amountCents: true, tipCents: true, refundedCents: true },
        },
      },
    }),
    db.staffAssignment.findMany({
      where: {
        venueId,
        tableId,
        scope: "TABLE",
        date: { in: giorni.map((g) => new Date(`${g}T00:00:00.000Z`)) },
      },
      include: { waiter: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const contoPerPrenotazione = new Map(
    conti
      .filter((o): o is typeof o & { bookingId: string } => !!o.bookingId)
      .map((o) => {
        let pagatoCents = 0;
        let manceCents = 0;
        for (const p of o.payments) {
          pagatoCents += Math.max(0, p.amountCents - p.tipCents - p.refundedCents);
          manceCents += p.tipCents;
        }
        return [
          o.bookingId,
          {
            totaleCents: o.OrderItem.reduce((s, r) => s + r.priceCents * r.quantity, 0),
            pagatoCents,
            manceCents,
          },
        ];
      }),
  );

  /** Il personale di quel tavolo, indicizzato per `giorno|servizio`. */
  const personePerTurno = new Map<string, string[]>();
  for (const a of assegnazioni) {
    const chiave = `${a.date.toISOString().slice(0, 10)}|${a.service}`;
    const nome = `${a.waiter.firstName} ${a.waiter.lastName}`.trim();
    const lista = personePerTurno.get(chiave);
    if (lista) {
      if (!lista.includes(nome)) lista.push(nome);
    } else personePerTurno.set(chiave, [nome]);
  }

  return prenotazioni.map((b) => {
    const arrivo = b.seatedAt ?? b.arrivedAt ?? b.startsAt;
    const giorno = dateKeyInVenue(arrivo, timezone);
    const servizio = servizioDi(arrivo, fasce, timezone);
    const soldi = contoPerPrenotazione.get(b.id);
    return {
      bookingId: b.id,
      giorno,
      servizio,
      arrivo: arrivo.toISOString(),
      liberato: b.closedAt?.toISOString() ?? null,
      durataMin: b.closedAt
        ? Math.max(0, Math.round((b.closedAt.getTime() - arrivo.getTime()) / 60_000))
        : null,
      coperti: b.partySize,
      ospite: b.guest ? comeOspite(b.guest) : null,
      personale: servizio ? (personePerTurno.get(`${giorno}|${servizio}`) ?? []) : [],
      totaleCents: soldi?.totaleCents ?? 0,
      pagatoCents: soldi?.pagatoCents ?? 0,
      manceCents: soldi?.manceCents ?? 0,
    };
  });
}

/** Lo storico completo di un tavolo, a pagine. */
export async function getStoricoTavolo(
  venueId: string,
  tableId: string,
  opts: { limit?: number; offset?: number; now?: Date } = {},
): Promise<{ righe: ServizioPassato[]; totale: number }> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const tavolo = await db.table.findFirst({
    where: { id: tableId, venueId },
    select: { id: true, venue: { select: { timezone: true } } },
  });
  if (!tavolo) throw new ProfiloTavoloError("table_not_found");

  const timezone = tavolo.venue.timezone ?? DEFAULT_VENUE_TIMEZONE;
  const fasce = await db.shift.findMany({
    where: { venueId, active: true },
    select: { name: true, weekday: true, startMinute: true, endMinute: true },
  });

  const [righe, totale] = await Promise.all([
    listaStorico(venueId, tableId, timezone, fasce, {
      limit,
      offset: opts.offset ?? 0,
      prima: now,
    }),
    contaStorico(venueId, tableId, now),
  ]);

  return { righe, totale };
}
