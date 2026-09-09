import Link from "next/link";
import { Plus, CalendarRange } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefing } from "@/components/overview/briefing";
import { TodayTimeline } from "@/components/overview/today-timeline";
import { QuickActions } from "@/components/overview/quick-actions";
import { KpiGrid } from "@/components/overview/kpi-grid";
import { WeekTrend } from "@/components/overview/week-trend";
import { getActiveVenue } from "@/lib/tenant";
import { getOverview } from "@/server/insights";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ctx = await getActiveVenue();
  const data = await getOverview(ctx.venueId);

  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    // Niente scroll: testata e briefing restano fissi, e tutto il resto sta
    // in una regione sola che prende l'altezza che avanza. La Panoramica è
    // una schermata che si **legge**, quindi il saluto in serif resta — su
    // una riga sola, con la data accanto invece che sotto.
    <div className="schermo animate-fade-in gap-4">
      <header className="fissa flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:block">
            {ctx.venue.name}
          </p>
          {/* Sul telefono il saluto sta su una riga e la data si nasconde: due
              righe di intestazione qui sono due prenotazioni in meno visibili. */}
          <h1 className="truncate text-display text-xl md:text-2xl">
            Buona giornata, {ctx.session.user?.name?.split(" ")[0] ?? "ospite"}.
            <span className="ml-2 hidden align-middle text-sm font-normal capitalize text-muted-foreground lg:inline">
              {today}
            </span>
          </h1>
        </div>
        {/* Sotto `md` questo pulsante non c'è: la barra in basso ha il «+»
            grande, e la sua prima voce è proprio «Nuova prenotazione». Erano
            due bersagli per la stessa cosa, e quello in testata si mangiava
            metà della riga — il saluto finiva a «Buona giornata…». */}
        <Button asChild variant="accent" className="hidden md:inline-flex">
          <Link href="/bookings/new">
            <Plus className="h-4 w-4" />
            Nuova prenotazione
          </Link>
        </Button>
      </header>

      {/* Prima cosa in pagina: la frase che si dice alla brigata prima di
          aprire. I numeri restano sotto — servono, ma dopo. */}
      <Briefing
        prenotazioni={data.todayBookings.length}
        coperti={data.totalCovers}
        occupancyPct={data.occupancyPct}
        vip={data.alertCounts.vip}
        compleanni={data.alertCounts.birthdays}
        allergie={data.alertCounts.allergies}
        daConfermare={data.alertCounts.pendingConfirmations}
        picco={data.picco}
      />

      {/*
        Qui c'era «Prenotazioni 14 · Coperti 50 · Occupazione 56%»: gli stessi
        due numeri della frase qui sopra, in 140 px di riquadri. Prima di
        comprimere una pagina si cerca il doppione — e il conto delle
        prenotazioni è finito nella frase, dove serviva.
      */}
      {/*
        Due colonne **da tablet in su**. Impilate a 820 px diventavano due
        regioni che scorrono una sopra l'altra — due barre di scorrimento in
        una schermata che non dovrebbe averne nemmeno una.
      */}
      {/*
        Sul telefono **una** regione che scorre, con tutto dentro: due
        regioni affiancate su 390 px diventano due finestrelle da settanta
        pixel, inservibili. Da tablet in su le colonne si affiancano e
        scorrono ognuna per sé.
      */}
      <section className="fill min-h-0 space-y-4 overflow-y-auto md:grid md:grid-cols-[1.4fr_1fr] md:gap-4 md:space-y-0 md:overflow-hidden">
        {/* Le prenotazioni di oggi: sono l'unica cosa di questa pagina che
            per natura non ha una lunghezza massima, quindi scorre lei. */}
        <Card className="card-notch recessed flex flex-col md:min-h-0">
          <CardHeader className="fissa flex flex-row items-center justify-between py-3">
            <div>
              <CardTitle className="text-base">Prenotazioni di oggi</CardTitle>
              <CardDescription>Aggiornate in tempo reale</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/bookings">
                <CalendarRange className="h-4 w-4" />
                Calendario
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <TodayTimeline bookings={data.todayBookings} />
          </CardContent>
        </Card>

        {/* La colonna di destra: azioni, numeri, andamento. Se non ci sta
            tutto — succede a 1280 e sul tablet — scorre questa colonna, non
            la pagina. */}
        <div className="space-y-4 pr-0.5 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <QuickActions />
          <KpiGrid
            totalCovers={data.totalCovers}
            estimatedRevenueCents={data.estimatedRevenueCents}
            incasso={data.incasso}
            currency={ctx.venue.currency}
            expectedNoShow={data.expectedNoShow}
            comparisons={data.comparisons}
          />

          <Card className="card-notch">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Andamento settimanale</CardTitle>
              <CardDescription>
                Coperti ·{" "}
                <span className={data.weekComparisonPct >= 0 ? "text-sage" : "text-rose-600"}>
                  {data.weekComparisonPct >= 0 ? "▲" : "▼"} {Math.abs(data.weekComparisonPct)}% sulla
                  settimana scorsa
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <WeekTrend data={data.trend} />
              <Link
                href="/insights"
                className="mt-2 inline-block text-xs font-medium text-surface-brown-light hover:underline"
              >
                Vedi report completo
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
