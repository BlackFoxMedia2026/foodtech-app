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
};

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
    { label: "Coperti", value: String(totalCovers), icon: Users, delta: comparisons.covers, higherIsBetter: true },
    {
      label: "Incassi stimati",
      value: formatCurrency(estimatedRevenueCents, currency),
      icon: Wallet,
      delta: comparisons.revenue,
      higherIsBetter: true,
    },
    { label: "Occupazione", value: `${occupancyPct}%`, icon: Percent, delta: comparisons.occupancy, higherIsBetter: true },
    {
      label: "No show",
      value: String(expectedNoShow),
      icon: UserX,
      delta: comparisons.noShow,
      higherIsBetter: false,
      isCount: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI principali</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {kpis.map(({ label, value, icon: Icon, delta, higherIsBetter, isCount }) => {
          const positive = higherIsBetter ? delta >= 0 : delta <= 0;
          const magnitude = Math.abs(delta);
          return (
            <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5 text-accent" />
                <p className="text-xs uppercase tracking-wider">{label}</p>
              </div>
              <p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p>
              {delta !== 0 && (
                <p className={cn("mt-1 text-xs font-medium", positive ? "text-emerald-400" : "text-rose-400")}>
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
