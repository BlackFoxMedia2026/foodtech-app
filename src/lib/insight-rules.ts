import { computeDelta } from "./period-delta";

interface SlotDatum {
  slot: string;
  covers: number;
}

interface HeatmapDatum {
  weekday: string;
  slot: string;
  covers: number;
}

interface SourceDatum {
  source: string;
  count: number;
}

interface CoreMetrics {
  bookings: number;
  covers: number;
  noShowRate: number;
  totalGuests: number;
  repeatGuests: number;
}

interface InsightInput {
  current: CoreMetrics;
  previous: CoreMetrics;
  slots: SlotDatum[];
  heatmap: HeatmapDatum[];
  sources: SourceDatum[];
  sourceLabels: Record<string, string>;
}

const WEEKEND = new Set(["Sab", "Dom"]);
const MIN_BOOKINGS_FOR_INSIGHTS = 3;

export function generateInsights({ current, previous, slots, heatmap, sources, sourceLabels }: InsightInput): string[] {
  if (current.bookings < MIN_BOOKINGS_FOR_INSIGHTS) return [];

  const insights: string[] = [];

  // Top slot by covers
  const topSlot = [...slots].sort((a, b) => b.covers - a.covers)[0];
  if (topSlot && topSlot.covers > 0) {
    insights.push(`La fascia ${topSlot.slot} è quella con più coperti nel periodo selezionato.`);
  }

  // Low-demand slot (only among slots that did have some activity)
  const activeSlots = slots.filter((s) => s.covers > 0);
  const totalSlotCovers = slots.reduce((s, x) => s + x.covers, 0);
  if (activeSlots.length >= 3 && totalSlotCovers > 0) {
    const weakest = [...activeSlots].sort((a, b) => a.covers - b.covers)[0];
    if (weakest.covers / totalSlotCovers < 0.1) {
      insights.push(`La fascia ${weakest.slot} ha una domanda molto bassa nel periodo selezionato.`);
    }
  }

  // Top weekday by covers
  const byWeekday: Record<string, number> = {};
  heatmap.forEach((h) => {
    byWeekday[h.weekday] = (byWeekday[h.weekday] ?? 0) + h.covers;
  });
  const weekdayEntries = Object.entries(byWeekday);
  const topWeekday = weekdayEntries.sort((a, b) => b[1] - a[1])[0];
  if (topWeekday && topWeekday[1] > 0) {
    insights.push(`Il giorno con maggiore domanda è ${topWeekday[0]}.`);
  }

  // Weekend vs weekday
  if (weekdayEntries.length > 0 && weekdayEntries.some(([, v]) => v > 0)) {
    const weekendCovers = weekdayEntries.filter(([d]) => WEEKEND.has(d)).reduce((s, [, v]) => s + v, 0);
    const weekdayDays = weekdayEntries.filter(([d]) => !WEEKEND.has(d));
    const avgWeekdayCovers = weekdayDays.length
      ? weekdayDays.reduce((s, [, v]) => s + v, 0) / weekdayDays.length
      : 0;
    const comparableWeekend = avgWeekdayCovers * 2;
    if (comparableWeekend > 0) {
      insights.push(
        weekendCovers > comparableWeekend
          ? "Il weekend genera più coperti rispetto ai giorni infrasettimanali."
          : "Il weekend genera meno coperti rispetto ai giorni infrasettimanali.",
      );
    }
  }

  // No-show trend vs previous period
  if (previous.bookings > 0) {
    const delta = computeDelta(current.noShowRate, previous.noShowRate, { higherIsBetter: false, kind: "rate" });
    if (delta.available && Math.abs(delta.value) >= 3) {
      insights.push(
        delta.value > 0
          ? "Il tasso di no-show è aumentato rispetto al periodo precedente."
          : "Il tasso di no-show è diminuito rispetto al periodo precedente — un buon segnale.",
      );
    }
  }

  // Repeat guests share
  if (current.totalGuests >= 5) {
    const pct = Math.round((current.repeatGuests / current.totalGuests) * 100);
    if (pct >= 30) {
      insights.push(`Gli ospiti ricorrenti rappresentano il ${pct}% delle visite nel periodo.`);
    }
  }

  // Source concentration
  const totalSourceCount = sources.reduce((s, x) => s + x.count, 0);
  if (totalSourceCount > 0) {
    const topSource = [...sources].sort((a, b) => b.count - a.count)[0];
    const share = topSource.count / totalSourceCount;
    if (share >= 0.6) {
      const label = sourceLabels[topSource.source] ?? topSource.source;
      insights.push(`La maggior parte delle prenotazioni arriva da ${label}.`);
    }
  }

  return insights.slice(0, 5);
}
