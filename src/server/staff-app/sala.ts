import type { TableShape } from "@prisma/client";
import { db } from "@/lib/db";
import { dateKeyInVenue } from "@/lib/venue-time";
import { getFloorLive, type TableLiveInfo } from "@/server/floor-live";
import { ospitiDaAccomodare, type OspiteDaAccomodare } from "./da-accomodare";
import {
  riassumiComande,
  richiamoTavolo,
  statoTavoloStaff,
  TONO_STATO,
  type Richiamo,
  type StatoTavoloStaff,
  type TonoStato,
} from "@/lib/stato-tavolo-staff";

/**
 * **I tavoli, come li vede chi li serve.**
 *
 * La sala del back office (`getFloorLive`) risponde a «com'è messa la sala»:
 * tutti i tavoli, tutti gli stati, per chi guarda dall'alto. Questa vista
 * risponde a «cosa devo fare adesso», e le differenze sono tre:
 *
 * - **sono i miei tavoli.** Il filtro è `StaffAssignment`, che il maître
 *   compila già oggi dalla piantina. Chi ha `view_all_tables` può chiedere
 *   anche gli altri, e li riceve marcati come non propri;
 * - **lo stato è più fine.** Fra due tavoli «occupati» la differenza è tutta:
 *   a uno bisogna andare a prendere l'ordine, l'altro aspetta i primi. Il
 *   raffinamento sta in `lib/stato-tavolo-staff.ts`, ed è derivato dalle
 *   comande — nessuna colonna nuova;
 * - **c'è un richiamo.** Una riga sola che dice se bisogna alzarsi: due piatti
 *   pronti, un conto chiesto, un'allergia al tavolo.
 *
 * ## Il costo
 *
 * Tre letture in tutto, qualunque sia il numero di tavoli: la fotografia della
 * sala (che ne fa già le sue, in blocco), le assegnazioni del servizio, le
 * comande vive del giorno. Nessun `N+1`: una mappa di venti tavoli che
 * interroga venti volte è una mappa che in servizio non si apre.
 */

export type BadgeTavolo = {
  /** Una comanda in bozza con qualcosa dentro: l'ordinazione è cominciata. */
  bozza: boolean;
  /** Comande partite, che la cucina non ha ancora preso in mano. */
  inviate: number;
  inPreparazione: number;
  /** Piatti pronti al passe, da portare. */
  piattiPronti: number;
  contoRichiesto: boolean;
  /** Quante righe di comanda portano un'allergia dichiarata. */
  allergie: number;
};

export type TavoloStaff = {
  tableId: string;
  label: string;
  roomId: string | null;
  roomName: string | null;
  posti: number;
  /**
   * La **forma e la misura del tavolo come le ha disegnate il locale**.
   *
   * Non sono dati nuovi e non sono dati decorativi: sono le stesse colonne su
   * cui gira l'editor della sala (`Table.shape`, `width`, `height`), e
   * servono alla Staff App per disegnare il tavolo con la stessa geometria —
   * `lib/tavolo-geometria.ts` — invece di un rettangolo uguale per tutti.
   *
   * Un cameriere che in piantina ha imparato che B3 è il tondo grande in
   * mezzo alla sala deve ritrovare quel tondo grande anche qui. Con un
   * rettangolo identico per ogni tavolo, il numero scritto sopra resta
   * l'unico modo di riconoscerlo, cioè bisogna leggere.
   */
  shape: TableShape;
  larghezza: number | null;
  altezza: number | null;
  /** Vero se questo tavolo è assegnato a chi guarda. */
  mio: boolean;
  stato: StatoTavoloStaff;
  tono: TonoStato;
  /** Chi c'è: coperti e nome, quando il tavolo è occupato. */
  ospiti: number | null;
  ospite: string | null;
  bookingId: string | null;
  /** Da quanti minuti sono seduti. */
  daMinuti: number | null;
  orderId: string | null;
  totaleCents: number | null;
  residuoCents: number | null;
  richiamo: Richiamo | null;
  badge: BadgeTavolo;
  /** Note dell'ospite (allergie dal CRM, occasione), in una riga. */
  notaOspite: string | null;
};

