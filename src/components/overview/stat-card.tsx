import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  trend,
  tone,
  fill,
  emphasize,
  icon: Icon,
  progressPct,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  /** Colors the value text (and trend/progress fill). With `fill`, the same tone also fills the whole card instead of just the text. */
  tone?: "accent" | "cream" | "sage" | "brown-medium" | "brown-dark" | "brown-light";
  /** Solidly fills the card with the tone color (caramel → white text, cream/sage → dark forest text) instead of just tinting the value. Reserve for the 1-2 KPIs that should visually dominate the row. */
  fill?: boolean;
  /** Subtle accent-tinted value — used by other stat-card call sites (analytics, payments) outside the overview redesign. */
  emphasize?: boolean;
  /** Small icon beside the label/value block — stays a neutral tone, never the brand accent. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Renders a thin horizontal progress bar under the value (e.g. occupancy) — always neutral, never the brand accent. */
  progressPct?: number;
  className?: string;
}) {
  const caramelFill = fill && tone === "accent";
  const creamFill = fill && tone === "cream";
  const sageFill = fill && tone === "sage";
  const brownFill = fill && (tone === "brown-medium" || tone === "brown-dark");
  const brownLightFill = fill && tone === "brown-light";
  const lightFill = creamFill || sageFill || brownLightFill;

  const valueColor = caramelFill
    ? "text-clay-ink"
    : creamFill
      ? "text-clay-ink"
      : sageFill
        ? "text-forest"
        : brownFill
          ? "text-cream"
          : brownLightFill
            ? "text-clay-ink"
            : tone === "accent"
              ? "text-surface-brown-light"
              : tone === "cream"
                ? "text-cream"
                : tone === "sage"
                  ? "text-sage"
                  : emphasize
                    ? "text-surface-brown-light"
                    : "text-card-foreground";
  const labelColor = caramelFill
    ? "text-clay-ink/70"
    : creamFill
      ? "text-clay-ink-soft"
      : sageFill
        ? "text-forest/70"
        : brownFill
          ? "text-cream/65"
          : brownLightFill
            ? "text-clay-ink-soft"
            : "text-card-foreground/65";

  const textBlock = (
    <>
      <p className={cn("text-xs uppercase tracking-wider", labelColor)}>{label}</p>
      <p className={cn("mt-2 font-mono text-3xl", valueColor)}>{value}</p>
      {hint && <p className={cn("mt-1 text-xs", labelColor)}>{hint}</p>}
      {trend && (
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 font-mono text-xs font-medium",
            caramelFill || lightFill || brownFill ? valueColor : trend.positive ? "text-sage" : "text-rose-600",
          )}
        >
          {trend.positive ? "▲" : "▼"} {Math.abs(trend.value)}%
        </p>
      )}
      {typeof progressPct === "number" && (
        <div
          className={cn(
            "mt-3 h-1.5 w-full overflow-hidden rounded-full",
            caramelFill || creamFill || brownLightFill ? "bg-clay-ink/20" : sageFill ? "bg-forest/20" : brownFill ? "bg-cream/20" : "bg-border",
          )}
        >
          <div
            className={cn(
              "h-full rounded-full",
              caramelFill || creamFill || brownLightFill ? "bg-clay-ink" : sageFill ? "bg-forest" : brownFill ? "bg-cream" : "bg-surface-brown-light",
            )}
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      )}
    </>
  );

  const body = Icon ? (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "finish-metal-chip grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-[0_8px_18px_rgba(0,0,0,0.3)]",
          caramelFill || creamFill || brownLightFill
            ? "bg-clay-ink/15 text-clay-ink"
            : sageFill
              ? "bg-forest/10 text-forest"
              : brownFill
                ? "bg-cream/15 text-cream"
                : "bg-cream/10 text-cream",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">{textBlock}</div>
    </div>
  ) : (
    textBlock
  );

  return (
    <Card
      className={cn(
        caramelFill && "finish-bronze border-[#8a6640] shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]",
        creamFill && "finish-parchment border-cream shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]",
        sageFill && "border-sage bg-sage shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]",
        brownFill &&
          tone === "brown-medium" &&
          "finish-brown-medium border-[#7b4e30] shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]",
        brownFill &&
          tone === "brown-dark" &&
          "finish-brown-dark border-[#633a26] shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]",
        brownLightFill && "finish-peach border-[#ae8c67] shadow-[0_10px_18px_rgba(0,0,0,0.22),0_24px_48px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <CardContent className="p-5">{body}</CardContent>
    </Card>
  );
}
