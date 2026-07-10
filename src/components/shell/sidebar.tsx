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
  BrainCircuit,
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
    <nav className="glass-panel-fluted flex h-full flex-col gap-6 rounded-3xl p-4">
      <Link
        href="/overview"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-background text-accent">
          <span className="font-display text-sm font-bold">T</span>
        </span>
        <span className="text-display text-lg tracking-tight text-foreground">Tavolo</span>
      </Link>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors",
                active
                  ? "btn-ember text-white shadow-lg shadow-accent/30"
                  : "text-foreground/75 hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 pt-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          <BrainCircuit className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-display text-sm text-foreground">Agente AI</span>
          <span className="text-[11px] text-muted-foreground">Assistente attivo</span>
        </div>
      </div>
    </nav>
  );
}
