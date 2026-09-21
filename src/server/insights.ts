import { db } from "@/lib/db";
import {
  DEFAULT_VENUE_TIMEZONE,
  dateKeyInVenue,
  giornataInVenue,
  shiftDateKey,
} from "@/lib/venue-time";
import { zonedCalendarDate, zonedDayAndMinute, zonedTimeToInstant } from "./availability";
import { assenzeAttese } from "./assenze-attese";
import { incassoDelGiorno } from "./orders";
import { capienzaDelGiorno, giornoDellaSettimana, quantoPieno } from "./capienza-giorno";

/**
 * La giornata **del locale**, non quella del server.
 *
 * Tutto questo file lavorava con `getDay()`, `getHours()` e `startOfDay`, che
 * rispondono nel fuso del processo: su Vercel è UTC. Domenica all'una di notte
 * a Roma è sabato 23:00 per il server, e la Panoramica mostrava la giornata di
 * **ieri** — coperti, occupazione, incasso stimato — fra mezzanotte e le due,
 * cioè nell'ora esatta in cui si chiudono i conti e un gestore guarda i numeri
 * della serata.
 *
 * `venue-time.ts` risolve questa cosa per il resto dell'applicazione dal 7
 * settembre; qui non era arrivata.
 */
function datiDaChiave(chiave: string): { year: number; month: number; day: number } {
  const [y, m, d] = chiave.split("-").map(Number);
  return { year: y!, month: m ?? 1, day: d ?? 1 };
}

/* La giornata del locale sta in `lib/venue-time.ts`: la chiedono anche
   l'agente e chi verrà dopo, e due copie della stessa aritmetica divergono. */
const giornata = giornataInVenue;

/**
 * Stesso giorno del calendario, **nel fuso del locale**.
 *
 * Un compleanno è una data senza ora, e confrontarla col fuso del processo
 * fa comparire (o sparire) la torta un giorno prima. Il mese e il giorno si
 * leggono dallo stesso formattatore, così non si mescolano due fusi.
 */
