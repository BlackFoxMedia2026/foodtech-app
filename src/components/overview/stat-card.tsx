import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  trend,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  emphasize?: boolean;
}) {
  return (
    <Card className={cn(emphasize && "bg-carbon-800 text-sand-50 border-carbon-700")}>
      <CardContent className="p-5">
        <p className={cn("text-xs uppercase tracking-wider", emphasize ? "text-sand-200/70" : "text-muted-foreground")}>
          {label}
        </p>
        <p className="mt-2 text-display text-3xl">{value}</p>
        {hint && (
          <p className={cn("mt-1 text-xs", emphasize ? "text-sand-200/60" : "text-muted-foreground")}>{hint}</p>
        )}
        {trend && (
          <p
            className={cn(
              "mt-3 inline-flex items-center gap-1 text-xs font-medium",
              trend.positive ? "text-emerald-600" : "text-rose-600",
              emphasize && (trend.positive ? "text-emerald-300" : "text-rose-300"),
            )}
          >
            {trend.positive ? "▲" : "▼"} {Math.abs(trend.value)}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}
