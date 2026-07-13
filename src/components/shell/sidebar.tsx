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
import { usePointerGlass } from "@/lib/use-pointer-glass";

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
  const glassRef = usePointerGlass<HTMLElement>();

  return (
    <nav
      ref={glassRef}
      aria-label="Navigazione principale"
      className="liquid-sidebar flex h-full flex-col gap-6 p-5"
    >
      {/* Layer 1: refracts the real mesh background behind the sidebar. */}
      <div className="liquid-sidebar__refraction" aria-hidden="true" />
      {/* Layer 2: blur/saturate/contrast + adaptive dark tint from the shared gradient. */}
      <div className="liquid-sidebar__glass" aria-hidden="true" />
      {/* Layer 3: border light, top sheen, mouse-reactive highlight. */}
      <div className="liquid-sidebar__highlights" aria-hidden="true" />

      {/* Layer 4: real content — never blurred or distorted. */}
      <div className="liquid-sidebar__content flex h-full flex-col gap-6">
        <Link href="/overview" className="liquid-sidebar__logo flex items-center gap-3 rounded-2xl px-3.5 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-background text-accent">
            <span className="font-display text-sm font-bold">T</span>
          </span>
          <span className="text-display text-lg tracking-tight text-white">Tavolo</span>
        </Link>

        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm",
                  active ? "nav-pill-active text-white" : "nav-pill text-[#f5e6da]/80 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="agent-divider flex items-center gap-3 pt-4">
          <div className="icon-glass-circle grid h-11 w-11 shrink-0 place-items-center rounded-full text-white">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-display text-sm text-white">Agente AI</span>
            <span className="flex items-center gap-1.5 text-[11px] text-[#f5e6da]/60">
              <span className="agent-status-dot" aria-hidden="true" />
              Assistente attivo
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
