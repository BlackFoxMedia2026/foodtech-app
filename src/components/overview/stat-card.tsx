import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { LiquidSurface } from "@/components/shell/liquid-surface";

export function StatCard({
  label,
  value,
  hint,
  trend,
  emphasize,
  tone,
  icon: Icon,
  progressPct,
  variant,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  emphasize?: boolean;
  /** Colors the value text green/red — for "vs ieri" style comparisons. */
  tone?: "positive" | "negative";
  /** Small icon in an ember circle, rendered beside the label/value block. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Renders a thin horizontal ember progress bar under the value (e.g. occupancy). */
  progressPct?: number;
  /** "liquid" reuses the sidebar's glass layers — same classes, same shared ember gradient, no pointer-reactive highlight. */
  variant?: "liquid";
  className?: string;
}) {
  const textBlock = (
    <>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-display text-3xl",
          emphasize && "text-accent",
          tone === "positive" && "text-emerald-400",
          tone === "negative" && "text-rose-400",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {trend && (
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 text-xs font-medium",
            trend.positive ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {trend.positive ? "▲" : "▼"} {Math.abs(trend.value)}%
        </p>
      )}
      {typeof progressPct === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
        </div>
      )}
    </>
  );

  const body = Icon ? (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">{textBlock}</div>
    </div>
  ) : (
    textBlock
  );

  if (variant === "liquid") {
    return (
      <LiquidSurface className={cn("p-5", className)}>
        {body}
      </LiquidSurface>
    );
  }

  return (
    <Card className={cn(emphasize && "border-accent/40 bg-accent/5", className)}>
      <CardContent className="p-5">{body}</CardContent>
    </Card>
  );
}
