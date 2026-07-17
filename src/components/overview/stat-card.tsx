import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  trend,
  emphasize,
  variant,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  emphasize?: boolean;
  /** "liquid" reuses the sidebar's glass layers — same classes, same shared ember gradient, no pointer-reactive highlight. */
  variant?: "liquid";
  className?: string;
}) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-display text-3xl", emphasize && "text-accent")}>{value}</p>
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
    </>
  );

  if (variant === "liquid") {
    return (
      <div className={cn("liquid-sidebar relative p-5", className)}>
        <div className="liquid-sidebar__refraction" aria-hidden="true" />
        <div className="liquid-sidebar__glass" aria-hidden="true" />
        <div className="liquid-card__highlights" aria-hidden="true" />
        <div className="liquid-sidebar__content">{body}</div>
      </div>
    );
  }

  return (
    <Card className={cn(emphasize && "border-accent/40 bg-accent/5", className)}>
      <CardContent className="p-5">{body}</CardContent>
    </Card>
  );
}