function isSameCalendarDay(a: Date, b: Date, fuso: string) {
  return dateKeyInVenue(a, fuso).slice(5) === dateKeyInVenue(b, fuso).slice(5);
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

async function getServiceWindow(venueId: string, day: Date, fuso: string) {
  const { weekday, minuteOfDay } = zonedDayAndMinute(day, fuso);
  const shifts = await db.shift.findMany({
    where: { venueId, weekday, active: true },
    orderBy: { startMinute: "asc" },
  });
  if (shifts.length === 0) return null;

  const nowMinutes = minuteOfDay;
  const current = shifts.find((s) => nowMinutes >= s.startMinute && nowMinutes <= s.endMinute);
  const next = shifts.find((s) => s.startMinute > nowMinutes);
  return current ?? next ?? shifts[shifts.length - 1];
}

async function getDayStats(venueId: string, day: Date, avgSpend: number | null, fuso: string) {
  const { inizio: dayStart, fine: dayEnd } = giornata(day, fuso);

  const [bookings, noShowCount, service, capacity] = await Promise.all([
    db.booking.findMany({
      where: { deletedAt: null, venueId, startsAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      include: { guest: true, table: true },
      orderBy: { startsAt: "asc" },
    }),
    db.booking.count({
      where: { deletedAt: null, venueId, startsAt: { gte: dayStart, lte: dayEnd }, status: "NO_SHOW" },
    }),
    getServiceWindow(venueId, day, fuso),
    /*
      La capienza della **giornata**, la stessa che usa la previsione. Qui si
      prendeva quella di un turno solo e ci si dividevano i coperti di tutto il
      giorno: con turni da 60 e 90, 75 coperti facevano 125%, e il tetto a
      cento lo mascherava in «100% pieno» mentre la previsione, per lo stesso
      giorno, diceva 44%. Vedi server/capienza-giorno.ts.
    */
    capienzaDelGiorno(venueId, day, fuso),
  ]);

  const totalCovers = bookings.reduce((s, b) => s + b.partySize, 0);
  const occupancyPct = quantoPieno(totalCovers, capacity);
  // Nullo quando il locale non ha dichiarato la spesa media: la Panoramica
  // mostra una casella vuota con l'invito a impostarla.
  const revenueCents = avgSpend != null ? Math.round(avgSpend * totalCovers * 100) : null;

  return { bookings, totalCovers, occupancyPct, revenueCents, noShowCount, service, capacity };
}

export async function getOverview(venueId: string, day: Date = new Date()) {
  /**
   * La stima degli incassi si basa sulla spesa media **dichiarata dal locale**.
   *
   * Prima veniva calcolata dalla media di `Guest.totalSpend`, un campo che
   * nessuna parte del codice aggiornava: erano valori del seed moltiplicati per
   * i coperti, e il risultato compariva in Panoramica come «Incassi stimati».
   * Un numero inventato presentato come dato.
   *
   * Adesso: se il locale ha dichiarato la spesa media si mostra la stima, detta
   * stima; altrimenti non si mostra nulla. Meglio una casella vuota che una
   * cifra falsa.
   */
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { avgSpendCents: true, timezone: true },
  });
  const avgSpend = venue?.avgSpendCents ? venue.avgSpendCents / 100 : null;
  /* Il fuso si legge **una volta** e si passa a tutti: lo si rileggeva più
     sotto per il solo incasso, e intanto il resto della Panoramica usava
     quello del server. */
  const fuso = venue?.timezone ?? DEFAULT_VENUE_TIMEZONE;

  /* Ieri è il giorno civile prima, nel fuso del locale: sottrarre 24 ore a un
     istante sbaglia la notte in cui l'ora cambia. Mezzogiorno perché è l'ora
     che non cade mai dentro un cambio d'ora. */
  const chiaveOggi = dateKeyInVenue(day, fuso);
  const yesterday = zonedTimeToInstant(datiDaChiave(shiftDateKey(chiaveOggi, -1)), 12 * 60, fuso);

  const [today, prev] = await Promise.all([
    getDayStats(venueId, day, avgSpend, fuso),
    getDayStats(venueId, yesterday, avgSpend, fuso),
  ]);

  /**
   * Assenze attese: la quota storica di no-show di questo locale applicata
   * alle prenotazioni di oggi. Il calcolo sta in `server/assenze-attese.ts`
   * perché lo stesso numero si legge anche in Prenotazioni, accanto al
   * conteggio della giornata.
   */
  const expectedNoShow = await assenzeAttese({
    venueId,
    prenotazioni: today.bookings.length,
    oggi: day,
  });

  /*
    Andamento degli ultimi sette giorni, contato sui **giorni del locale**.

    Prima i sacchetti erano le date UTC (`toISOString().slice(0, 10)`): una
    cena delle 23:30 a Roma finiva nel giorno dopo, e d'estate bastavano le
    22:00. Il grafico spostava i coperti della sera su domani, tutti i giorni.
  */
  const chiavi = Array.from({ length: 7 }, (_, i) => shiftDateKey(chiaveOggi, i - 6));
  const inizioSettimana = zonedTimeToInstant(datiDaChiave(chiavi[0]!), 0, fuso);
  const { fine: fineOggi } = giornata(day, fuso);
  const weekBookings = await db.booking.findMany({
    where: { deletedAt: null, venueId, startsAt: { gte: inizioSettimana, lte: fineOggi } },
    select: { startsAt: true, partySize: true, status: true },
  });

  const trend: { day: string; covers: number; bookings: number }[] = [];
  for (const key of chiavi) {
    const filtered = weekBookings.filter(
      (b) => dateKeyInVenue(b.startsAt, fuso) === key && b.status !== "CANCELLED",
    );
    const d = zonedTimeToInstant(datiDaChiave(key), 12 * 60, fuso);
    trend.push({
      day: new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: fuso }).format(d),
      covers: filtered.reduce((s, b) => s + b.partySize, 0),
      bookings: filtered.length,
    });
  }
  const lastWeekAvgCovers = trend.slice(0, 6).reduce((s, t) => s + t.covers, 0) / 6 || 0;
  const todayCovers = trend[trend.length - 1]?.covers ?? today.totalCovers;
  const weekComparisonPct = pctChange(todayCovers, lastWeekAvgCovers);

  // L'incasso vero della giornata: la somma dei conti chiusi.
  const incassoOggi = await incassoDelGiorno(venueId, chiaveOggi, fuso);

  // Alert operativi di oggi, contati dai dati reali della giornata
  const birthdays = today.bookings.filter(
    (b) => b.occasion === "BIRTHDAY" || (b.guest?.birthday && isSameCalendarDay(b.guest.birthday, day, fuso)),
  ).length;
  const pendingConfirmations = today.bookings.filter((b) => b.status === "PENDING").length;
  const allergies = today.bookings.filter((b) => b.guest?.allergies).length;
  const vip = today.bookings.filter(
    (b) => b.guest && (b.guest.loyaltyTier === "VIP" || b.guest.loyaltyTier === "AMBASSADOR"),
  ).length;

  /**
   * Il momento più affollato della giornata, se c'è.
   *
   * Finestra di venti minuti, come nel centro controllo: «trentasette persone
   * in un'ora» non è un problema, «trentasette in venti minuti» sì. Non
   * richiede nessun dato nuovo.
   *
   * Porta anche `inizio`, l'istante da cui parte la finestra — che è sempre
   * lo `startsAt` di una prenotazione vera, perché la finestra si apre su una
   * di esse. Serve a «Prenotazioni di oggi» per segnare il punto **dentro la
   * lista** invece di dirlo in una frase a parte. Va passato come istante e
   * non come `ora` già scritta: `ora` è formattata nel fuso del locale,
   * `formatTime` nella timeline no, e su un locale in un altro fuso le due
   * stringhe non coinciderebbero.
   */
  const presenti = today.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "NO_SHOW");
  let picco: { ora: string; inizio: Date; coperti: number } | null = null;
  for (const b of presenti) {
    const fine = new Date(b.startsAt.getTime() + 20 * 60_000);
    const coperti = presenti
      .filter((x) => x.startsAt >= b.startsAt && x.startsAt < fine)
      .reduce((n, x) => n + x.partySize, 0);
    if (!picco || coperti > picco.coperti) {
      picco = {
        inizio: b.startsAt,
        ora: new Intl.DateTimeFormat("it-IT", {
          timeZone: fuso,
          hour: "2-digit",
          minute: "2-digit",
        }).format(b.startsAt),
        coperti,
      };
    }
  }
  // Un «picco» che coincide con l'intera giornata non è un picco.
  if (picco && (picco.coperti < 6 || picco.coperti === today.totalCovers)) picco = null;

  return {
    picco,
    todayBookings: today.bookings,
    totalCovers: today.totalCovers,
    occupancyPct: today.occupancyPct,
    capacity: today.capacity,
    serviceName: today.service?.name ?? null,
    estimatedRevenueCents: today.revenueCents,
    /**
     * L'incasso vero, quando c'è.
     *
     * Da qui in poi la Panoramica smette di stimare **appena qualcuno chiude
     * un conto**: finché nessuno lo fa, resta la stima dichiarata (coperti per
     * scontrino medio) e si chiama stima. Le due cose non si sommano e non si
     * mescolano — sono risposte a due domande diverse, e confonderle
     * riporterebbe il numero inventato da cui siamo partiti.
     */
    incasso: incassoOggi,
    expectedNoShow,
    comparisons: {
      covers: pctChange(today.totalCovers, prev.totalCovers),
      // Senza spesa media dichiarata non c'è stima, quindi non c'è confronto.
      revenue:
        today.revenueCents != null && prev.revenueCents != null
          ? pctChange(today.revenueCents, prev.revenueCents)
          : null,
      /* Senza capienza dichiarata non c'è percentuale, quindi non c'è
         confronto: prima si divideva per 90 inventati e il confronto usciva
         comunque. */
      occupancy:
        today.occupancyPct != null && prev.occupancyPct != null
          ? pctChange(today.occupancyPct, prev.occupancyPct)
          : null,
      noShow: expectedNoShow - prev.noShowCount,
    },
    trend,
    weekComparisonPct,
    alertCounts: { birthdays, pendingConfirmations, allergies, vip },
  };
}
