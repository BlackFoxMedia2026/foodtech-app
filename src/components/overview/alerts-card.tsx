import Link from "next/link";
import { Cake, Clock, ShieldAlert, Star } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AlertsCard({
  counts,
}: {
  counts: { birthdays: number; pendingConfirmations: number; allergies: number; vip: number };
}) {
  const items = [
    { count: counts.birthdays, label: "Compleanno oggi", icon: Cake, tone: "cream" as const },
    { count: counts.pendingConfirmations, label: "Tavoli da confermare", icon: Clock, tone: "neutral" as const },
    { count: counts.allergies, label: "Allergia segnalata", icon: ShieldAlert, tone: "danger" as const },
    { count: counts.vip, label: "Prenotazione VIP", icon: Star, tone: "gold" as const },
  ];
  const hasAny = items.some((i) => i.count > 0);

  const ICON_TONE = {
    neutral: "text-card-foreground/65",
    danger: "text-rose-500",
    cream: "text-cream",
    gold: "text-surface-brown-light",
  };

  return (
    <Card className="card-notch">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Alert e promemoria</CardTitle>
        <Link href="/bookings" className="text-xs font-medium text-surface-brown-light hover:underline">
          Vedi tutti
        </Link>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="rounded-md border border-dashed border-cream/20 bg-white/5 p-6 text-center text-sm text-card-foreground/65">
            Tutto sotto controllo.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {items.map(({ count, label, icon: Icon, tone }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon className={cn("h-4 w-4 shrink-0", ICON_TONE[tone])} />
                <p className="text-sm leading-tight">
                  <span className="font-mono font-semibold">{count}</span> <span className="text-card-foreground/65">{label}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
