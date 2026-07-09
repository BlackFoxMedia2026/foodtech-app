import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComparisonStatProps {
  label: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
  higherIsBetter?: boolean;
}

export function ComparisonStat({ label, current, previous, format, higherIsBetter = true }: ComparisonStatProps) {
  const deltaPct = previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 100);
  const isFlat = deltaPct === 0;
  const isPositive = deltaPct > 0;
  const isGood = isFlat ? null : isPositive === higherIsBetter;
  const fmt = format ?? String;

  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-display text-xl">{fmt(current)}</p>
        <span
          className={cn(
            "flex items-center gap-0.5 text-xs font-medium",
            isFlat ? "text-muted-foreground" : isGood ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {isFlat ? <Minus className="h-3 w-3" /> : isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(deltaPct)}%
        </span>
      </div>
      <p className="text-xs text-muted-foreground">vs {fmt(previous)} periodo precedente</p>
    </div>
  );
}
