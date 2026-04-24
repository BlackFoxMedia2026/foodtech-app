import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/overview/stat-card";
import { WeekTrend } from "@/components/overview/week-trend";
import { TodayTimeline } from "@/components/overview/today-timeline";
import { getActiveVenue } from "@/lib/tenant";
import { getOverview } from "@/server/insights";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, Sparkles, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ctx = await getActiveVenue();
  const data = await getOverview(ctx.venueId);

  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{ctx.venue.name}</p>
          <h1 className="text-display text-3xl">Buona giornata, {ctx.session.user?.name?.split(" ")[0] ?? "ospite"}.</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Coperti previsti"
          value={String(data.totalCovers)}
          hint={`${data.todayBookings.length} prenotazioni attive`}
          emphasize
        />
        <StatCard
          label="No-show stimati"
          value={String(data.expectedNoShow)}
          hint="Basato sullo storico ospiti"
        />
        <StatCard
          label="Incassi stimati"
          value={formatCurrency(data.estimatedRevenueCents, ctx.venue.currency)}
          hint="Spesa media × coperti"
        />
        <StatCard
          label="Occupazione media"
          value={`${Math.min(100, Math.round((data.totalCovers / 90) * 100))}%`}
          hint="Capienza turno cena"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Andamento settimanale</CardTitle>
              <CardDescription>Coperti e prenotazioni degli ultimi 7 giorni</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <WeekTrend data={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alert operativi</CardTitle>
            <CardDescription>Cose da tenere d'occhio per il servizio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Tutto sotto controllo.
              </p>
            ) : (
              data.alerts.map((a, i) => {
                const Icon = a.kind === "danger" ? AlertTriangle : a.kind === "info" ? Sparkles : Info;
                const tone =
                  a.kind === "danger"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : a.kind === "info"
                      ? "border-gilt/30 bg-gilt/10 text-gilt-dark"
                      : "border-amber-200 bg-amber-50 text-amber-700";
                return (
                  <div key={i} className={`flex items-start gap-3 rounded-md border p-3 text-sm ${tone}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{a.message}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Prenotazioni di oggi</CardTitle>
          <CardDescription>Timeline aggiornata in tempo reale</CardDescription>
        </CardHeader>
        <CardContent>
          <TodayTimeline bookings={data.todayBookings} />
        </CardContent>
      </Card>
    </div>
  );
}
