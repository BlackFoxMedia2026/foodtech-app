import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/overview/stat-card";
import { SlotChart, SourcesChart, WeekdayHeatmap } from "@/components/insights/charts";
import { PeriodSelector } from "@/components/insights/period-selector";
import { ComparisonStat } from "@/components/insights/comparison-stat";
import { getActiveVenue } from "@/lib/tenant";
import { getAnalytics, getPeriodComparison } from "@/server/analytics";
import { formatCurrency, startOfDay, endOfDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PRESET_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 };

function computeRange(searchParams: { range?: string; from?: string; to?: string }) {
  const range = searchParams.range && searchParams.range in PRESET_DAYS ? searchParams.range : "custom";
  const now = new Date();

  if (range === "custom" && searchParams.from && searchParams.to) {
    return { range: "custom", from: startOfDay(new Date(searchParams.from)), to: endOfDay(new Date(searchParams.to)) };
  }

  const days = PRESET_DAYS[searchParams.range ?? "week"] ?? PRESET_DAYS.week;
  const from = startOfDay(now);
  from.setDate(from.getDate() - days);
  return { range: searchParams.range && PRESET_DAYS[searchParams.range] ? searchParams.range : "week", from, to: endOfDay(now) };
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const ctx = await getActiveVenue();
  const { range, from, to } = computeRange(searchParams);
  const [a, comparison] = await Promise.all([
    getAnalytics(ctx.venueId),
    getPeriodComparison(ctx.venueId, from, to),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Performance · ultimi 90 giorni</p>
        <h1 className="text-display text-3xl">Analytics</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tasso completamento" value={`${a.occupancyRate}%`} hint="Prenotazioni completate" emphasize />
        <StatCard label="No-show" value={`${a.noShowRate}%`} hint="Sul totale" />
        <StatCard label="Cancellazioni" value={`${a.cancelRate}%`} />
        <StatCard label="Spesa media" value={formatCurrency(a.avgSpendCents, ctx.venue.currency)} hint="Per visita" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coperti per fascia oraria</CardTitle>
            <CardDescription>Distribuzione del flusso giornaliero</CardDescription>
          </CardHeader>
          <CardContent><SlotChart data={a.slots} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fonti di prenotazione</CardTitle>
            <CardDescription>Dove arrivano i tuoi ospiti</CardDescription>
          </CardHeader>
          <CardContent><SourcesChart data={a.sources} /></CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Confronto periodi</CardTitle>
          <CardDescription>Periodo corrente rispetto a quello immediatamente precedente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PeriodSelector
            range={range}
            from={from.toISOString().slice(0, 10)}
            to={to.toISOString().slice(0, 10)}
          />
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            <ComparisonStat label="Prenotazioni" current={comparison.current.bookings} previous={comparison.previous.bookings} />
            <ComparisonStat label="Coperti" current={comparison.current.covers} previous={comparison.previous.covers} />
            <ComparisonStat label="Tasso completamento" current={comparison.current.occupancyRate} previous={comparison.previous.occupancyRate} format={(v) => `${v}%`} />
            <ComparisonStat label="No-show" current={comparison.current.noShowRate} previous={comparison.previous.noShowRate} format={(v) => `${v}%`} higherIsBetter={false} />
            <ComparisonStat label="Cancellazioni" current={comparison.current.cancelRate} previous={comparison.previous.cancelRate} format={(v) => `${v}%`} higherIsBetter={false} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domanda per giorno e orario</CardTitle>
          <CardDescription>Coperti per giorno della settimana e fascia oraria, ultimi 90 giorni</CardDescription>
        </CardHeader>
        <CardContent><WeekdayHeatmap data={a.heatmap} /></CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nuovi ospiti</CardTitle>
            <CardDescription>Acquisizione negli ultimi 90 giorni</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-display text-4xl">{a.newGuests}</p>
            <p className="text-sm text-muted-foreground">profili creati nel periodo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ospiti ricorrenti</CardTitle>
            <CardDescription>Hanno visitato più di una volta</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-display text-4xl">{a.repeatGuests}</p>
            <p className="text-sm text-muted-foreground">ospiti fedeli</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
