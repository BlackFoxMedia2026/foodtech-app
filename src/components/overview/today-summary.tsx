import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/overview/stat-card";
import { Card } from "@/components/ui/card";

export function TodaySummary({
  dateLabel,
  serviceName,
  bookingsCount,
  totalCovers,
  occupancyPct,
  coversChangePct,
}: {
  dateLabel: string;
  serviceName: string | null;
  bookingsCount: number;
  totalCovers: number;
  occupancyPct: number;
  coversChangePct: number;
}) {
  const positive = coversChangePct >= 0;

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        className="sm:col-span-2 lg:col-span-1"
        icon={CalendarDays}
        label="Oggi"
        value={dateLabel}
        hint={serviceName ? `Servizio ${serviceName.toLowerCase()}` : "Nessun turno attivo"}
      />
      <StatCard label="Prenotazioni" value={String(bookingsCount)} hint="totali" />
      <StatCard label="Coperti" value={String(totalCovers)} hint="persone" />
      <StatCard label="Occupazione" value={`${occupancyPct}%`} hint="su capienza cena" progressPct={occupancyPct} />
      <Card className="flex flex-col justify-center p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Andamento in linea</p>
        <p className="mt-1 text-xs text-muted-foreground">Rispetto a ieri</p>
        <p className={`mt-2 inline-flex items-center gap-1.5 text-2xl font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {positive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          {positive ? "+" : ""}
          {coversChangePct}%
        </p>
      </Card>
    </section>
  );
}
