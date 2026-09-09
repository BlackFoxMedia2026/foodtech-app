import { db } from "@/lib/db";
import { NON_PIU_RITARDO_MIN, durataUmana } from "@/lib/durata";
import { endOfDay, startOfDay } from "@/lib/utils";
import { checkAvailability, findShiftFor, zonedDayAndMinute } from "./availability";
import { getFloorLive } from "./floor-live";
import { frasePrevisione } from "@/lib/liberazione";
import { listWaitlist } from "./waitlist";
import {
  ORDINE_LIVELLI,
  livelloAvviso,
  type GravitaAvviso,
  type LivelloAvviso,
} from "@/lib/livello-avviso";

// Ri-esportata: il centro controllo è il posto dove ci si aspetta di trovarla.
export { durataUmana };

/**
 * Il centro controllo del servizio: non «quanti coperti ho», ma **cosa sta per
 * andare storto**.
 *
 * È la differenza fra un gestionale che riporta e uno che avvisa. I numeri
 * della modalità Servizio dicono com'è adesso; qui si incrociano per dire dove
 * finiranno fra venti minuti — un tavolo che non si libera in tempo, una
 * tavolata che aspetta mentre un sei posti ospita due persone, un cliente in
 * ritardo che ha già due no-show alle spalle.
 *
 * **Regole deterministiche, non un modello.** Ogni avviso è una condizione che
 * si può leggere, discutere e correggere: se un ristoratore dice «questo per me
 * non è un problema», si cambia la soglia. Un modello generativo qui
 * aggiungerebbe incertezza a dati che sono già esatti — e il §17 del brief lo
 * dice esplicitamente.
 */

/**
 * La gravità e il **livello** stanno in `lib/livello-avviso`: li usa anche il
 * client, e importarli da qui gli porterebbe dietro Prisma. Ri-esportati
 * perché questo è il modulo dove il resto del prodotto si aspetta di trovarli.
 */
export type InsightSeverity = GravitaAvviso;
export { livelloAvviso };
export type { LivelloAvviso };

export type ServiceInsight = {
  /** Stabile per tipo e soggetto: serve a non far ballare l'ordine fra due
   * aggiornamenti, e in futuro a ricordare cosa è stato ignorato. */
  id: string;
  kind:
    | "arrival_peak"
    | "table_collision"
    | "no_table_assigned"
    | "no_show_risk"
    | "missed_bookings"
    | "oversized_table"
    | "waitlist_match"
    | "freed_slot"
    | "shift_over_capacity"
    | "table_freeing_soon"
    | "table_overdue"
    | "rotation_slipping";
  severity: InsightSeverity;
  /** **Il problema**, in una riga: cosa sta succedendo. */
  title: string;
  /**
   * **Il motivo**: il fatto misurato da cui nasce l'avviso.
   *
   * Non «potrebbe esserci un ritardo», ma «Marta è seduta dalle 20:05 e la
   * durata misurata qui è 2 ore e 20». Un avviso di cui non si può verificare
   * la causa, la seconda volta non lo si legge.
   */
  motivo: string;
  /**
   * **L'impatto**: cosa cambia se nessuno fa niente, con i numeri che si
   * hanno.
   *
   * È la parte che mancava, e in un centro controllo è quella che decide se
   * vale la pena alzarsi: «quattro posti fermi mentre cinque persone
   * aspettano» è una frase su cui si agisce, «il tavolo è grande» no.
   *
   * Regola che ne è venuta fuori: **un avviso senza impatto non si mostra**.
   * Se un tavolo è oltre la durata ma nessuno lo aspetta e nessuno è in
   * lista, non è un problema: è una serata che va bene.
   */
  impatto: string;
  /** **L'azione**: dove si va per sistemarla. */
  action?: { label: string; href: string };
  /**
   * Fra quanti minuti questo avviso conta davvero. Zero = adesso.
   *
   * Decide **il livello** (`livelloAvviso`), quindi decide anche quanto grande
   * si mostra: quello che conta adesso o entro un quarto d'ora sta per esteso,
   * il resto sta in una riga. Per questo qui non va nient'altro che il tempo —
   * un ritardo di quaranta minuti conta adesso e scrive zero, non quaranta.
   *
   * A parità di livello ordina dentro il livello: fra due tavoli in scadenza,
   * prima quello che scade prima.
   */
  urgenza: number;
  /**
   * Il livello, quando il tempo da solo lo direbbe sbagliato.
   *
   * Normalmente si deriva da `urgenza` e dalla gravità. Lo scrive solo la
   * regola che sa qualcosa che il tempo non dice — vedi `lib/livello-avviso`.
   */
  livello?: LivelloAvviso;
};

/** Da quanti coperti in venti minuti un arrivo diventa un picco da segnalare. */
export const PEAK_COVERS = 12;
const PEAK_WINDOW_MIN = 20;

/** Ritardo oltre il quale vale la pena chiedersi se è un no-show. */
export const NO_SHOW_RISK_MIN = 25;

