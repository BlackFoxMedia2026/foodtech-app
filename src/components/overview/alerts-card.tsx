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
    { count: counts.birthdays, label: "Compleanno oggi", icon: Cake, tone: "accent" as const },
    { count: counts.pendingConfirmations, label: "Tavoli da confermare", icon: Clock, tone: "accent" as const },
    { count: counts.allergies, label: "Allergia segnalata", icon: ShieldAlert, tone: "danger" as const },
    { count: counts.vip, label: "Prenotazione VIP", icon: Star, tone: "accent" as const },
  ];
  const hasAny = items.some((i) => i.count > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Alert e promemoria</CardTitle>
        <Link href="/bookings" className="text-xs font-medium text-accent hover:underline">
          Vedi tutti
        </Link>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Tutto sotto controllo.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {items.map(({ count, label, icon: Icon, tone }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon className={cn("h-4 w-4 shrink-0", tone === "danger" ? "text-rose-400" : "text-accent")} />
                <p className="text-sm leading-tight">
                  <span className="font-semibold">{count}</span> <span className="text-muted-foreground">{label}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
