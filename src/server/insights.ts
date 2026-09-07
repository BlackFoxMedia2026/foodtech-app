import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "@/lib/utils";
import { dateKeyInVenue } from "@/lib/venue-time";
import { incassoDelGiorno } from "./orders";

function isSameCalendarDay(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

async function getServiceWindow(venueId: string, day: Date) {
  const shifts = await db.shift.findMany({
    where: { venueId, weekday: day.getDay(), active: true },
    orderBy: { startMinute: "asc" },
  });
  if (shifts.length === 0) return null;

  const nowMinutes = day.getHours() * 60 + day.getMinutes();
  const current = shifts.find((s) => nowMinutes >= s.startMinute && nowMinutes <= s.endMinute);
  const next = shifts.find((s) => s.startMinute > nowMinutes);
  return current ?? next ?? shifts[shifts.length - 1];
}

async function getDayStats(venueId: string, day: Date, avgSpend: number | null) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const [bookings, noShowCount, service] = await Promise.all([
    db.booking.findMany({
      where: { venueId, startsAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      include: { guest: true, table: true },
      orderBy: { startsAt: "asc" },
    }),
    db.booking.count({
      where: { venueId, startsAt: { gte: dayStart, lte: dayEnd }, status: "NO_SHOW" },
    }),
    getServiceWindow(venueId, day),
  ]);

  const totalCovers = bookings.reduce((s, b) => s + b.partySize, 0);
  const capacity = service?.capacity ?? 90;
  const occupancyPct = Math.min(100, Math.round((totalCovers / capacity) * 100));
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
    select: { avgSpendCents: true },
  });
  const avgSpend = venue?.avgSpendCents ? venue.avgSpendCents / 100 : null;

  const yesterday = new Date(day);
  yesterday.setDate(day.getDate() - 1);

  const [today, prev] = await Promise.all([
    getDayStats(venueId, day, avgSpend),
    getDayStats(venueId, yesterday, avgSpend),
  ]);

  /**
   * Assenze attese: la quota storica di no-show di questo locale applicata
   * alle prenotazioni di oggi. Prima si moltiplicava la media di
   * `Guest.noShowCount` (mai aggiornato) per un fattore 0,1 scelto a occhio.
   * Ora è una proporzione su fatti: quante prenotazioni sono finite in assenza
   * negli ultimi novanta giorni.
   */
  const novantaGiorni = new Date(startOfDay(day));
  novantaGiorni.setDate(novantaGiorni.getDate() - 90);
  const [storiche, storicheAssenti] = await Promise.all([
    db.booking.count({
      where: { venueId, startsAt: { gte: novantaGiorni, lt: startOfDay(day) }, status: { not: "CANCELLED" } },
    }),
    db.booking.count({
      where: { venueId, startsAt: { gte: novantaGiorni, lt: startOfDay(day) }, status: "NO_SHOW" },
    }),
  ]);
  const quotaAssenze = storiche > 0 ? storicheAssenti / storiche : 0;
  const expectedNoShow = Math.round(quotaAssenze * today.bookings.length);

  // Trend ultimi 7 giorni (per il grafico "Andamento settimanale")
  const weekAgo = new Date(startOfDay(day));
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekBookings = await db.booking.findMany({
    where: { venueId, startsAt: { gte: weekAgo, lte: endOfDay(day) } },
    select: { startsAt: true, partySize: true, status: true },
  });

  const trend: { day: string; covers: number; bookings: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo);
    d.setDate(weekAgo.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const filtered = weekBookings.filter(
      (b) => b.startsAt.toISOString().slice(0, 10) === key && b.status !== "CANCELLED",
    );
    trend.push({
      day: d.toLocaleDateString("it-IT", { weekday: "short" }),
      covers: filtered.reduce((s, b) => s + b.partySize, 0),
      bookings: filtered.length,
    });
  }
  const lastWeekAvgCovers = trend.slice(0, 6).reduce((s, t) => s + t.covers, 0) / 6 || 0;
  const todayCovers = trend[trend.length - 1]?.covers ?? today.totalCovers;
  const weekComparisonPct = pctChange(todayCovers, lastWeekAvgCovers);

  // L'incasso vero della giornata: la somma dei conti chiusi.
  const venueFuso = await db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } });
  const fuso = venueFuso?.timezone ?? "Europe/Rome";
  const incassoOggi = await incassoDelGiorno(venueId, dateKeyInVenue(day, fuso), fuso);

  // Alert operativi di oggi, contati dai dati reali della giornata
  const birthdays = today.bookings.filter(
    (b) => b.occasion === "BIRTHDAY" || (b.guest?.birthday && isSameCalendarDay(b.guest.birthday, day)),
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
   * in un'ora» non è un problema, «trentasette in venti minuti» sì. Serve alla
   * frase del briefing — quella che un direttore direbbe alla brigata prima di
   * aprire — e non richiede nessun dato nuovo.
   */
  const presenti = today.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "NO_SHOW");
  let picco: { ora: string; coperti: number } | null = null;
  for (const b of presenti) {
    const fine = new Date(b.startsAt.getTime() + 20 * 60_000);
    const coperti = presenti
      .filter((x) => x.startsAt >= b.startsAt && x.startsAt < fine)
      .reduce((n, x) => n + x.partySize, 0);
    if (!picco || coperti > picco.coperti) {
      picco = {
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
      occupancy: pctChange(today.occupancyPct, prev.occupancyPct),
      noShow: expectedNoShow - prev.noShowCount,
    },
    trend,
    weekComparisonPct,
    alertCounts: { birthdays, pendingConfirmations, allergies, vip },
  };
}