// La soglia sta in `lib/durata` perché la usa anche l'interfaccia.
export { NON_PIU_RITARDO_MIN };

/** Quanti ritardi si mostrano uno per uno prima di raggrupparli. */
const RITARDI_IN_EVIDENZA = 3;


/**
 * Quanto può scostarsi un posto liberato dall'ora che l'ospite aveva chiesto.
 *
 * Mezz'ora: chi ha chiesto le 20:30 accetta le 20:00 o le 21:00 e ringrazia;
 * chi si sente offrire le 22:30 capisce che non lo stiamo ascoltando.
 */
const TOLLERANZA_ORARIO_MIN = 30;

/**
 * Entro quanto deve cadere un posto liberato, per chi non ha chiesto un'ora.
 *
 * Chi è in lista senza orario sta aspettando **adesso**, in piedi: un tavolo
 * fra due ore non è una risposta alla sua attesa.
 */
const ATTESA_ACCETTABILE_MIN = 90;

/** Quante volte al massimo si verifica un posto liberato, per pagina. */
const MAX_VERIFICHE_POSTO = 5;

/** Da quanti posti in eccesso un tavolo è «sprecato», se qualcuno aspetta. */
const OVERSIZED_SPARE_SEATS = 3;

/** Quanto avanti si guarda per le collisioni. */
const HORIZON_MIN = 90;

/**
 * Quante cene chiuse servono, **stasera**, per dire qualcosa su stasera.
 *
 * Tre: sotto, è l'aneddoto di due tavoli. È lo stesso ragionamento del
 * minimo di dieci per la durata del locale, con il numero adattato al fatto
 * che una serata non può averne cento.
 */
export const MINIMO_CENE_STASERA = 3;

/**
 * Di quanto le cene di stasera devono scostarsi dal solito perché sia una
 * notizia.
 *
 * Venti minuti su una cena: sotto, è la differenza fra un martedì e un altro
 * martedì. Sopra, il secondo giro di tavoli slitta — ed è quello che il turno
 * successivo pagherà.
 */
export const SCOSTAMENTO_ROTAZIONE_MIN = 20;

/**
 * Entro quanto un tavolo «sta per liberarsi».
 *
 * Un quarto d'ora: il tempo di avvisare chi aspetta e di preparare il tavolo.
 * Mezz'ora sarebbe un annuncio senza urgenza, cinque minuti un annuncio
 * inutile — quando il tavolo si alza lo si vede.
 */
export const LIBERAZIONE_VICINA_MIN = 15;

/**
 * Da quanto oltre la durata prevista un tavolo diventa un avviso.
 *
 * Venti minuti: sotto è normale — un caffè, il conto che arriva — e un avviso
 * per ogni tavolo che sfora di cinque minuti sarebbe la pagina piena di
 * cartelli in ogni servizio.
 */
export const OLTRE_LA_DURATA_MIN = 20;

function oraLocale(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
    instant,
  );
}

/**
 * A parità di livello e di urgenza, prima il problema e poi l'occasione.
 *
 * Serve come **terzo** criterio, non come primo: dentro «adesso» finiscono sia
 * un tavolo scaduto sia una famiglia in attesa con un tavolo libero, entrambi
 * con urgenza zero, e senza questo l'ordine fra i due dipendeva da come li
 * avevano prodotti le regole — cioè cambiava senza motivo.
 */
const ORDINE: Record<InsightSeverity, number> = { warning: 0, opportunity: 1, info: 2 };