export type SalaStaff = {
  /** «Pranzo», «Cena»: il servizio su cui si sta leggendo. */
  servizio: string;
  giorno: string;
  adesso: string;
  sale: { id: string; nome: string }[];
  tavoli: TavoloStaff[];
  /** Quanti dei tavoli restituiti sono assegnati a chi guarda. */
  miei: number;
  /**
   * **Chi è già dentro il locale e non è ancora seduto.**
   *
   * Sta nella stessa fotografia dei tavoli, e non in una chiamata a sé, per
   * una ragione precisa: la sonda del realtime (`useServizioVivo`) ricarica
   * *questa* lettura ogni volta che qualcosa si muove. Una lista separata
   * avrebbe avuto un suo aggiornamento, e per qualche secondo la sala
   * avrebbe mostrato un tavolo libero accanto a un ospite che un collega
   * aveva appena accomodato proprio lì.
   *
   * Non dipende dai tavoli assegnati: chi aspetta all'ingresso aspetta per
   * tutti, e un cameriere che vede la coda vuota mentre due persone sono in
   * piedi da dieci minuti è la ragione per cui esiste questa riga.
   */
  daAccomodare: OspiteDaAccomodare[];
};

/** I tavoli di chi guarda, in cima; il resto — liberi compresi — dietro. */
export function soloMiei(sala: SalaStaff): TavoloStaff[] {
  return sala.tavoli.filter((t) => t.mio);
}

/**
 * I tavoli su cui si può far sedere qualcuno adesso.
 *
 * Esclude i propri — quelli stanno già scritti sopra — e tiene solo il
 * `LIBERO` pieno: un «prenotato» è un tavolo che fra venti minuti ha un nome
 * sopra, e offrirlo come disponibile è il modo di far sedere due tavolate
 * nello stesso posto.
 */
export function tavoliLiberi(sala: SalaStaff, limite?: number): TavoloStaff[] {
  const liberi = sala.tavoli
    .filter((t) => !t.mio && t.stato === "LIBERO")
    .sort((a, b) => a.label.localeCompare(b.label, "it", { numeric: true }));
  return limite === undefined ? liberi : liberi.slice(0, limite);
}

/**
 * Il servizio in corso, o il primo della giornata.
 *
 * Il locale definisce le sue fasce (`Shift`: «Cena, 19:00–23:00») e le
 * assegnazioni dello staff sono etichettate con quei nomi. Qui si cerca la
 * fascia che contiene l'ora attuale; se non ce n'è — sono le cinque del
 * pomeriggio, fra pranzo e cena — si prende **la prossima**, perché chi apre
 * l'app a quell'ora si sta preparando per quella.
 *
 * Senza nessuna fascia configurata resta «Cena», che è il valore con cui
 * `listServiceOptions` riempie il vuoto oggi: meglio un nome sbagliato ma
 * coerente fra le due schermate che una stringa vuota che non combacia con
 * nessuna assegnazione.
 */
export async function servizioCorrente(
  venueId: string,
  timeZone: string,
  adesso = new Date(),
): Promise<string> {
  const giornoSettimana = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
      .format(adesso)
      .replace(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/, (d) =>
        String(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d)),
      ),
  );

  const fasce = await db.shift.findMany({
    where: { venueId, active: true, weekday: giornoSettimana },
    orderBy: { startMinute: "asc" },
    select: { name: true, startMinute: true, endMinute: true },
  });
  if (fasce.length === 0) return "Cena";

  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(adesso);
  const ora =
    Number(parti.find((p) => p.type === "hour")?.value ?? "0") * 60 +
    Number(parti.find((p) => p.type === "minute")?.value ?? "0");

  const dentro = fasce.find((f) => ora >= f.startMinute && ora < f.endMinute);
  if (dentro) return dentro.name;

  const prossima = fasce.find((f) => f.startMinute > ora);
  return (prossima ?? fasce[fasce.length - 1]).name;
}

function giornoUtc(chiave: string): Date {
  return new Date(`${chiave}T00:00:00.000Z`);
}

/**
 * I tavoli assegnati a una persona per un servizio.
 *
 * Legge **tutte e due** le tabelle di assegnazione, e non è una svista: sono
 * due fonti per lo stesso fatto, scritte da due schermate diverse del back
 * office (`StaffAssignment` dalla piantina, `WaiterAssignment` da Camerieri) e
 * che non si guardano fra loro. Il commento in `server/staff-assignments.ts`
 * lo dichiara già. Dal punto di vista di chi lavora sono entrambe assegnazioni
 * vere fatte dentro il prodotto, e mostrarne una sola vorrebbe dire nascondere
 * a un cameriere dei tavoli che qualcuno gli ha dato.
 */
