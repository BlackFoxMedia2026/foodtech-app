import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "@/lib/utils";

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

async function getDayStats(venueId: string, day: Date, avgSpend: number) {
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
  const revenueCents = Math.round(avgSpend * totalCovers * 100);

  return { bookings, totalCovers, occupancyPct, revenueCents, noShowCount, service, capacity };
}

export async function getOverview(venueId: string, day: Date = new Date()) {
  const avgSpendAgg = await db.guest.aggregate({
    where: { venueId, totalVisits: { gt: 0 } },
    _avg: { totalSpend: true },
  });
  const avgSpend = Number(avgSpendAgg._avg.totalSpend ?? 45) || 45;

  const yesterday = new Date(day);
  yesterday.setDate(day.getDate() - 1);

  const [today, prev] = await Promise.all([
    getDayStats(venueId, day, avgSpend),
    getDayStats(venueId, yesterday, avgSpend),
  ]);

  const noShowProb = await db.guest.aggregate({
    where: { venueId, totalVisits: { gt: 0 } },
    _avg: { noShowCount: true },
  });
  const expectedNoShow = Math.round((noShowProb._avg.noShowCount ?? 0) * today.bookings.length * 0.1);

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

  // Alert operativi di oggi, contati dai dati reali della giornata
  const birthdays = today.bookings.filter(
    (b) => b.occasion === "BIRTHDAY" || (b.guest?.birthday && isSameCalendarDay(b.guest.birthday, day)),
  ).length;
  const pendingConfirmations = today.bookings.filter((b) => b.status === "PENDING").length;
  const allergies = today.bookings.filter((b) => b.guest?.allergies).length;
  const vip = today.bookings.filter(
    (b) => b.guest && (b.guest.loyaltyTier === "VIP" || b.guest.loyaltyTier === "AMBASSADOR"),
  ).length;

  return {
    todayBookings: today.bookings,
    totalCovers: today.totalCovers,
    occupancyPct: today.occupancyPct,
    capacity: today.capacity,
    serviceName: today.service?.name ?? null,
    estimatedRevenueCents: today.revenueCents,
    expectedNoShow,
    comparisons: {
      covers: pctChange(today.totalCovers, prev.totalCovers),
      revenue: pctChange(today.revenueCents, prev.revenueCents),
      occupancy: pctChange(today.occupancyPct, prev.occupancyPct),
      noShow: expectedNoShow - prev.noShowCount,
    },
    trend,
    weekComparisonPct,
    alertCounts: { birthdays, pendingConfirmations, allergies, vip },
  };
}
