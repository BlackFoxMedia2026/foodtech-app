import { db } from "@/lib/db";
import { NON_PIU_RITARDO_MIN, durataUmana } from "@/lib/durata";
import { endOfDay, startOfDay } from "@/lib/utils";
import { findShiftFor, zonedDayAndMinute } from "./availability";
import { getFloorLive } from "./floor-live";
import { listWaitlist } from "./waitlist";

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

export type InsightSeverity = "warning" | "opportunity" | "info";

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
    | "shift_over_capacity";
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Dove si va per agire. */
  action?: { label: string; href: string };
  /**
   * Fra quanti minuti questo avviso conta davvero. Zero = adesso.
   *
   * Serve a ordinare **dentro** la stessa gravità: fra otto ritardi, quello di
   * venti minuti si recupera con una telefonata, quello di sette ore no. Prima
   * l'ordine era quello di lettura delle prenotazioni, cioè nessun ordine.
   */
  urgenza: number;
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


/** Da quanti posti in eccesso un tavolo è «sprecato», se qualcuno aspetta. */
const OVERSIZED_SPARE_SEATS = 3;

/** Quanto avanti si guarda per le collisioni. */
const HORIZON_MIN = 90;

function oraLocale(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
    instant,
  );
}

const ORDINE: Record<InsightSeverity, number> = { warning: 0, opportunity: 1, info: 2 };

export async function getServiceInsights(
  venueId: string,
  opts: { now?: Date } = {},
): Promise<ServiceInsight[]> {
  const now = opts.now ?? new Date();
  const orizzonte = new Date(now.getTime() + HORIZON_MIN * 60_000);

  const [venue, bookings, live, coda, shifts, tables] = await Promise.all([
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
    db.table.findMany({ where: { venueId, active: true }, select: { id: true, label: true, seats: true } }),
  ]);

  const timezone = venue?.timezone ?? "Europe/Rome";
  const insights: ServiceInsight[] = [];
  const nome = (b: (typeof bookings)[number]) =>
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
      detail: `Fra le ${oraLocale(peggiore.da, timezone)} e le ${oraLocale(peggiore.a, timezone)} arrivano ${
        peggiore.covers
      } persone su ${peggiore.bookings.length} ${
        peggiore.bookings.length === 1 ? "prenotazione" : "prenotazioni"
      }. Prepara l'accoglienza: è il momento in cui si formano le attese.`,
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
        detail: `${nome(prossima)} arriva alle ${oraLocale(prossima.startsAt, timezone)} sul ${
          prossima.table?.label ?? "tavolo"
        }, dove ${occupante.guestName} è seduto fino a circa le ${oraLocale(finePrevista, timezone)} — ${durataUmana(ritardoAtteso)} oltre. Sposta uno dei due o preparati a farli attendere.`,
        action: { label: "Apri la sala", href: "/service/room" },
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Arrivi senza tavolo assegnato                                       */
  /* ---------------------------------------------------------------------- */

  const senzaTavolo = inArrivo.filter((b) => !b.tableId);
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
      detail:
        senzaTavolo.length > liberi
          ? `Ci sono ${senzaTavolo.length} prenotazioni in arrivo senza tavolo e solo ${liberi} tavoli liberi. Assegnale adesso, prima che si accumulino all'ingresso.`
          : `${senzaTavolo.length} prenotazioni in arrivo non hanno ancora un tavolo. Assegnarle prima riduce i tempi all'ingresso.`,
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

  // I più recenti per primi: sono quelli su cui si può ancora fare qualcosa.
  inRitardo.sort((x, y) => x.ritardo - y.ritardo);

  for (const { b, ritardo } of inRitardo.slice(0, RITARDI_IN_EVIDENZA)) {
    const storici = b.guest?.noShowCount ?? 0;
    insights.push({
      id: `no_show_risk:${b.id}`,
      kind: "no_show_risk",
      severity: "warning",
      urgenza: ritardo,
      title: `${nome(b)} in ritardo di ${durataUmana(ritardo)}`,
      detail:
        storici > 0
          ? `${b.partySize} ${b.partySize === 1 ? "persona" : "persone"} attese alle ${oraLocale(
              b.startsAt,
              timezone,
            )}. Questo cliente ha già ${storici} ${storici === 1 ? "assenza" : "assenze"} alle spalle: vale una telefonata prima di liberare il tavolo.`
          : `${b.partySize} ${b.partySize === 1 ? "persona" : "persone"} attese alle ${oraLocale(
              b.startsAt,
              timezone,
            )}. Una telefonata adesso: se non vengono, quel tavolo si rivende.`,
      action: { label: "Apri il servizio", href: "/service" },
    });
  }

  // Gli altri ritardi, se sono più di quelli mostrati: una riga sola.
  const restanti = inRitardo.length - RITARDI_IN_EVIDENZA;
  if (restanti > 0) {
    insights.push({
      id: "no_show_risk:altri",
      kind: "no_show_risk",
      severity: "warning",
      urgenza: inRitardo[RITARDI_IN_EVIDENZA].ritardo,
      title:
        restanti === 1 ? "Un'altra prenotazione in ritardo" : `Altre ${restanti} prenotazioni in ritardo`,
      detail: `Oltre a quelle qui sopra. Le trovi tutte nell'elenco del servizio, dalla più recente.`,
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
      detail: `${coperti} ${coperti === 1 ? "coperto" : "coperti"} attesi da più di ${durataUmana(
        NON_PIU_RITARDO_MIN,
      )}: non è più un ritardo. Segnale come assenti o annullale, così i numeri della giornata restano veri.`,
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
        detail: `In lista d'attesa c'è ${candidato.guestName} in ${candidato.partySize}, che su questo tavolo ci starebbe. Se ${info.current.guestName} può spostarsi su un tavolo più piccolo, liberi il posto giusto.`,
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
      detail: `${e.partySize} ${e.partySize === 1 ? "persona" : "persone"} in attesa da ${durataUmana(
        e.waitingMin,
      )}, e il ${compatibile.label} (${compatibile.seats} posti) è libero adesso.`,
      action: { label: "Accomoda dalla lista", href: "/service" },
    });
    // Una proposta per volta: proporre lo stesso tavolo a tre gruppi diversi
    // trasformerebbe un aiuto in rumore.
    break;
  }

  /* ---------------------------------------------------------------------- */
  /* 7. Turno oltre la capienza                                             */
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
        detail: `Il turno è oltre la capienza dichiarata di ${
          copertiTurno - turno.capacity
        } coperti. Può essere voluto — qualcuno ha forzato — ma vale sapere che i tempi si allungheranno.`,
        action: { label: "Vedi le prenotazioni", href: "/bookings" },
      });
    }
  }

  // Prima la gravità, poi **quanto manca**: fra due avvisi altrettanto gravi
  // conta quale dei due riguarda i prossimi minuti. Prima l'ordine dentro la
  // stessa gravità era quello di lettura delle prenotazioni, cioè nessuno.
  return insights.sort(
    (a, b) => ORDINE[a.severity] - ORDINE[b.severity] || a.urgenza - b.urgenza,
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