export async function tavoliAssegnatiA(
  venueId: string,
  waiterId: string,
  giorno: string,
  servizio: string,
): Promise<Set<string>> {
  const data = giornoUtc(giorno);
  const [perTavolo, perCameriere] = await Promise.all([
    db.staffAssignment.findMany({
      where: { venueId, waiterId, date: data, service: servizio, scope: "TABLE" },
      select: { tableId: true },
    }),
    db.waiterAssignment.findMany({
      where: { venueId, waiterId, date: data, service: servizio },
      select: { tableIds: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const a of perTavolo) if (a.tableId) ids.add(a.tableId);
  for (const a of perCameriere) for (const t of a.tableIds) ids.add(t);
  return ids;
}

/** Le comande vive di oggi, raggruppate per tavolo. */
async function comandePerTavolo(venueId: string, da: Date, a: Date) {
  const righe = await db.comanda.findMany({
    where: {
      venueId,
      createdAt: { gte: da, lte: a },
      status: { in: ["BOZZA", "INVIATA", "RICEVUTA", "IN_PREPARAZIONE", "PRONTA"] },
    },
    select: {
      tableId: true,
      status: true,
      _count: { select: { righe: true } },
      righe: {
        where: { NOT: { status: { in: ["ANNULLATA", "SERVITA"] } } },
        select: { status: true, quantity: true, allergens: true, allergyNote: true },
      },
    },
  });

  const mappa = new Map<
    string,
    { comande: { status: (typeof righe)[number]["status"]; righe: number }[]; pronti: number; allergie: number }
  >();

  for (const c of righe) {
    if (!c.tableId) continue;
    const voce = mappa.get(c.tableId) ?? { comande: [], pronti: 0, allergie: 0 };
    voce.comande.push({ status: c.status, righe: c._count.righe });
    for (const r of c.righe) {
      if (r.status === "PRONTA") voce.pronti += r.quantity;
      if (r.allergens.length > 0 || r.allergyNote) voce.allergie += 1;
    }
    mappa.set(c.tableId, voce);
  }
  return mappa;
}

/**
 * La riga «cosa sapere» dell'ospite, ridotta a una frase per la card.
 *
 * **Senza le allergie**: quelle escono da qui e diventano un richiamo a sé,
 * rosso e con il triangolo. Tenerle in questa funzione era un difetto vero e
 * si vedeva: l'allergia al glutine di una cliente abituale, scritta nella sua
 * scheda del CRM, compariva sulla card con lo stesso grigio e la stessa icona
 * di «compleanno».
 */
function notaOspite(info: TableLiveInfo): string | null {
  if (!info.current) return null;
  const prima = info.current.daSapere.find((r) => !/allerg/i.test(r.testo));
  return prima?.testo ?? null;
}

export type OpzioniSala = {
  /** Vero per chi ha `view_all_tables`: si ricevono anche i tavoli altrui. */
  tuttaLaSala?: boolean;
  /**
   * Includere anche i tavoli **liberi** non assegnati, pur senza
   * `view_all_tables`.
   *
   * Non è un permesso aggirato ed è la differenza che conta: un tavolo libero
   * non ha sopra nessun dato di nessuno — nessun nome, nessun conto, nessuna
   * allergia — e sapere che il sei è vuoto è ciò che un cameriere chiede al
   * maître dieci volte a sera. `view_all_tables` protegge **i tavoli degli
   * altri**, cioè le persone che ci sono sedute; qui non c'è seduto nessuno.
   *
   * Un tavolo che nel frattempo si occupa sparisce da solo da questo elenco,
   * perché il filtro è sullo stato e non sull'assegnazione.
   */
  ancheLiberi?: boolean;
  roomId?: string | null;
  adesso?: Date;
};

export async function salaDelCameriere(
  ctx: { venueId: string; timezone: string; waiterId: string },
  opts: OpzioniSala = {},
): Promise<SalaStaff> {
  const adesso = opts.adesso ?? new Date();
  const giorno = dateKeyInVenue(adesso, ctx.timezone);
  const servizio = await servizioCorrente(ctx.venueId, ctx.timezone, adesso);

  const inizioGiorno = new Date(adesso);
  inizioGiorno.setHours(0, 0, 0, 0);
  const fineGiorno = new Date(adesso);
  fineGiorno.setHours(23, 59, 59, 999);

  const [live, tavoli, miei, comande, conti, daAccomodare] = await Promise.all([
    getFloorLive(ctx.venueId, { now: adesso, roomId: opts.roomId ?? null }),
    db.table.findMany({
      where: { venueId: ctx.venueId, ...(opts.roomId ? { roomId: opts.roomId } : {}) },
      orderBy: { label: "asc" },
      select: {
        id: true,
        label: true,
        seats: true,
        roomId: true,
        shape: true,
        width: true,
        height: true,
        room: { select: { id: true, name: true } },
      },
    }),
    tavoliAssegnatiA(ctx.venueId, ctx.waiterId, giorno, servizio),
    comandePerTavolo(ctx.venueId, inizioGiorno, fineGiorno),
    db.order.findMany({
      where: { venueId: ctx.venueId, status: { in: ["RECEIVED", "PREPARING", "READY"] } },
      select: { id: true, contoRichiestoAt: true, booking: { select: { tableId: true } } },
    }),
    ospitiDaAccomodare(ctx.venueId, ctx.timezone, adesso),
  ]);

  const contoRichiestoPerTavolo = new Map<string, boolean>();
  for (const o of conti) {
    if (o.booking?.tableId) contoRichiestoPerTavolo.set(o.booking.tableId, !!o.contoRichiestoAt);
  }

  const righe: TavoloStaff[] = [];

  for (const t of tavoli) {
    const mio = miei.has(t.id);
    const info = live.byTableId[t.id];
    const base = info?.status ?? "LIBERO";
    if (!mio && !opts.tuttaLaSala && !(opts.ancheLiberi && base === "LIBERO")) continue;
    const dati = comande.get(t.id);
    const riassunto = riassumiComande(dati?.comande ?? []);
    const pronti = dati?.pronti ?? 0;
    /* Le allergie arrivano da due parti e contano insieme: le righe di
       comanda su cui è stata dichiarata un'allergia, e la scheda CRM di chi è
       seduto. Per chi serve il tavolo sono la stessa cosa — una persona a cui
       un ingrediente fa male. */
    const allergie = (dati?.allergie ?? 0) + (info?.current?.allergies ? 1 : 0);
    const contoRichiesto = contoRichiestoPerTavolo.get(t.id) ?? false;
    const pagamentoInCorso = info?.current?.conto?.pagamentoInCorso ?? false;

    const stato = statoTavoloStaff(base, riassunto, { contoRichiesto, pagamentoInCorso });
    const nota = info ? notaOspite(info) : null;

    /* I minuti da seduti: la fotografia della sala dà i minuti **alla fine
       prevista**, che è l'altra metà. Qui serve «da quanto sono lì», che è la
       domanda di chi deve decidere se è ora di proporre i dolci. */
    const seduti = info?.current;
    const daMinuti =
      seduti && seduti.status === "SEATED"
        ? Math.max(0, Math.round((adesso.getTime() - new Date(seduti.startsAt).getTime()) / 60_000))
        : null;

    righe.push({
      tableId: t.id,
      label: t.label,
      roomId: t.roomId,
      roomName: t.room?.name ?? null,
      posti: t.seats,
      shape: t.shape,
      larghezza: t.width,
      altezza: t.height,
      mio,
      stato,
      tono: TONO_STATO[stato],
      ospiti: seduti?.partySize ?? null,
      ospite: seduti?.guestName ?? null,
      bookingId: seduti?.bookingId ?? null,
      daMinuti,
      orderId: seduti?.conto?.orderId ?? null,
      totaleCents: seduti?.conto?.totalCents ?? null,
      residuoCents: seduti?.conto?.residuoCents ?? null,
      richiamo: richiamoTavolo({
        comande: riassunto,
        piattiPronti: pronti,
        contoRichiesto,
        allergie,
        dettaglioAllergia: info?.current?.allergies ?? null,
        notaImportante: nota,
      }),
      badge: {
        bozza: riassunto.bozzeConRighe > 0,
        inviate: riassunto.inviate,
        inPreparazione: riassunto.inPreparazione,
        piattiPronti: pronti,
        contoRichiesto,
        allergie,
      },
      notaOspite: info?.current?.allergies ? `Allergie: ${info.current.allergies}` : nota,
    });
  }

  /*
    L'ordine è l'urgenza, non l'alfabeto.

    Chi apre l'app durante il servizio deve trovare in cima quello che chiede
    di alzarsi: i piatti pronti prima di tutto, poi i conti. A parità, i propri
    tavoli davanti a quelli degli altri, e infine l'etichetta — che è l'unico
    ordine stabile quando non c'è niente da fare.
  */
  const peso: Record<Richiamo["tipo"] | "NESSUNO", number> = {
    PIATTI_PRONTI: 0,
    CONTO: 1,
    ALLERGIA: 2,
    NOTA: 3,
    NESSUNO: 4,
  };
  righe.sort((a, b) => {
    const pa = peso[a.richiamo?.tipo ?? "NESSUNO"];
    const pb = peso[b.richiamo?.tipo ?? "NESSUNO"];
    if (pa !== pb) return pa - pb;
    if (a.mio !== b.mio) return a.mio ? -1 : 1;
    return a.label.localeCompare(b.label, "it", { numeric: true });
  });

  const sale = [
    ...new Map(
      tavoli
        .filter((t) => t.room)
        .map((t) => [t.room!.id, { id: t.room!.id, nome: t.room!.name }] as const),
    ).values(),
  ];

  return {
    servizio,
    giorno,
    adesso: adesso.toISOString(),
    sale,
    tavoli: righe,
    miei: righe.filter((r) => r.mio).length,
    daAccomodare,
  };
}
