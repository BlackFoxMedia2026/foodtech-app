"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  LayoutPanelLeft,
  Users,
  Megaphone,
  Sparkles,
  CreditCard,
  LineChart,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/overview", label: "Panoramica", icon: LayoutDashboard },
  { href: "/bookings", label: "Prenotazioni", icon: CalendarRange },
  { href: "/floor", label: "Sala", icon: LayoutPanelLeft },
  { href: "/guests", label: "Ospiti", icon: Users },
  { href: "/experiences", label: "Esperienze", icon: Sparkles },
  { href: "/campaigns", label: "Campagne", icon: Megaphone },
  { href: "/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/insights", label: "Analytics", icon: LineChart },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-1 px-3 py-4">
      <Link
        href="/overview"
        className="mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-display text-base font-semibold tracking-tight"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-carbon-800 text-sand-50">
          <span className="font-display text-sm">T</span>
        </span>
        Tavolo
      </Link>

      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-carbon-800 text-sand-50"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-gilt-light" : "text-current")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
