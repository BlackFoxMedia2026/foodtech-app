import Link from "next/link";
import { Plus, CalendarRange } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TodaySummary } from "@/components/overview/today-summary";
import { TodayTimeline } from "@/components/overview/today-timeline";
import { QuickActions } from "@/components/overview/quick-actions";
import { AlertsCard } from "@/components/overview/alerts-card";
import { KpiGrid } from "@/components/overview/kpi-grid";
import { WeekTrend } from "@/components/overview/week-trend";
import { getActiveVenue } from "@/lib/tenant";
import { getOverview } from "@/server/insights";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ctx = await getActiveVenue();
  const data = await getOverview(ctx.venueId);

  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const todayShort = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{ctx.venue.name}</p>
          <h1 className="text-display text-3xl">Buona giornata, {ctx.session.user?.name?.split(" ")[0] ?? "ospite"}.</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </div>
        <Button asChild variant="gold">
          <Link href="/bookings/new">
            <Plus className="h-4 w-4" />
            Nuova prenotazione
          </Link>
        </Button>
      </header>

      <TodaySummary
        dateLabel={todayShort}
        serviceName={data.serviceName}
        bookingsCount={data.todayBookings.length}
        totalCovers={data.totalCovers}
        occupancyPct={data.occupancyPct}
        coversChangePct={data.comparisons.covers}
      />

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Prenotazioni di oggi</CardTitle>
              <CardDescription>Timeline aggiornata in tempo reale</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/bookings">
                <CalendarRange className="h-4 w-4" />
                Vedi calendario
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <TodayTimeline bookings={data.todayBookings} />
            <Link
              href="/bookings"
              className="mt-2 flex items-center justify-center gap-1 rounded-lg py-2.5 text-sm font-medium text-accent transition-colors hover:bg-white/5"
            >
              Vedi tutte le prenotazioni
            </Link>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <QuickActions />
          <AlertsCard counts={data.alertCounts} />
          <KpiGrid
            totalCovers={data.totalCovers}
            estimatedRevenueCents={data.estimatedRevenueCents}
            currency={ctx.venue.currency}
            occupancyPct={data.occupancyPct}
            expectedNoShow={data.expectedNoShow}
            comparisons={data.comparisons}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Andamento settimanale</CardTitle>
          <CardDescription>Coperti</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
            <WeekTrend data={data.trend} />
            <div className="flex flex-col justify-center gap-1 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Confronto settimana scorsa</p>
              <p className={`text-2xl font-semibold ${data.weekComparisonPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {data.weekComparisonPct >= 0 ? "▲" : "▼"} {Math.abs(data.weekComparisonPct)}%
              </p>
              <p className="text-xs text-muted-foreground">Coperti medi</p>
              <Link href="/insights" className="mt-3 text-xs font-medium text-accent hover:underline">
                Vedi report completo
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
