import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/overview/stat-card";
import { Button } from "@/components/ui/button";
import { SlotChart, SourcesChart, WeekdayHeatmap, SOURCE_LABELS } from "@/components/insights/charts";
import { PeriodSelector } from "@/components/insights/period-selector";
import { ComparisonStat } from "@/components/insights/comparison-stat";
import { getActiveVenue } from "@/lib/tenant";
import { getAnalytics, getPreviousPeriodMetrics } from "@/server/analytics";
import { computeDelta } from "@/lib/period-delta";
import { generateInsights } from "@/lib/insight-rules";
import { formatCurrency, startOfDay, endOfDay, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PRESET_RANGE_KEYS = new Set(["last7", "last30", "last90", "currentMonth", "currentYear"]);

function computeRange(searchParams: { range?: string; from?: string; to?: string }) {
  const now = new Date();

  if (searchParams.range === "custom" && searchParams.from && searchParams.to) {
    return { range: "custom", from: startOfDay(new Date(searchParams.from)), to: endOfDay(new Date(searchParams.to)) };
  }

  const key = searchParams.range && PRESET_RANGE_KEYS.has(searchParams.range) ? searchParams.range : "last7";

  if (key === "currentMonth") {
    return { range: key, from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
  }
  if (key === "currentYear") {
    return { range: key, from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
  }
  const days = key === "last30" ? 30 : key === "last90" ? 90 : 7;
  const from = startOfDay(now);
  from.setDate(from.getDate() - days);
  return { range: key, from, to: endOfDay(now) };
}

function trendFor(current: number, previous: number, opts?: { higherIsBetter?: boolean; kind?: "count" | "rate" }) {
  const delta = computeDelta(current, previous, opts);
  return delta.available ? { value: delta.value, positive: delta.isGood ?? true } : undefined;
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous);
  if (!delta.available) return <p className="text-xs text-muted-foreground">Confronto non disponibile</p>;
  if (delta.value === 0) return <p className="text-xs text-muted-foreground">Invariato rispetto al periodo precedente</p>;
  return (
    <p className={cn("flex items-center gap-1 text-xs font-medium", delta.isGood ? "text-emerald-600" : "text-rose-600")}>
      {delta.value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta.value)}% rispetto al periodo precedente
    </p>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const ctx = await getActiveVenue();
  const { range, from, to } = computeRange(searchParams);
  const [a, prev] = await Promise.all([
    getAnalytics(ctx.venueId, from, to),
    getPreviousPeriodMetrics(ctx.venueId, from, to),
  ]);

  const insights = generateInsights({
    current: a,
    previous: prev,
    slots: a.slots,
    heatmap: a.heatmap,
    sources: a.sources,
    sourceLabels: SOURCE_LABELS,
  });

  const pctNewGuests = a.totalGuests ? Math.round((a.newGuests / a.totalGuests) * 100) : null;
  const pctRepeatGuests = a.totalGuests ? Math.round((a.repeatGuests / a.totalGuests) * 100) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Analytics</p>
          <h1 className="text-display text-3xl">Analytics</h1>
          <p className="text-sm text-muted-foreground">Monitora performance, domanda e comportamento degli ospiti.</p>
        </div>
        <PeriodSelector range={range} from={from.toISOString().slice(0, 10)} to={to.toISOString().slice(0, 10)} />
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Prenotazioni totali"
          value={String(a.bookings)}
          hint="Nel periodo selezionato"
          trend={trendFor(a.bookings, prev.bookings)}
          emphasize
        />
        <StatCard
          label="Coperti totali"
          value={String(a.covers)}
          hint="Somma dei posti prenotati"
          trend={trendFor(a.covers, prev.covers)}
        />
        <StatCard
          label="Tasso completamento"
          value={`${a.occupancyRate}%`}
          hint="Prenotazioni completate"
          trend={trendFor(a.occupancyRate, prev.occupancyRate, { kind: "rate" })}
        />
        <StatCard
          label="No-show"
          value={`${a.noShowRate}%`}
          hint="Sul totale prenotazioni"
          trend={trendFor(a.noShowRate, prev.noShowRate, { higherIsBetter: false, kind: "rate" })}
        />
        <StatCard
          label="Cancellazioni"
          value={`${a.cancelRate}%`}
          hint="Sul totale prenotazioni"
          trend={trendFor(a.cancelRate, prev.cancelRate, { higherIsBetter: false, kind: "rate" })}
        />
        <StatCard
          label="Spesa media"
          value={formatCurrency(a.avgSpendCents, ctx.venue.currency)}
          hint="Media storica ospiti attivi nel periodo"
          trend={trendFor(a.avgSpendCents, prev.avgSpendCents)}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coperti per fascia oraria</CardTitle>
            <CardDescription>Distribuzione del flusso nel periodo selezionato</CardDescription>
          </CardHeader>
          <CardContent><SlotChart data={a.slots} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Domanda per giorno e orario</CardTitle>
            <CardDescription>Coperti per giorno della settimana e fascia oraria</CardDescription>
          </CardHeader>
          <CardContent><WeekdayHeatmap data={a.heatmap} /></CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Fonti di prenotazione</CardTitle>
          <CardDescription>Dove arrivano i tuoi ospiti</CardDescription>
        </CardHeader>
        <CardContent><SourcesChart data={a.sources} /></CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nuovi ospiti</CardTitle>
            <CardDescription>Profili creati nel periodo selezionato</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-display text-4xl">{a.newGuests}</p>
            <p className="text-sm text-muted-foreground">
              {pctNewGuests !== null ? `${pctNewGuests}% degli ospiti nel periodo` : "Nessun ospite nel periodo"}
            </p>
            <DeltaBadge current={a.newGuests} previous={prev.newGuests} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ospiti ricorrenti</CardTitle>
            <CardDescription>Hanno visitato più di una volta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-display text-4xl">{a.repeatGuests}</p>
            <p className="text-sm text-muted-foreground">
              {pctRepeatGuests !== null ? `${pctRepeatGuests}% degli ospiti nel periodo` : "Nessun ospite nel periodo"}
            </p>
            <DeltaBadge current={a.repeatGuests} previous={prev.repeatGuests} />
            <Button asChild variant="outline" size="sm">
              <Link href="/guests">Vai a Ospiti <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Confronto periodi</CardTitle>
          <CardDescription>Periodo selezionato rispetto a quello immediatamente precedente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <ComparisonStat label="Prenotazioni" current={a.bookings} previous={prev.bookings} />
            <ComparisonStat label="Coperti" current={a.covers} previous={prev.covers} />
            <ComparisonStat label="Tasso completamento" current={a.occupancyRate} previous={prev.occupancyRate} format={(v) => `${v}%`} kind="rate" />
            <ComparisonStat label="No-show" current={a.noShowRate} previous={prev.noShowRate} format={(v) => `${v}%`} higherIsBetter={false} kind="rate" />
            <ComparisonStat label="Cancellazioni" current={a.cancelRate} previous={prev.cancelRate} format={(v) => `${v}%`} higherIsBetter={false} kind="rate" />
            <ComparisonStat
              label="Spesa media"
              current={a.avgSpendCents}
              previous={prev.avgSpendCents}
              format={(v) => formatCurrency(v, ctx.venue.currency)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Insight principali</CardTitle>
          <CardDescription>Cosa dicono i dati di questo periodo</CardDescription>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Non ci sono ancora abbastanza dati per generare insight affidabili.
            </p>
          ) : (
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li key={i} className="rounded-md border bg-secondary/30 p-3 text-sm">{insight}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
