import type { TableShape } from "@prisma/client";
import { db } from "@/lib/db";
import { dateKeyInVenue } from "@/lib/venue-time";
import { getFloorLive, type TableLiveInfo } from "@/server/floor-live";
import { ospitiDaAccomodare, type OspiteDaAccomodare } from "./da-accomodare";
import {
  chiedeUnGesto,
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
  /**
   * **Chi lo sta seguendo.** Vuoto quando non è assegnato a nessuno.
   *
   * Sta sulla card perché la domanda «ce l'ha già qualcuno?» è quella che si
   * fa a voce attraverso la sala dieci volte a sera, ed è l'unica cosa che
   * separa un tavolo da prendere in carico da uno su cui si sta pestando i
   * piedi a un collega.
   */
  coperto: Copertura[];
  /**
   * **Seduto e di nessuno.** Il caso che ha fatto nascere questo lavoro.
   *
   * Non è «non è mio»: è *non è di nessuno*. Un tavolo che il maître ha
   * accomodato e su cui non ha assegnato niente non appartiene a un collega —
   * appartiene al servizio, e finché qualcuno non lo prende resta scoperto.
   */
  scoperto: boolean;
  stato: StatoTavoloStaff;
  tono: TonoStato;
  /** Chi c'è: coperti e nome, quando il tavolo è occupato. */
  ospiti: number | null;
  ospite: string | null;
  bookingId: string | null;
  /** Da quanti minuti sono seduti. */
  daMinuti: number | null;
  /**
   * Da quanti minuti il tavolo si trova **in questo stato**.
   *
   * L'altra metà di `daMinuti`, e quella che serve a decidere: una tavolata
   * seduta da un'ora e mezza a cui è appena arrivato il dolce non chiede
   * niente; una seduta da dodici minuti senza comanda sì. Il ragionamento
   * per esteso sta su `MomentiDelTavolo`.
   */
  daMinutiStato: number | null;
  /** L'ora in cui si sono seduti, nel fuso del locale: «11:15». */
  dalle: string | null;
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
 * **L'ordine della coda**, in una funzione sola.
 *
 * Tre criteri, e sono tre domande in sequenza:
 *
 * 1. **cosa chiede questo tavolo?** — il rango del richiamo
 *    (`RANGO_RICHIAMO`): i piatti che si freddano prima dei conti, i conti
 *    prima delle tovaglie vuote. Chi non chiede niente va in fondo;
 * 2. **da quanto lo chiede?** — a parità di motivo passa avanti chi aspetta
 *    da più tempo. È il criterio che trasforma un elenco in una coda: senza,
 *    due tavoli appena seduti restavano in ordine alfabetico e quello che
 *    aspettava da un quarto d'ora finiva sotto;
 * 3. **è mio?** — solo a parità di tutto il resto. Il tavolo di un collega
 *    con due piatti al passe viene comunque prima del mio che non chiede
 *    niente: in sala si serve il locale, non il proprio rango.
 *
 * L'etichetta chiude, ed è l'unico ordine stabile quando non succede niente.
 */
export function confrontaPerUrgenza(a: TavoloStaff, b: TavoloStaff): number {
  const ra = a.richiamo?.rango ?? Number.MAX_SAFE_INTEGER;
  const rb = b.richiamo?.rango ?? Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;

  const ma = a.richiamo?.daMinuti ?? -1;
  const mb = b.richiamo?.daMinuti ?? -1;
  if (ma !== mb) return mb - ma;

  if (a.mio !== b.mio) return a.mio ? -1 : 1;
  return a.label.localeCompare(b.label, "it", { numeric: true });
}

/**
 * **Da gestire ora**: i tavoli che chiedono qualcosa, già in ordine.
 *
 * Il filtro è `richiamo !== null`, e vale la pena dire cosa *non* è: non è
 * «i tavoli occupati» e non è «i miei tavoli». Un tavolo con i secondi in
 * cucina non è in questa lista pur essendo pieno — la cucina ci sta
 * lavorando e chi serve non deve fare niente — e un tavolo scoperto con
 * quattro persone appena sedute ci sta pur non essendo di nessuno.
 *
 * È la differenza fra una dashboard che racconta com'è messa la sala e una
 * che risponde a «chi devo gestire adesso».
 */
/**
 * Quante card di «Da gestire ora» stanno in Home. Il resto si conta, e si
 * apre in Sala.
 *
 * Sta **qui e non nel componente**, ed è una lezione già pagata in questo
 * progetto (vedi `RIQUADRO_GLIFO` in `glifo-tavolo.tsx`): una costante
 * esportata da un modulo `"use client"` e letta da una pagina del server non
 * è un numero, è un riferimento al client. `slice(0, riferimento)` non
 * solleva niente — restituisce una lista vuota, e la sezione più importante
 * della dashboard sparisce in silenzio. È successo mentre si scriveva questa,
 * e dallo schermo sembrava che la coda non trovasse nessun tavolo.
 */
export const MAX_DA_GESTIRE = 4;

export function daGestireOra(sala: SalaStaff, limite?: number): TavoloStaff[] {
  const coda = sala.tavoli.filter((t) => chiedeUnGesto(t.richiamo)).sort(confrontaPerUrgenza);
  return limite === undefined ? coda : coda.slice(0, limite);
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
  const coperture = await copertureDelServizio(venueId, giorno, servizio);
  const ids = new Set<string>();
  for (const [tableId, chi] of coperture) {
    if (chi.some((c) => c.waiterId === waiterId)) ids.add(tableId);
  }
  return ids;
}

/** Chi copre un tavolo: nome e identificativo, per scriverlo sulla card. */
export type Copertura = { waiterId: string; nome: string };

/**
 * **Chi copre cosa**, per tutto il servizio, in due letture.
 *
 * `tavoliAssegnatiA` rispondeva a «quali sono i miei», che basta a filtrare
 * una schermata e non basta più: la dashboard deve sapere anche **quali non
 * sono di nessuno**, perché quelli sono il problema che questo lavoro esiste
 * per risolvere. Un tavolo appena accomodato dal maître, su cui nessuno è
 * stato assegnato, oggi non compare sul telefono di nessun cameriere: non è
 * mio, non è libero, quindi non è da nessuna parte.
 *
 * Adesso «i miei» si ricavano da qui — una fonte sola, due letture per tutta
 * la sala invece di due per persona — e la differenza fra «di un collega» e
 * «di nessuno» si può finalmente fare.
 *
 * Le due tabelle restano due (`StaffAssignment` dalla piantina,
 * `WaiterAssignment` da Camerieri): il perché, e perché non si sceglie, sta
 * nel commento di `server/staff-assignments.ts`.
 */
export async function copertureDelServizio(
  venueId: string,
  giorno: string,
  servizio: string,
): Promise<Map<string, Copertura[]>> {
  const data = giornoUtc(giorno);
  const nome = (w: { firstName: string; lastName: string }) =>
    `${w.firstName} ${w.lastName}`.trim();

  const [perTavolo, perCameriere] = await Promise.all([
    db.staffAssignment.findMany({
      where: { venueId, date: data, service: servizio, scope: "TABLE" },
      select: {
        tableId: true,
        waiterId: true,
        waiter: { select: { firstName: true, lastName: true } },
      },
    }),
    db.waiterAssignment.findMany({
      where: { venueId, date: data, service: servizio },
      select: {
        tableIds: true,
        waiterId: true,
        waiter: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const mappa = new Map<string, Copertura[]>();
  const aggiungi = (tableId: string, c: Copertura) => {
    const chi = mappa.get(tableId) ?? [];
    if (!chi.some((x) => x.waiterId === c.waiterId)) chi.push(c);
    mappa.set(tableId, chi);
  };

  for (const a of perTavolo) {
    if (a.tableId) aggiungi(a.tableId, { waiterId: a.waiterId, nome: nome(a.waiter) });
  }
  for (const a of perCameriere) {
    for (const t of a.tableIds) aggiungi(t, { waiterId: a.waiterId, nome: nome(a.waiter) });
  }
  return mappa;
}

/**
 * **Quando il tavolo è entrato nello stato in cui si trova.**
 *
 * Non è un dato in più da scrivere: sono le colonne che le comande timbrano
 * già a ogni passaggio (`sentAt`, `readyAt`, `servedAt`, `Booking.seatedAt`,
 * `Order.contoRichiestoAt`), lette insieme. Serve a rispondere alla domanda
 * che la dashboard faceva mancare: non «da quanto sono seduti» — che un
 * tavolo a cui è appena arrivato il secondo non aiuta — ma **da quanto dura
 * questa situazione**.
 *
 * Il caso che conta è `primoPronto`: fra due piatti al passe il minuto che
 * decide è quello del **più vecchio**, perché è quello che si sta freddando.
 * Prendere il più recente vorrebbe dire azzerare il cronometro ogni volta che
 * la cucina manda fuori qualcos'altro dello stesso tavolo.
 */
type MomentiDelTavolo = {
  /** La bozza più vecchia con qualcosa dentro: da quando si sta ordinando. */
  bozzaAperta: Date | null;
  /** L'ultimo invio in cucina. */
  ultimoInvio: Date | null;
  /** Il piatto pronto da più tempo: quello che si fredda. */
  primoPronto: Date | null;
  /** L'ultimo piatto arrivato al tavolo. */
  ultimoServito: Date | null;
  /** Vero se non è rimasto niente da portare né da cucinare. */
  tuttoServito: boolean;
};

const NESSUN_MOMENTO: MomentiDelTavolo = {
  bozzaAperta: null,
  ultimoInvio: null,
  primoPronto: null,
  ultimoServito: null,
  tuttoServito: false,
};

function prima(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function dopo(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Le comande vive di oggi, raggruppate per tavolo. */
async function comandePerTavolo(venueId: string, da: Date, a: Date) {
  const righe = await db.comanda.findMany({
    where: {
      venueId,
      createdAt: { gte: da, lte: a },
      status: { in: ["BOZZA", "INVIATA", "RICEVUTA", "IN_PREPARAZIONE", "PRONTA", "SERVITA"] },
    },
    select: {
      tableId: true,
      status: true,
      createdAt: true,
      sentAt: true,
      _count: { select: { righe: true } },
      righe: {
        /*
          Le righe **servite** entrano adesso, e non è un allargamento
          gratuito: senza di loro non si sa se il tavolo ha finito di
          mangiare, cioè non esiste «da controllare». Restano fuori solo le
          annullate, che non sono mai esistite per nessuno.

          Quello che conta ancora sulle sole righe vive — piatti pronti,
          allergie da portare — si filtra qui sotto per stato, non nella
          query: una seconda interrogazione per la stessa tabella costerebbe
          più della decina di righe in più che questa porta.
        */
        where: { NOT: { status: "ANNULLATA" } },
        select: {
          status: true,
          quantity: true,
          allergens: true,
          allergyNote: true,
          readyAt: true,
          servedAt: true,
        },
      },
    },
  });

  const mappa = new Map<
    string,
    {
      comande: { status: (typeof righe)[number]["status"]; righe: number }[];
      pronti: number;
      allergie: number;
      momenti: MomentiDelTavolo;
    }
  >();

  for (const c of righe) {
    if (!c.tableId) continue;
    const voce = mappa.get(c.tableId) ?? {
      comande: [],
      pronti: 0,
      allergie: 0,
      momenti: { ...NESSUN_MOMENTO, tuttoServito: true },
    };
    voce.comande.push({ status: c.status, righe: c._count.righe });
    if (c.status === "BOZZA" && c._count.righe > 0) {
      voce.momenti.bozzaAperta = prima(voce.momenti.bozzaAperta, c.createdAt);
    }
    voce.momenti.ultimoInvio = dopo(voce.momenti.ultimoInvio, c.sentAt);

    for (const r of c.righe) {
      if (r.status === "PRONTA") {
        voce.pronti += r.quantity;
        voce.momenti.primoPronto = prima(voce.momenti.primoPronto, r.readyAt);
      }
      if (r.status === "SERVITA") {
        voce.momenti.ultimoServito = dopo(voce.momenti.ultimoServito, r.servedAt);
      } else {
        /* Una riga non servita è qualcosa che il tavolo aspetta ancora: che
           sia in bozza, in cucina o al passe. Basta lei a togliere il
           «hanno finito». */
        voce.momenti.tuttoServito = false;
        if (r.allergens.length > 0 || r.allergyNote) voce.allergie += 1;
      }
    }
    mappa.set(c.tableId, voce);
  }

  /* Un tavolo su cui non è mai stato servito niente non ha «finito»: ha solo
     una comanda vuota. Senza questa riga un tavolo con una bozza appena
     aperta risulterebbe pronto per i dolci. */
  for (const voce of mappa.values()) {
    if (!voce.momenti.ultimoServito) voce.momenti.tuttoServito = false;
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
  /**
   * Includere anche i tavoli **scoperti**: gente seduta, nessun cameriere
   * assegnato.
   *
   * È la stessa distinzione di `ancheLiberi`, spostata di un passo.
   * `view_all_tables` protegge **i tavoli degli altri** — il conto di un
   * collega, la comanda che sta battendo, le allergie dei suoi ospiti. Un
   * tavolo scoperto non è di un collega: è di nessuno, e un tavolo con
   * quattro persone sedute che non compare sul telefono di nessuno è
   * esattamente il modo in cui una famiglia resta venti minuti senza che le
   * si avvicini qualcuno.
   *
   * Quello che si vede non è lo stesso di `view_all_tables`: si vede il
   * tavolo che si potrebbe prendere in carico adesso. Appena qualcuno lo
   * prende, smette di essere scoperto e sparisce dalla vista di tutti gli
   * altri — il filtro è sulla copertura, non su una lista da tenere
   * aggiornata.
   *
   * Nei locali che non usano le assegnazioni **tutti i tavoli sono
   * scoperti**, e la Staff App si comporta come se avessero la sala intera.
   * È deliberato: oggi in quei locali un cameriere non vede *niente*, che è
   * peggio di qualunque cosa questo flag possa mostrare di troppo.
   */
  ancheScoperti?: boolean;
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

  const [live, tavoli, coperture, comande, conti, daAccomodare] = await Promise.all([
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
    copertureDelServizio(ctx.venueId, giorno, servizio),
    comandePerTavolo(ctx.venueId, inizioGiorno, fineGiorno),
    db.order.findMany({
      where: { venueId: ctx.venueId, status: { in: ["RECEIVED", "PREPARING", "READY"] } },
      select: { id: true, contoRichiestoAt: true, booking: { select: { tableId: true } } },
    }),
    ospitiDaAccomodare(ctx.venueId, ctx.timezone, adesso),
  ]);

  /* La **data** e non un booleano: da qui esce anche il cronometro del
     richiamo «conto richiesto», che è la differenza fra «lo hanno chiesto» e
     «lo hanno chiesto sette minuti fa». */
  const contoRichiestoPerTavolo = new Map<string, Date | null>();
  for (const o of conti) {
    if (o.booking?.tableId) contoRichiestoPerTavolo.set(o.booking.tableId, o.contoRichiestoAt);
  }

  const oraLocale = new Intl.DateTimeFormat("it-IT", {
    timeZone: ctx.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const minutiDa = (d: Date | null | undefined): number | null =>
    d ? Math.max(0, Math.round((adesso.getTime() - d.getTime()) / 60_000)) : null;

  const righe: TavoloStaff[] = [];

  for (const t of tavoli) {
    const chiCopre = coperture.get(t.id) ?? [];
    const mio = chiCopre.some((c) => c.waiterId === ctx.waiterId);
    const info = live.byTableId[t.id];
    const base = info?.status ?? "LIBERO";
    /*
      Un tavolo **scoperto** conta come seduta senza padrone solo se ci sta
      davvero qualcuno: un libero senza assegnazioni è semplicemente libero, e
      lo copre già `ancheLiberi`.
    */
    const scoperto = chiCopre.length === 0 && base !== "LIBERO" && base !== "BLOCCATO";
    if (
      !mio &&
      !opts.tuttaLaSala &&
      !(opts.ancheLiberi && base === "LIBERO") &&
      !(opts.ancheScoperti && scoperto)
    ) {
      continue;
    }
    const dati = comande.get(t.id);
    const riassunto = riassumiComande(dati?.comande ?? []);
    const pronti = dati?.pronti ?? 0;
    /* Le allergie arrivano da due parti e contano insieme: le righe di
       comanda su cui è stata dichiarata un'allergia, e la scheda CRM di chi è
       seduto. Per chi serve il tavolo sono la stessa cosa — una persona a cui
       un ingrediente fa male. */
    const allergie = (dati?.allergie ?? 0) + (info?.current?.allergies ? 1 : 0);
    const contoRichiestoAt = contoRichiestoPerTavolo.get(t.id) ?? null;
    const contoRichiesto = !!contoRichiestoAt;
    const pagamentoInCorso = info?.current?.conto?.pagamentoInCorso ?? false;

    const stato = statoTavoloStaff(base, riassunto, { contoRichiesto, pagamentoInCorso });
    const nota = info ? notaOspite(info) : null;

    /* I minuti da seduti: la fotografia della sala dà i minuti **alla fine
       prevista**, che è l'altra metà. Qui serve «da quanto sono lì», che è la
       domanda di chi deve decidere se è ora di proporre i dolci. */
    const seduti = info?.current;
    const sedutiDa =
      seduti && seduti.status === "SEATED"
        ? new Date(seduti.seatedAt ?? seduti.startsAt)
        : null;
    const daMinuti = minutiDa(sedutiDa);

    /*
      **Il cronometro dello stato**, stato per stato.

      Ogni riga è una data che il prodotto timbra già: nessuna colonna nuova,
      nessun «stato cambiato alle». La regola che le tiene insieme è che si
      conta da quando è cominciata *la cosa che chiede attenzione*, non da
      quando è cominciata la serata — e per i piatti pronti quella cosa è il
      piatto più vecchio al passe, non l'ultimo uscito dalla cucina.
    */
    const momenti = dati?.momenti ?? NESSUN_MOMENTO;
    const daMinutiStato = minutiDa(
      stato === "CONTO" || stato === "PAGAMENTO"
        ? contoRichiestoAt
        : stato === "IN_SERVIZIO"
          ? (momenti.primoPronto ?? momenti.ultimoInvio)
          : stato === "COMANDA_INVIATA"
            ? momenti.ultimoInvio
            : stato === "ORDINAZIONE"
              ? momenti.bozzaAperta
              : stato === "SERVITO" || stato === "VERSO_IL_CONTO"
                ? (momenti.ultimoServito ?? sedutiDa)
                : sedutiDa,
    );

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
      coperto: chiCopre,
      scoperto,
      stato,
      tono: TONO_STATO[stato],
      ospiti: seduti?.partySize ?? null,
      ospite: seduti?.guestName ?? null,
      bookingId: seduti?.bookingId ?? null,
      daMinuti,
      daMinutiStato,
      dalle: sedutiDa ? oraLocale.format(sedutiDa) : null,
      orderId: seduti?.conto?.orderId ?? null,
      totaleCents: seduti?.conto?.totalCents ?? null,
      residuoCents: seduti?.conto?.residuoCents ?? null,
      richiamo: richiamoTavolo({
        stato,
        piattiPronti: pronti,
        contoRichiesto,
        allergie,
        dettaglioAllergia: info?.current?.allergies ?? null,
        notaImportante: nota,
        daMinuti: daMinutiStato,
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
    L'ordine è l'urgenza, non l'alfabeto: vedi `confrontaPerUrgenza`.
  */
  righe.sort(confrontaPerUrgenza);

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