export async function getServiceInsights(
  venueId: string,
  opts: { now?: Date } = {},
): Promise<ServiceInsight[]> {
  const now = opts.now ?? new Date();
  const orizzonte = new Date(now.getTime() + HORIZON_MIN * 60_000);

  const [venue, bookings, live, coda, shifts, disdette, tables, chiuseStasera] = await Promise.all([
    db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
    db.booking.findMany({
      where: {
        venueId,
        startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
        deletedAt: null,
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
      include: {
        guest: { select: { firstName: true, lastName: true, noShowCount: true, totalVisits: true } },
        table: { select: { id: true, label: true, seats: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    getFloorLive(venueId, { now }),
    listWaitlist(venueId, { now }),
    db.shift.findMany({ where: { venueId, active: true } }),
    // Le disdette di oggi per un orario che deve ancora arrivare: sono
    // l'unica fonte di posti liberi che è anche una **notizia**. Un tavolo
    // libero da sempre non è successo niente; uno che si libera stasera sì.
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        status: "CANCELLED",
        startsAt: { gt: now, lte: endOfDay(now) },
        closedAt: { gte: startOfDay(now) },
      },
      include: { guest: { select: { firstName: true, lastName: true } } },
      orderBy: { startsAt: "asc" },
      take: 20,
    }),
    db.table.findMany({ where: { venueId, active: true }, select: { id: true, label: true, seats: true } }),
    /**
     * Le cene **già chiuse** di oggi: sono l'unica misura di quanto si sta a
     * tavola *stasera*. Le prenotazioni ancora sedute non dicono niente —
     * una cena in corso da un'ora può durarne due o quattro, e contarla
     * darebbe un numero che scende da solo col passare del servizio.
     */
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
        seatedAt: { not: null },
        closedAt: { not: null },
      },
      select: { seatedAt: true, closedAt: true },
    }),
  ]);

  const timezone = venue?.timezone ?? "Europe/Rome";
  const insights: ServiceInsight[] = [];
  const nome = (b: { guest: { firstName: string; lastName: string | null } | null }) =>
    b.guest ? `${b.guest.firstName}${b.guest.lastName ? ` ${b.guest.lastName}` : ""}` : "Senza nome";

  /* ---------------------------------------------------------------------- */
  /* 1. Picco di arrivi                                                     */
  /* ---------------------------------------------------------------------- */

  const inArrivo = bookings.filter(
    (b) =>
      (b.status === "CONFIRMED" || b.status === "PENDING") &&
      b.startsAt >= now &&
      b.startsAt <= orizzonte,
  );

  // Finestra scorrevole di venti minuti: si cerca il momento peggiore, non la
  // somma dell'ora — «trentasette persone in un'ora» non è un problema,
  // «trentasette in venti minuti» sì.
  let peggiore: { covers: number; da: Date; a: Date; bookings: typeof inArrivo } | null = null;
  for (const b of inArrivo) {
    const fine = new Date(b.startsAt.getTime() + PEAK_WINDOW_MIN * 60_000);
    const dentro = inArrivo.filter((x) => x.startsAt >= b.startsAt && x.startsAt < fine);
    const covers = dentro.reduce((n, x) => n + x.partySize, 0);
    if (!peggiore || covers > peggiore.covers) {
      peggiore = { covers, da: b.startsAt, a: fine, bookings: dentro };
    }
  }

  if (peggiore && peggiore.covers >= PEAK_COVERS) {
    insights.push({
      id: `arrival_peak:${peggiore.da.toISOString()}`,
      kind: "arrival_peak",
      severity: "warning",
      // Quanto manca: un picco fra dieci minuti viene prima di uno fra un'ora.
      urgenza: Math.max(0, Math.round((peggiore.da.getTime() - now.getTime()) / 60_000)),
      title: `Picco alle ${oraLocale(peggiore.da, timezone)}`,
      motivo: `Fra le ${oraLocale(peggiore.da, timezone)} e le ${oraLocale(peggiore.a, timezone)} arrivano ${
        peggiore.covers
      } persone su ${peggiore.bookings.length} ${
        peggiore.bookings.length === 1 ? "prenotazione" : "prenotazioni"
      }.`,
      impatto: `${peggiore.covers} coperti da accogliere in ${PEAK_WINDOW_MIN} minuti: è il momento in cui si formano le attese all'ingresso.`,
      action: { label: "Vedi gli arrivi", href: "/service" },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Collisioni: il tavolo non si libera in tempo                        */
  /* ---------------------------------------------------------------------- */

  for (const prossima of inArrivo) {
    if (!prossima.tableId) continue;
    const info = live.byTableId[prossima.tableId];
    const occupante = info?.current;
    if (!occupante || occupante.bookingId === prossima.id) continue;
    if (occupante.status !== "SEATED") continue;

    // `minutesToFree` è già relativo ad adesso: la fine prevista è adesso più
    // quello. Negativo significa che il tavolo è già oltre il previsto — e in
    // quel caso la collisione è certa, non probabile.
    const finePrevista = new Date(now.getTime() + (occupante.minutesToFree ?? 0) * 60_000);

    if (finePrevista.getTime() > prossima.startsAt.getTime()) {
      const ritardoAtteso = Math.round((finePrevista.getTime() - prossima.startsAt.getTime()) / 60_000);
      insights.push({
        id: `table_collision:${prossima.id}`,
        kind: "table_collision",
        urgenza: Math.max(0, Math.round((prossima.startsAt.getTime() - now.getTime()) / 60_000)),
        severity: "warning",
        title: `${prossima.table?.label ?? "Tavolo"} rischia di non liberarsi`,
        motivo: `${occupante.guestName} è ${
          occupante.liberoVerso
            ? frasePrevisione(occupante.liberoVerso, timezone).testo.replace("libero verso", "a tavola fino verso le")
            : `a tavola fino verso le ${oraLocale(finePrevista, timezone)}`
        }, e ${nome(prossima)} arriva alle ${oraLocale(prossima.startsAt, timezone)} sullo stesso tavolo.`,
        impatto: `${prossima.partySize} ${
          prossima.partySize === 1 ? "persona" : "persone"
        } in attesa per circa ${durataUmana(ritardoAtteso)} — in piedi, all'ingresso, mentre il tavolo si alza.`,
        action: { label: "Apri la sala", href: "/service/room" },
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Arrivi senza tavolo assegnato                                       */
  /* ---------------------------------------------------------------------- */

  const senzaTavolo = inArrivo.filter((b) => !b.tableId);
  const copertiSenzaTavolo = senzaTavolo.reduce((n, b) => n + b.partySize, 0);
  if (senzaTavolo.length > 0) {
    const liberi = Object.values(live.byTableId).filter((t) => t.status === "LIBERO").length;
    insights.push({
      id: `no_table_assigned:${senzaTavolo.length}`,
      kind: "no_table_assigned",
      severity: senzaTavolo.length > liberi ? "warning" : "info",
      // Da fare adesso: assegnare prima che arrivino.
      urgenza: 0,
      title: `${senzaTavolo.length} ${
        senzaTavolo.length === 1 ? "arrivo" : "arrivi"
      } senza tavolo assegnato`,
      motivo:
        senzaTavolo.length > liberi
          ? `${senzaTavolo.length} prenotazioni in arrivo entro ${durataUmana(
              HORIZON_MIN,
            )} non hanno un tavolo, e i tavoli liberi adesso sono ${liberi}.`
          : `${senzaTavolo.length} ${
              senzaTavolo.length === 1 ? "prenotazione" : "prenotazioni"
            } in arrivo entro ${durataUmana(HORIZON_MIN)} non ${
              senzaTavolo.length === 1 ? "ha" : "hanno"
            } ancora un tavolo.`,
      impatto:
        senzaTavolo.length > liberi
          ? `${senzaTavolo.length - liberi} ${
              senzaTavolo.length - liberi === 1 ? "gruppo" : "gruppi"
            } senza un posto dove metterlo: la scelta la farà qualcuno di corsa, con la gente davanti.`
          : `${copertiSenzaTavolo} ${
              copertiSenzaTavolo === 1 ? "coperto" : "coperti"
            } da sistemare mentre arrivano, invece che adesso con calma.`,
      action: { label: "Assegna dalla sala", href: "/service/room" },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Rischio no-show                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Due categorie diverse, non una.
   *
   * Chi è in ritardo **dentro** il servizio si recupera con una telefonata: un
   * avviso a testa, i più recenti per primi, perché sono quelli su cui la
   * telefonata funziona ancora.
   *
   * Chi manca da più di tre ore non è in ritardo: è una prenotazione da
   * chiudere. Otto cartelli identici che lo dicevano uno per uno rendevano
   * illeggibile la pagina — adesso è un avviso solo, con l'azione giusta.
   */
  const inRitardo: { b: (typeof bookings)[number]; ritardo: number }[] = [];
  const nonArrivate: typeof bookings = [];

  for (const b of bookings) {
    if (b.status !== "CONFIRMED" && b.status !== "PENDING") continue;
    const ritardo = Math.round((now.getTime() - b.startsAt.getTime()) / 60_000);
    if (ritardo < NO_SHOW_RISK_MIN) continue;
    if (ritardo >= NON_PIU_RITARDO_MIN) nonArrivate.push(b);
    else inRitardo.push({ b, ritardo });
  }

  /*
    I più recenti per primi: sono quelli su cui si può ancora fare qualcosa —
    e questo **è** l'ordine in cui vengono inseriti negli avvisi. Prima la
    preferenza era espressa mettendo il ritardo in `urgenza`, cioè nel campo
    che dice «fra quanti minuti conta»: un ritardo di quaranta minuti
    dichiarava di contare fra quaranta minuti, mentre conta adesso. Finché
    `urgenza` serviva solo a ordinare dentro la stessa gravità la bugia non si
    vedeva; da quando decide anche **quanto grande** si mostra un avviso, un
    ritardo di mezz'ora finiva fra le cose da guardare con calma.

    L'ordinamento in JavaScript è stabile: a parità di chiave resta l'ordine
    di inserimento, quindi i ritardi restano dal più recente al più vecchio
    senza bisogno di raccontare un'attesa che non esiste.
  */
  inRitardo.sort((x, y) => x.ritardo - y.ritardo);

  for (const { b, ritardo } of inRitardo.slice(0, RITARDI_IN_EVIDENZA)) {
    const storici = b.guest?.noShowCount ?? 0;
    insights.push({
      id: `no_show_risk:${b.id}`,
      kind: "no_show_risk",
      severity: "warning",
      // Conta adesso: la telefonata si fa ora o non serve più.
      urgenza: 0,
      /*
        Ma non è una decisione: è una telefonata.

        «Adesso» è lo spazio grande, e serve alle cose che si risolvono
        mettendo qualcuno da qualche parte — un tavolo libero con una famiglia
        in piedi, sei coperti senza tavolo. In una serata i ritardi sono
        quattro e le decisioni una: se i ritardi prendono lo spazio grande,
        quella decisione non si vede più. Provato sui dati veri, e si vedeva.
      */
      livello: "guarda",
      title: `${nome(b)} in ritardo di ${durataUmana(ritardo)}`,
      motivo:
        storici > 0
          ? `${b.partySize} ${b.partySize === 1 ? "persona" : "persone"} attese alle ${oraLocale(
              b.startsAt,
              timezone,
            )}, e questo cliente ha già ${storici} ${
              storici === 1 ? "assenza" : "assenze"
            } sulla sua scheda.`
          : `${b.partySize} ${b.partySize === 1 ? "persona" : "persone"} attese alle ${oraLocale(
              b.startsAt,
              timezone,
            )}, e non è ancora arrivato nessuno.`,
      impatto: b.table
        ? `Il ${b.table.label} resta bloccato: ${b.table.seats} posti fermi da ${durataUmana(
            ritardo,
          )}. Una telefonata adesso, o quel tavolo si rivende.`
        : `${b.partySize} ${
            b.partySize === 1 ? "coperto" : "coperti"
          } contati come occupati nel turno: se non vengono, si rivendono.`,
      action: { label: "Apri il servizio", href: "/service" },
    });
  }

  // Gli altri ritardi, se sono più di quelli mostrati: una riga sola.
  const restanti = inRitardo.length - RITARDI_IN_EVIDENZA;
  const copertiRestanti = inRitardo
    .slice(RITARDI_IN_EVIDENZA)
    .reduce((n, { b }) => n + b.partySize, 0);
  if (restanti > 0) {
    insights.push({
      id: "no_show_risk:altri",
      kind: "no_show_risk",
      severity: "warning",
      // Anche questi contano adesso, e sono la stessa telefonata: stessa
      // ragione, stesso livello.
      urgenza: 0,
      livello: "guarda",
      title:
        restanti === 1 ? "Un'altra prenotazione in ritardo" : `Altre ${restanti} prenotazioni in ritardo`,
      motivo: `Oltre a quelle qui sopra, altre ${restanti} hanno superato ${durataUmana(
        NO_SHOW_RISK_MIN,
      )} di ritardo.`,
      impatto: `${copertiRestanti} ${
        copertiRestanti === 1 ? "coperto" : "coperti"
      } di cui non si sa niente: finché restano aperti, il turno risulta più pieno di com'è.`,
      action: { label: "Apri il servizio", href: "/service" },
    });
  }

  if (nonArrivate.length > 0) {
    const coperti = nonArrivate.reduce((n, b) => n + b.partySize, 0);
    insights.push({
      id: "missed_bookings",
      kind: "missed_bookings",
      severity: "opportunity",
      // Non urgente: nessuno arriva più. È lavoro di chiusura, non di servizio.
      urgenza: 10_000,
      title:
        nonArrivate.length === 1
          ? "Una prenotazione non è mai arrivata"
          : `${nonArrivate.length} prenotazioni non sono mai arrivate`,
      motivo: `${coperti} ${coperti === 1 ? "coperto" : "coperti"} attesi da più di ${durataUmana(
        NON_PIU_RITARDO_MIN,
      )}: non è più un ritardo.`,
      impatto: `Finché non hanno un esito, quei ${coperti} ${
        coperti === 1 ? "coperto risulta" : "coperti risultano"
      } occupati: la capienza del turno sembra più piena di com'è, e i numeri della giornata non sono veri.`,
      action: { label: "Vedi le prenotazioni", href: "/bookings" },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Tavoli grandi occupati da pochi, mentre qualcuno aspetta            */
  /* ---------------------------------------------------------------------- */

  // Chi risulta in lista da mezza giornata non sta aspettando un tavolo: è una
  // riga che nessuno ha chiuso (vedi `ATTESA_DIMENTICATA_MIN`). Proporgli un
  // tavolo è un consiglio sbagliato dato con sicurezza.
  const gruppiInAttesa = coda.filter((e) => e.status !== "SEATED" && !e.dimenticata);
  const maxAttesa = gruppiInAttesa.length > 0 ? Math.max(...gruppiInAttesa.map((e) => e.partySize)) : 0;

  if (maxAttesa > 0) {
    for (const t of tables) {
      const info = live.byTableId[t.id];
      if (!info?.current || info.status !== "OCCUPATO") continue;
      const avanzo = t.seats - info.current.partySize;
      if (avanzo < OVERSIZED_SPARE_SEATS) continue;
      if (t.seats < maxAttesa) continue;

      const candidato = gruppiInAttesa.find((e) => e.partySize <= t.seats && e.partySize > info.current!.partySize);
      if (!candidato) continue;

      insights.push({
        id: `oversized_table:${t.id}`,
        kind: "oversized_table",
        severity: "opportunity",
        urgenza: 0,
        title: `${t.label} da ${t.seats} posti con ${info.current.partySize} persone`,
        motivo: `${info.current.guestName} occupa un ${t.seats} posti in ${
          info.current.partySize
        }, e in lista c'è ${candidato.guestName} in ${candidato.partySize}, che su questo tavolo ci starebbe.`,
        impatto: `${avanzo} posti fermi mentre ${candidato.partySize} ${
          candidato.partySize === 1 ? "persona aspetta" : "persone aspettano"
        } da ${durataUmana(candidato.waitingMin)}. Spostando ${
          info.current.guestName
        } su un tavolo più piccolo, il posto torna quello giusto.`,
        action: { label: "Apri la sala", href: "/service/room" },
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Tavolo libero e qualcuno che aspetta                                */
  /* ---------------------------------------------------------------------- */

  for (const e of gruppiInAttesa) {
    const compatibile = tables.find(
      (t) => t.seats >= e.partySize && live.byTableId[t.id]?.status === "LIBERO",
    );
    if (!compatibile) continue;

    insights.push({
      id: `waitlist_match:${e.id}`,
      kind: "waitlist_match",
      severity: "opportunity",
      // Il tavolo è libero adesso: aspettare lo spreca.
      urgenza: 0,
      title: `${compatibile.label} è libero per ${e.guestName}`,
      motivo: `${e.partySize} ${e.partySize === 1 ? "persona" : "persone"} in attesa da ${durataUmana(
        e.waitingMin,
      )}, e il ${compatibile.label} (${compatibile.seats} posti) è libero adesso.`,
      impatto: `${compatibile.seats} posti vuoti con qualcuno in piedi: ogni minuto in più è un tavolo che non incassa e un'attesa che non serve a niente.`,
      action: { label: "Accomoda dalla lista", href: "/service" },
    });
    // Una proposta per volta: proporre lo stesso tavolo a tre gruppi diversi
    // trasformerebbe un aiuto in rumore.
    break;
  }

  /* ---------------------------------------------------------------------- */
  /* 7. Una disdetta ha liberato un posto, e qualcuno lo aspetta            */
  /* ---------------------------------------------------------------------- */

  // Il tavolo che si libera all'ultimo è il ricavo che un ristorante perde
  // più spesso: nessuno ha il tempo di ripescare chi aveva detto di no.
  //
  // Tre condizioni prima di proporlo, e sono tutte necessarie:
  // l'ora deve avere senso per chi aspetta, il posto deve essere **ancora**
  // libero davvero (nel frattempo può averlo preso qualcun altro), e si dice
  // una cosa sola: la disdetta più vicina, non l'elenco delle disdette.
  // Quante volte al massimo si chiede al database «c'è ancora posto?»: ogni
  // domanda costa una lettura, e venti disdette in una serata storta
  // renderebbero lenta la pagina che deve aprirsi in fretta.
  let verifiche = 0;

  for (const disdetta of disdette) {
    if (verifiche >= MAX_VERIFICHE_POSTO) break;
    const candidato = gruppiInAttesa.find((e) => {
      if (e.partySize > disdetta.partySize) return false;
      if (e.desiredAt) {
        const scarto = Math.abs(disdetta.startsAt.getTime() - e.desiredAt.getTime()) / 60_000;
        return scarto <= Math.max(e.flexibilityMin, TOLLERANZA_ORARIO_MIN);
      }
      // Senza un'ora richiesta, l'attesa è adesso: vale solo un posto vicino.
      return (disdetta.startsAt.getTime() - now.getTime()) / 60_000 <= ATTESA_ACCETTABILE_MIN;
    });
    if (!candidato) continue;

    // La domanda vera non è «c'era una disdetta», è «c'è posto adesso».
    verifiche += 1;
    const esito = await checkAvailability(venueId, {
      startsAt: disdetta.startsAt,
      durationMin: disdetta.durationMin,
      partySize: candidato.partySize,
    });
    if (!esito.available) continue;

    const ora = oraLocale(disdetta.startsAt, timezone);
    insights.push({
      id: `freed_slot:${disdetta.id}`,
      kind: "freed_slot",
      severity: "opportunity",
      urgenza: Math.max(0, Math.round((disdetta.startsAt.getTime() - now.getTime()) / 60_000)),
      title: `Alle ${ora} si è liberato un posto per ${disdetta.partySize}`,
      motivo: `${nome(disdetta)} ha disdetto, e il posto delle ${ora} risulta ancora libero adesso.`,
      impatto: `${candidato.partySize} ${
        candidato.partySize === 1 ? "coperto" : "coperti"
      } che si riempiono invece di restare vuoti: in lista c'è ${candidato.guestName}, che aspetta da ${durataUmana(
        candidato.waitingMin,
      )}. Se nessuno lo offre, quel posto resta vuoto — è il ricavo che si perde più spesso.`,
      action: { label: "Offri il posto", href: "/waitlist" },
    });
    break;
  }

  /* ---------------------------------------------------------------------- */
  /* 8. Un tavolo sta per liberarsi, e qualcuno aspetta                     */
  /* ---------------------------------------------------------------------- */

  /**
   * L'avviso che si dà **prima**, non dopo.
   *
   * Le altre due opportunità guardano tavoli già liberi: questa guarda quelli
   * che si liberano fra un quarto d'ora. È la differenza fra «adesso corri» e
   * «fra dieci minuti sei pronto» — e in sala il secondo vale molto più del
   * primo, perché il tavolo si prepara mentre chi aspetta viene avvisato
   * invece che dopo.
   *
   * Si dice solo se **qualcuno ci starebbe davvero**: senza nessuno in
   * attesa, un tavolo che si libera è la normalità di una serata.
   */
  for (const t of tables) {
    const info = live.byTableId[t.id];
    const previsione = info?.current?.liberoVerso;
    if (!info?.current || !previsione) continue;
    if (previsione.minuti < 0 || previsione.minuti > LIBERAZIONE_VICINA_MIN) continue;

    const candidato = gruppiInAttesa.find((e) => e.partySize <= t.seats);
    if (!candidato) continue;

    // Se quel tavolo è già promesso a una prenotazione, non è un'opportunità:
    // è una collisione, e ce ne occupiamo sopra.
    if (info.next) continue;

    const frase = frasePrevisione(previsione, timezone);
    insights.push({
      id: `table_freeing_soon:${t.id}`,
      kind: "table_freeing_soon",
      severity: "opportunity",
      urgenza: previsione.minuti,
      title: `${t.label} si libera fra ${durataUmana(previsione.minuti)}`,
      motivo: `${info.current.guestName} è ${frase.testo.replace(
        "libero verso",
        "a tavola fino verso le",
      )}. ${frase.dettaglio}`,
      impatto: `${candidato.guestName} aspetta da ${durataUmana(
        candidato.waitingMin,
      )} in ${candidato.partySize}: avvisandolo adesso si siede appena il tavolo è pronto, invece di sentirselo dire dopo.`,
      action: { label: "Apri la sala", href: "/service/room" },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 9. Un tavolo è oltre la durata, e qualcuno lo aspetta                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Un tavolo oltre la durata **non è un problema in sé**.
   *
   * Se nessuno aspetta quel tavolo e non c'è nessuno in lista, gente che
   * resta a tavola è una serata che va bene: alzarli sarebbe il consiglio
   * peggiore che questo prodotto possa dare. Perciò l'avviso esce solo quando
   * c'è una conseguenza — è la regola che è venuta fuori scrivendo l'impatto,
   * e vale per tutti: **un avviso senza impatto non si mostra**.
   *
   * Il conto entra nel motivo perché cambia cosa si fa: un tavolo oltre con
   * il conto già alto sta finendo, uno con il conto ancora vuoto non è
   * nemmeno partito.
   */
  for (const t of tables) {
    const info = live.byTableId[t.id];
    const previsione = info?.current?.liberoVerso;
    if (!info?.current || !previsione) continue;
    if (previsione.minuti > -OLTRE_LA_DURATA_MIN) continue;

    const oltre = Math.abs(previsione.minuti);
    const conto = info.current.conto;
    const inAttesaQui = gruppiInAttesa.find((e) => e.partySize <= t.seats);

    // La conseguenza: o c'è chi arriva su questo tavolo, o c'è chi aspetta.
    // Se non c'è né l'uno né l'altro, non si dice niente.
    const conseguenza = info.next
      ? `Alle ${oraLocale(new Date(info.next.startsAt), timezone)} arriva ${info.next.guestName} in ${
          info.next.partySize
        } proprio su questo tavolo: se non si libera, l'attesa è già cominciata.`
      : inAttesaQui
        ? `${inAttesaQui.guestName} aspetta da ${durataUmana(inAttesaQui.waitingMin)} in ${
            inAttesaQui.partySize
          }, e su questo tavolo ci starebbe.`
        : null;
    if (!conseguenza) continue;

    const statoConto = conto
      ? conto.righe === 0
        ? "il conto è aperto e non è stato battuto niente"
        : `il conto è aperto con ${conto.righe} ${conto.righe === 1 ? "riga" : "righe"}`
      : "non c'è nessun conto aperto sul tavolo";

    insights.push({
      id: `table_overdue:${t.id}`,
      kind: "table_overdue",
      severity: "warning",
      // Più è oltre, più è urgente: `urgenza` cresce col tempo mancante, e qui
      // il tempo è già scaduto.
      urgenza: 0,
      title: `${t.label} è oltre di ${durataUmana(oltre)}`,
      motivo: `Il tavolo era previsto libero verso le ${oraLocale(
        new Date(previsione.fine),
        timezone,
      )} e ${info.current.guestName} è ancora a tavola: ${statoConto}. ${
        frasePrevisione(previsione, timezone).dettaglio
      }`,
      impatto: conseguenza,
      action: { label: "Apri la sala", href: "/service/room" },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 10. La rotazione sta slittando                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Stasera si sta a tavola più del solito, e il secondo giro slitta.
   *
   * È diverso dalle due regole sui tavoli: quelle guardano **un** tavolo,
   * questa guarda **il servizio**. Un tavolo oltre la durata è un caso; sei
   * tavoli che durano mezz'ora più del solito sono una serata che finirà in
   * ritardo, e chi accoglie può ancora fare qualcosa — avvisare chi arriva,
   * spostare qualcuno, smettere di promettere orari.
   *
   * Tre condizioni, e servono tutte:
   *
   * - **il locale sa quanto durano le sue cene** (almeno dieci misurate:
   *   `live.durata`). Senza quella, «più del solito» non ha un solito;
   * - **stasera ci sono almeno tre cene chiuse.** Sotto, è l'aneddoto di due
   *   tavoli, e un avviso costruito su due tavoli è rumore;
   * - **c'è una conseguenza**: qualcuno che arriva o qualcuno che aspetta. È
   *   la stessa regola di «oltre la durata»: un servizio lento con la sala
   *   mezza vuota non è un problema, è una serata tranquilla.
   */
  const durateStasera = chiuseStasera
    .map((b) => Math.round((b.closedAt!.getTime() - b.seatedAt!.getTime()) / 60_000))
    .filter((m) => m > 0)
    .sort((a, b) => a - b);

  if (live.durata && durateStasera.length >= MINIMO_CENE_STASERA) {
    const meta = Math.floor(durateStasera.length / 2);
    const medianaStasera =
      durateStasera.length % 2 === 1
        ? durateStasera[meta]
        : Math.round((durateStasera[meta - 1] + durateStasera[meta]) / 2);
    const scarto = medianaStasera - live.durata.medianaMin;

    // Chi paga il ritardo: chi arriva nei prossimi novanta minuti, o chi
    // aspetta in piedi. Se non c'è nessuno dei due, non si dice niente.
    const inArrivoDopo = inArrivo.length;
    const chiAspetta = gruppiInAttesa.length;

    if (scarto >= SCOSTAMENTO_ROTAZIONE_MIN && (inArrivoDopo > 0 || chiAspetta > 0)) {
      const conseguenza =
        inArrivoDopo > 0
          ? `${inArrivoDopo} ${
              inArrivoDopo === 1 ? "prenotazione arriva" : "prenotazioni arrivano"
            } entro ${durataUmana(HORIZON_MIN)}: con questo ritmo ${
              inArrivoDopo === 1 ? "trova" : "trovano"
            } il tavolo ancora occupato, e l'attesa comincia all'ingresso.`
          : `${chiAspetta} ${
              chiAspetta === 1 ? "gruppo aspetta" : "gruppi aspettano"
            } in lista: ogni cena che dura mezz'ora in più è mezz'ora in più della loro attesa.`;

      insights.push({
        id: `rotation_slipping:${medianaStasera}`,
        kind: "rotation_slipping",
        severity: "warning",
        // Non è un problema fra venti minuti: è già in corso.
        urgenza: 0,
        title: `Stasera le cene durano ${durataUmana(scarto)} più del solito`,
        motivo: `Le ${durateStasera.length} cene già chiuse stasera sono durate ${durataUmana(
          medianaStasera,
        )}, contro ${durataUmana(live.durata.medianaMin)} misurati su ${
          live.durata.misurate
        } cene di questo locale.`,
        impatto: conseguenza,
        action: { label: "Vedi gli arrivi", href: "/service" },
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 11. Turno oltre la capienza                                            */
  /* ---------------------------------------------------------------------- */

  const { weekday, minuteOfDay } = zonedDayAndMinute(now, timezone);
  const turno = findShiftFor(shifts, weekday, minuteOfDay);
  if (turno) {
    const inizioTurno = new Date(now.getTime() - (minuteOfDay - turno.startMinute) * 60_000);
    const fineTurno = new Date(now.getTime() + (turno.endMinute - minuteOfDay) * 60_000);
    const copertiTurno = bookings
      .filter((b) => b.startsAt >= inizioTurno && b.startsAt <= fineTurno && b.status !== "NO_SHOW")
      .reduce((n, b) => n + b.partySize, 0);

    if (copertiTurno > turno.capacity) {
      insights.push({
        id: `shift_over_capacity:${turno.id}`,
        kind: "shift_over_capacity",
        severity: "warning",
        urgenza: 60,
        title: `${turno.name}: ${copertiTurno} coperti su ${turno.capacity} di capienza`,
        motivo: `Il turno è oltre la capienza dichiarata di ${
          copertiTurno - turno.capacity
        } coperti. Può essere voluto: qualcuno ha forzato, o l'overbooking dichiarato lo permette.`,
        impatto: `${
          copertiTurno - turno.capacity
        } coperti in più di quanti la cucina e la sala sono state dichiarate capaci di servire: i tempi si allungano per tutti, non solo per gli ultimi arrivati.`,
        action: { label: "Vedi le prenotazioni", href: "/bookings" },
      });
    }
  }

  // Prima la gravità, poi **quanto manca**: fra due avvisi altrettanto gravi
  // conta quale dei due riguarda i prossimi minuti. Prima l'ordine dentro la
  // stessa gravità era quello di lettura delle prenotazioni, cioè nessuno.
  return insights.sort(
    (a, b) =>
      ORDINE_LIVELLI[livelloAvviso(a)] - ORDINE_LIVELLI[livelloAvviso(b)] ||
      a.urgenza - b.urgenza ||
      ORDINE[a.severity] - ORDINE[b.severity],
  );
}

/**
 * Le tre cose da sapere adesso.
 *
 * La Panoramica non deve diventare un deposito di avvisi: tre sono quelle che
 * una persona legge davvero prima di tornare al lavoro.
 */
export async function getTopServiceInsights(venueId: string, opts: { now?: Date; limit?: number } = {}) {
  const tutti = await getServiceInsights(venueId, opts);
  return tutti.slice(0, opts.limit ?? 3);
}
