import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: number; positive?: boolean };
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-display text-3xl">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {trend && (
          <p
            className={cn(
              "mt-3 inline-flex items-center gap-1 text-xs font-medium",
              trend.positive ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {trend.positive ? "▲" : "▼"} {Math.abs(trend.value)}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}
