"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  UserRound,
  Megaphone,
  Sparkles,
  CreditCard,
  LineChart,
  Settings,
  BrainCircuit,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePointerGlass } from "@/lib/use-pointer-glass";
import { DiningTableIcon, TuxedoGuestIcon } from "@/components/shell/nav-icons";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const TOP_ITEM: NavItem = { href: "/overview", label: "Panoramica", icon: LayoutDashboard };

const NAV_GROUPS: { key: string; label: string; items: NavItem[] }[] = [
  {
    key: "operativita",
    label: "Operatività",
    items: [
      { href: "/bookings", label: "Prenotazioni", icon: CalendarRange },
      { href: "/floor", label: "Sala", icon: DiningTableIcon },
      { href: "/waiters", label: "Camerieri", icon: UserRound },
      { href: "/guests", label: "Ospiti", icon: TuxedoGuestIcon },
    ],
  },
  {
    key: "business",
    label: "Business",
    items: [
      { href: "/experiences", label: "Esperienze", icon: Sparkles },
      { href: "/campaigns", label: "Campagne", icon: Megaphone },
      { href: "/payments", label: "Pagamenti", icon: CreditCard },
    ],
  },
];

const ANALYTICS_ITEM: NavItem = { href: "/insights", label: "Analytics", icon: LineChart };

// The shared sliding indicator only travels between these items — they live
// together in the one scrollable list. Segnalazioni/Impostazioni sit below
// the Agente AI divider in their own block, so they keep their own static
// active background instead of participating in the slide.
const MAIN_HREFS = [TOP_ITEM.href, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)), ANALYTICS_ITEM.href];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/reports", label: "Segnalazioni", icon: Flag },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

const INDICATOR_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  registerRef,
}: {
  item: NavItem;
  active: boolean;
  registerRef?: (el: HTMLAnchorElement | null) => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      ref={registerRef}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative z-10 flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm",
        active ? "text-white" : "nav-pill text-white hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className={active ? "font-semibold" : "font-medium"}>{item.label}</span>
    </Link>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const glassRef = usePointerGlass<HTMLElement>();
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const activeHref = MAIN_HREFS.find((href) => isActive(pathname, href));
    const el = activeHref ? itemRefs.current.get(activeHref) : undefined;
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [pathname]);

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
        <Link href="/overview" className="flex items-center gap-3 px-3.5 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-background text-accent">
            <span className="font-display text-sm font-bold">T</span>
          </span>
          <span className="text-display text-lg tracking-tight text-white">Tavolo</span>
        </Link>

        <div className="relative flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {indicator && (
            <div
              aria-hidden="true"
              className="nav-pill-active pointer-events-none absolute inset-x-0 z-0 rounded-2xl"
              style={{
                height: indicator.height,
                transform: `translateY(${indicator.top}px)`,
                transition: reducedMotion ? "none" : `transform 700ms ${INDICATOR_EASING}`,
              }}
            />
          )}

          <NavLink
            item={TOP_ITEM}
            active={isActive(pathname, TOP_ITEM.href)}
            registerRef={(el) => {
              if (el) itemRefs.current.set(TOP_ITEM.href, el);
              else itemRefs.current.delete(TOP_ITEM.href);
            }}
          />

          {NAV_GROUPS.map((group) => (
            <NavGroup key={group.key} label={group.label}>
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  registerRef={(el) => {
                    if (el) itemRefs.current.set(item.href, el);
                    else itemRefs.current.delete(item.href);
                  }}
                />
              ))}
            </NavGroup>
          ))}

          <NavLink
            item={ANALYTICS_ITEM}
            active={isActive(pathname, ANALYTICS_ITEM.href)}
            registerRef={(el) => {
              if (el) itemRefs.current.set(ANALYTICS_ITEM.href, el);
              else itemRefs.current.delete(ANALYTICS_ITEM.href);
            }}
          />
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

        <div className="agent-divider flex flex-col gap-1.5 pt-4">
          {BOTTOM_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm",
                  active ? "nav-pill-active text-white" : "nav-pill text-white hover:text-white",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className={active ? "font-semibold" : "font-medium"}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
