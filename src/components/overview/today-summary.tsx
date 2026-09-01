import { TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/overview/stat-card";
import { Card } from "@/components/ui/card";

export function TodaySummary({
  bookingsCount,
  totalCovers,
  occupancyPct,
  coversChangePct,
}: {
  bookingsCount: number;
  totalCovers: number;
  occupancyPct: number;
  coversChangePct: number;
}) {
  const positive = coversChangePct >= 0;

  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[0.75fr_0.75fr_0.5fr_0.5fr]">
      <StatCard className="card-notch" tone="cream" fill label="Prenotazioni" value={String(bookingsCount)} hint="totali" />
      <StatCard className="card-notch" tone="brown-light" fill label="Coperti" value={String(totalCovers)} hint="persone" />
      <StatCard
        className="card-notch"
        tone="brown-dark"
        fill
        label="Occupazione"
        value={`${occupancyPct}%`}
        hint="su capienza cena"
        progressPct={occupancyPct}
      />
      <Card className="finish-sage-bright card-notch flex flex-col justify-center border-[#699158] p-5 shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]">
        <p className="text-xs uppercase tracking-wider text-clay-ink-soft">Andamento in linea</p>
        <p className="mt-1 text-xs text-clay-ink-soft">Rispetto a ieri</p>
        <p className={`mt-2 inline-flex items-center gap-1.5 font-mono text-2xl font-semibold ${positive ? "text-[#1f4a3a]" : "text-[#9c3b3b]"}`}>
          {positive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          {positive ? "+" : ""}
          {coversChangePct}%
        </p>
      </Card>
    </section>
  );
}
