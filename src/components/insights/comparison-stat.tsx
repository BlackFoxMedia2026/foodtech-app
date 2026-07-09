import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeDelta } from "@/lib/period-delta";

interface ComparisonStatProps {
  label: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
  higherIsBetter?: boolean;
  kind?: "count" | "rate";
}

export function ComparisonStat({
  label,
  current,
  previous,
  format,
  higherIsBetter = true,
  kind = "count",
}: ComparisonStatProps) {
  const delta = computeDelta(current, previous, { higherIsBetter, kind });
  const fmt = format ?? String;

  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-display text-xl">{fmt(current)}</p>
        {delta.available && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              delta.value === 0 ? "text-muted-foreground" : delta.isGood ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {delta.value === 0 ? (
              <Minus className="h-3 w-3" />
            ) : delta.value > 0 ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(delta.value)}
            {delta.kind === "rate" ? " pt" : "%"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {delta.available ? `vs ${fmt(previous)} periodo precedente` : "Confronto non disponibile"}
      </p>
    </div>
  );
}
