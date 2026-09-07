"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, ListPlus, Plus, Search, UtensilsCrossed } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { WalkInDialog } from "@/components/bookings/walk-in-dialog";

const TILE =
  "finish-sage-tile flex min-h-[84px] flex-col items-start gap-2.5 rounded-xl border border-[#2f5b4a] p-3 text-left text-cream transition-colors hover:brightness-110";
const CHIP =
  "finish-metal-chip grid h-9 w-9 place-items-center rounded-full shadow-[0_8px_18px_rgba(0,0,0,0.3)]";

const LINKS = [
  { href: "/bookings/new", label: "Nuova prenotazione", icon: Plus, tint: "bg-cream/20 text-cream" },
  { href: "/waitlist", label: "Lista d'attesa", icon: ListPlus, tint: "bg-cream/15 text-cream" },
  { href: "/guests", label: "Cerca ospite", icon: Search, tint: "bg-sage/20 text-sage" },
];

export function QuickActions() {
  const [walkInOpen, setWalkInOpen] = useState(false);

  return (
    <Card className="card-notch">
      <CardHeader>
        <CardTitle>Azioni rapide</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {LINKS.map(({ href, label, icon: Icon, tint }) => (
          <Link key={href} href={href} className={TILE}>
            <span className={`${CHIP} ${tint}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium leading-tight">{label}</span>
          </Link>
        ))}

        {/* Il walk-in si apre qui invece di portare in Sala: chi lo usa ha una
            persona in piedi davanti, e un cambio di pagina è un tocco in più. */}
        <button type="button" onClick={() => setWalkInOpen(true)} className={TILE}>
          <span className={`${CHIP} bg-terracotta/20 text-terracotta`}>
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium leading-tight">Accomoda walk-in</span>
        </button>
      </CardContent>

      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} />
    </Card>
  );
}
