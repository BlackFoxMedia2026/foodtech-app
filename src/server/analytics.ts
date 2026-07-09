import { db } from "@/lib/db";

export async function getAnalytics(venueId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [bookings, guests] = await Promise.all([
    db.booking.findMany({
      where: { venueId, startsAt: { gte: since } },
      select: { partySize: true, startsAt: true, status: true, source: true, guestId: true },
    }),
    db.guest.findMany({
      where: { venueId },
      select: { totalVisits: true, totalSpend: true, createdAt: true, lastVisitAt: true },
    }),
  ]);

  const total = bookings.length || 1;
  const completed = bookings.filter((b) => b.status === "COMPLETED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;

  const occupancyRate = Math.round((completed / total) * 100);
  const noShowRate = Math.round((noShow / total) * 100);
  const cancelRate = Math.round((cancelled / total) * 100);

  // Coperti per fascia oraria
  const buckets = ["12-14", "14-17", "17-19", "19-21", "21-23", "23+"] as const;
  const bucketOf = (startsAt: Date) => {
    const h = new Date(startsAt).getHours();
    return h < 14 ? "12-14" : h < 17 ? "14-17" : h < 19 ? "17-19" : h < 21 ? "19-21" : h < 23 ? "21-23" : "23+";
  };
  const slotMap: Record<string, number> = Object.fromEntries(buckets.map((b) => [b, 0]));
  bookings.forEach((b) => {
    slotMap[bucketOf(b.startsAt)] += b.partySize;
  });
  const slots = Object.entries(slotMap).map(([slot, covers]) => ({ slot, covers }));

  // Domanda per giorno della settimana × fascia oraria
  const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const heatmapMap: Record<string, number> = {};
  for (const weekday of WEEKDAY_LABELS) {
    for (const slot of buckets) heatmapMap[`${weekday}|${slot}`] = 0;
  }
  bookings.forEach((b) => {
    const jsDay = new Date(b.startsAt).getDay();
    const weekday = WEEKDAY_LABELS[(jsDay + 6) % 7];
    heatmapMap[`${weekday}|${bucketOf(b.startsAt)}`] += b.partySize;
  });
  const heatmap = Object.entries(heatmapMap).map(([key, covers]) => {
    const [weekday, slot] = key.split("|");
    return { weekday, slot, covers };
  });

  // Fonti
  const sources: Record<string, number> = {};
  bookings.forEach((b) => {
    sources[b.source] = (sources[b.source] ?? 0) + 1;
  });
  const sourcesData = Object.entries(sources).map(([source, count]) => ({ source, count }));

  // Nuovi vs ricorrenti
  const newGuests = guests.filter((g) => g.createdAt >= since).length;
  const repeat = guests.filter((g) => g.totalVisits > 1).length;

  // ARPC (avg revenue per cover)
  const avgSpend = guests.length
    ? guests.reduce((s, g) => s + Number(g.totalSpend), 0) /
      guests.reduce((s, g) => s + Math.max(g.totalVisits, 1), 0)
    : 45;

  return {
    occupancyRate,
    noShowRate,
    cancelRate,
    slots,
    heatmap,
    sources: sourcesData,
    newGuests,
    repeatGuests: repeat,
    avgSpendCents: Math.round(avgSpend * 100),
  };
}

async function computePeriodMetrics(venueId: string, from: Date, to: Date) {
  const bookings = await db.booking.findMany({
    where: { venueId, startsAt: { gte: from, lt: to } },
    select: { partySize: true, status: true },
  });
  const total = bookings.length;
  const covers = bookings.reduce((s, b) => s + b.partySize, 0);
  const completed = bookings.filter((b) => b.status === "COMPLETED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;

  return {
    bookings: total,
    covers,
    occupancyRate: total ? Math.round((completed / total) * 100) : 0,
    noShowRate: total ? Math.round((noShow / total) * 100) : 0,
    cancelRate: total ? Math.round((cancelled / total) * 100) : 0,
  };
}

export async function getPeriodComparison(venueId: string, from: Date, to: Date) {
  const lengthMs = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - lengthMs);

  const [current, previous] = await Promise.all([
    computePeriodMetrics(venueId, from, to),
    computePeriodMetrics(venueId, prevFrom, prevTo),
  ]);

  return { current, previous };
}
