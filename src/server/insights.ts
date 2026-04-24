import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "@/lib/utils";

export async function getOverview(venueId: string, day: Date = new Date()) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const todayBookings = await db.booking.findMany({
    where: {
      venueId,
      startsAt: { gte: dayStart, lte: dayEnd },
      status: { not: "CANCELLED" },
    },
    include: { guest: true, table: true },
    orderBy: { startsAt: "asc" },
  });

  const totalCovers = todayBookings.reduce((s, b) => s + b.partySize, 0);

  const noShowProb = await db.guest.aggregate({
    where: { venueId, totalVisits: { gt: 0 } },
    _avg: { noShowCount: true },
  });
  const expectedNoShow = Math.round((noShowProb._avg.noShowCount ?? 0) * todayBookings.length * 0.1);

  const avgSpend = await db.guest.aggregate({
    where: { venueId, totalVisits: { gt: 0 } },
    _avg: { totalSpend: true },
  });
  const estimatedRevenueCents =
    Math.round(((Number(avgSpend._avg.totalSpend ?? 45) * totalCovers) || 45 * totalCovers) * 100);

  // Trend ultimi 7 giorni
  const weekAgo = new Date(dayStart);
  weekAgo.setDate(dayStart.getDate() - 6);

  const weekBookings = await db.booking.findMany({
    where: { venueId, startsAt: { gte: weekAgo, lte: dayEnd } },
    select: { startsAt: true, partySize: true, status: true },
  });

  const trend: { day: string; covers: number; bookings: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo);
    d.setDate(weekAgo.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const filtered = weekBookings.filter((b) => b.startsAt.toISOString().slice(0, 10) === key && b.status !== "CANCELLED");
    trend.push({
      day: d.toLocaleDateString("it-IT", { weekday: "short" }),
      covers: filtered.reduce((s, b) => s + b.partySize, 0),
      bookings: filtered.length,
    });
  }

  // Alert
  const alerts: { kind: "warn" | "info" | "danger"; message: string }[] = [];
  const overbooked = todayBookings.filter((b) => !b.tableId);
  if (overbooked.length > 0) {
    alerts.push({ kind: "warn", message: `${overbooked.length} prenotazioni senza tavolo assegnato` });
  }
  const vips = todayBookings.filter((b) => b.guest && (b.guest.loyaltyTier === "VIP" || b.guest.loyaltyTier === "AMBASSADOR"));
  if (vips.length > 0) {
    alerts.push({ kind: "info", message: `${vips.length} ospiti VIP attesi oggi` });
  }
  const allergens = todayBookings.filter((b) => b.guest?.allergies);
  if (allergens.length > 0) {
    alerts.push({ kind: "danger", message: `${allergens.length} ospiti con allergie segnalate` });
  }

  return {
    todayBookings,
    totalCovers,
    expectedNoShow,
    estimatedRevenueCents,
    trend,
    alerts,
  };
}
