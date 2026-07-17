import Link from "next/link";
import { Plus, Search, CalendarRange, Ban } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { href: "/bookings/new", label: "Nuova prenotazione", icon: Plus, primary: true },
  { href: "/guests", label: "Cerca ospite", icon: Search },
  { href: "/bookings", label: "Apri calendario", icon: CalendarRange },
  { href: "/floor", label: "Blocca tavolo", icon: Ban },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Azioni rapide</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {ACTIONS.map(({ href, label, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-start gap-2.5 rounded-xl p-3 transition-colors hover:bg-white/5"
          >
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full",
                primary ? "bg-accent text-white" : "bg-white/10 text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium leading-tight">{label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
