import { db } from "@/lib/db";

const SLOT_BUCKETS = ["12-14", "14-17", "17-19", "19-21", "21-23", "23+"] as const;
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type BookingRow = {
  partySize: number;
  status: string;
  guestId: string | null;
  startsAt: Date;
  source: string;
};

function bucketOf(startsAt: Date) {
  const h = new Date(startsAt).getHours();
  return h < 14 ? "12-14" : h < 17 ? "14-17" : h < 19 ? "17-19" : h < 21 ? "19-21" : h < 23 ? "21-23" : "23+";
}

async function fetchBookingsInRange(venueId: string, from: Date, to: Date): Promise<BookingRow[]> {
  return db.booking.findMany({
    where: { venueId, startsAt: { gte: from, lt: to } },
    select: { partySize: true, status: true, guestId: true, startsAt: true, source: true },
  });
}

function coreMetrics(bookings: BookingRow[]) {
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

function slotsOf(bookings: BookingRow[]) {
  const slotMap: Record<string, number> = Object.fromEntries(SLOT_BUCKETS.map((b) => [b, 0]));
  bookings.forEach((b) => {
    slotMap[bucketOf(b.startsAt)] += b.partySize;
  });
  return Object.entries(slotMap).map(([slot, covers]) => ({ slot, covers }));
}

function heatmapOf(bookings: BookingRow[]) {
  const heatmapMap: Record<string, number> = {};
  for (const weekday of WEEKDAY_LABELS) {
    for (const slot of SLOT_BUCKETS) heatmapMap[`${weekday}|${slot}`] = 0;
  }
  bookings.forEach((b) => {
    const jsDay = new Date(b.startsAt).getDay();
    const weekday = WEEKDAY_LABELS[(jsDay + 6) % 7];
    heatmapMap[`${weekday}|${bucketOf(b.startsAt)}`] += b.partySize;
  });
  return Object.entries(heatmapMap).map(([key, covers]) => {
    const [weekday, slot] = key.split("|");
    return { weekday, slot, covers };
  });
}

function sourcesOf(bookings: BookingRow[]) {
  const sources: Record<string, number> = {};
  bookings.forEach((b) => {
    sources[b.source] = (sources[b.source] ?? 0) + 1;
  });
  return Object.entries(sources).map(([source, count]) => ({ source, count }));
}

async function guestMetrics(bookings: BookingRow[], from: Date, to: Date) {
  const guestIds = Array.from(
    new Set(bookings.map((b) => b.guestId).filter((id): id is string => Boolean(id))),
  );
  const guests = guestIds.length
    ? await db.guest.findMany({
        where: { id: { in: guestIds } },
        select: { totalSpend: true, totalVisits: true, createdAt: true },
      })
    : [];

  const newGuests = guests.filter((g) => g.createdAt >= from && g.createdAt < to).length;
  const repeatGuests = guests.filter((g) => g.totalVisits > 1).length;
  const avgSpendCents = guests.length
    ? Math.round(
        (guests.reduce((s, g) => s + Number(g.totalSpend) / Math.max(g.totalVisits, 1), 0) / guests.length) * 100,
      )
    : 0;

  return { newGuests, repeatGuests, totalGuests: guests.length, avgSpendCents };
}

export async function getAnalytics(venueId: string, from: Date, to: Date) {
  const bookings = await fetchBookingsInRange(venueId, from, to);
  const gm = await guestMetrics(bookings, from, to);

  return {
    ...coreMetrics(bookings),
    ...gm,
    slots: slotsOf(bookings),
    heatmap: heatmapOf(bookings),
    sources: sourcesOf(bookings),
  };
}

export async function getPreviousPeriodMetrics(venueId: string, from: Date, to: Date) {
  const lengthMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - lengthMs);
  const prevTo = from;

  const bookings = await fetchBookingsInRange(venueId, prevFrom, prevTo);
  const gm = await guestMetrics(bookings, prevFrom, prevTo);

  return { ...coreMetrics(bookings), ...gm };
}

export type PeriodMetrics = Awaited<ReturnType<typeof getPreviousPeriodMetrics>>;
