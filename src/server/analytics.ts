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
  const slotMap: Record<string, number> = Object.fromEntries(buckets.map((b) => [b, 0]));
  bookings.forEach((b) => {
    const h = new Date(b.startsAt).getHours();
    const bucket =
      h < 14 ? "12-14" : h < 17 ? "14-17" : h < 19 ? "17-19" : h < 21 ? "19-21" : h < 23 ? "21-23" : "23+";
    slotMap[bucket] += b.partySize;
  });
  const slots = Object.entries(slotMap).map(([slot, covers]) => ({ slot, covers }));

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
    sources: sourcesData,
    newGuests,
    repeatGuests: repeat,
    avgSpendCents: Math.round(avgSpend * 100),
  };
}
