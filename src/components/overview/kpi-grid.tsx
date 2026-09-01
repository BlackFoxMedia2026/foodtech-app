import { Users, Wallet, Percent, UserX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

type Kpi = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  delta: number;
  /** How the delta should read: for most KPIs higher is better, for no-show lower is better. */
  higherIsBetter: boolean;
  /** Render the delta as a raw count ("↓ 1") instead of a percentage. */
  isCount?: boolean;
  /** Which material surface this tile sits on — alternated so the section isn't a wall of green. */
  surface: "green" | "brown" | "cream";
};

const SURFACE = {
  green: {
    container: "border border-border bg-background",
    iconLabel: "text-muted-foreground",
    value: "text-foreground",
    positive: "text-sage",
    negative: "text-rose-600",
  },
  brown: {
    container: "finish-brown-dark border border-[#633a26]",
    iconLabel: "text-cream/65",
    value: "text-cream",
    positive: "text-sage",
    negative: "text-rose-400",
  },
  cream: {
    container: "bg-cream border border-cream",
    iconLabel: "text-clay-ink-soft",
    value: "text-clay-ink",
    positive: "text-sage-deep",
    negative: "text-rose-700",
  },
} as const;

export function KpiGrid({
  totalCovers,
  estimatedRevenueCents,
  currency,
  occupancyPct,
  expectedNoShow,
  comparisons,
}: {
  totalCovers: number;
  estimatedRevenueCents: number;
  currency: string;
  occupancyPct: number;
  expectedNoShow: number;
  comparisons: { covers: number; revenue: number; occupancy: number; noShow: number };
}) {
  const kpis: Kpi[] = [
    { label: "Coperti", value: String(totalCovers), icon: Users, delta: comparisons.covers, higherIsBetter: true, surface: "green" },
    {
      label: "Incassi stimati",
      value: formatCurrency(estimatedRevenueCents, currency),
      icon: Wallet,
      delta: comparisons.revenue,
      higherIsBetter: true,
      surface: "brown",
    },
    {
      label: "Occupazione",
      value: `${occupancyPct}%`,
      icon: Percent,
      delta: comparisons.occupancy,
      higherIsBetter: true,
      surface: "cream",
    },
    {
      label: "No show",
      value: String(expectedNoShow),
      icon: UserX,
      delta: comparisons.noShow,
      higherIsBetter: false,
      isCount: true,
      surface: "brown",
    },
  ];

  return (
    <Card className="card-notch">
      <CardHeader>
        <CardTitle>KPI principali</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {kpis.map(({ label, value, icon: Icon, delta, higherIsBetter, isCount, surface }) => {
          const positive = higherIsBetter ? delta >= 0 : delta <= 0;
          const magnitude = Math.abs(delta);
          const s = SURFACE[surface];
          return (
            <div key={label} className={cn("card-notch p-3", s.container)}>
              <div className={cn("flex items-center gap-2", s.iconLabel)}>
                <Icon className="h-3.5 w-3.5" />
                <p className="text-xs uppercase tracking-wider">{label}</p>
              </div>
              <p className={cn("mt-1.5 font-mono text-xl font-semibold", s.value)}>{value}</p>
              {delta !== 0 && (
                <p className={cn("mt-1 font-mono text-xs font-medium", positive ? s.positive : s.negative)}>
                  {delta > 0 ? "▲" : "▼"} {magnitude}
                  {isCount ? "" : "%"} vs ieri
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
