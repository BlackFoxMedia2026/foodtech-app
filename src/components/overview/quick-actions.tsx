import Link from "next/link";
import { Plus, Search, CalendarRange, Ban } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const ACTIONS = [
  { href: "/bookings/new", label: "Nuova prenotazione", icon: Plus, tint: "bg-cream/20 text-cream" },
  { href: "/guests", label: "Cerca ospite", icon: Search, tint: "bg-cream/15 text-cream" },
  { href: "/bookings", label: "Apri calendario", icon: CalendarRange, tint: "bg-sage/20 text-sage" },
  { href: "/floor", label: "Blocca tavolo", icon: Ban, tint: "bg-terracotta/20 text-terracotta" },
];

export function QuickActions() {
  return (
    <Card className="card-notch">
      <CardHeader>
        <CardTitle>Azioni rapide</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {ACTIONS.map(({ href, label, icon: Icon, tint }) => (
          <Link
            key={href}
            href={href}
            className="finish-sage-tile flex flex-col items-start gap-2.5 rounded-xl border border-[#2f5b4a] p-3 text-cream transition-colors hover:brightness-110"
          >
            <span className={`finish-metal-chip grid h-9 w-9 place-items-center rounded-full shadow-[0_8px_18px_rgba(0,0,0,0.3)] ${tint}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium leading-tight">{label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
