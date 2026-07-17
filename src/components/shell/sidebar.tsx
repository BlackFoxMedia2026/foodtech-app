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
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePointerGlass } from "@/lib/use-pointer-glass";
import { DiningTableIcon, TuxedoGuestIcon } from "@/components/shell/nav-icons";
import { useSidebarCollapse } from "@/components/shell/sidebar-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Percorsi aggiuntivi che contano come "attivo" per questa voce anche se l'href non corrisponde — es. Marketing resta evidenziata dentro /campaigns/*, rimasto al suo path per non rompere il wizard esistente. */
  matchPrefixes?: string[];
};

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
      { href: "/marketing", label: "Marketing", icon: Megaphone, matchPrefixes: ["/campaigns"] },
      { href: "/payments", label: "Pagamenti", icon: CreditCard },
    ],
  },
];

const ANALYTICS_ITEM: NavItem = { href: "/insights", label: "Analytics", icon: LineChart };

// The shared sliding indicator only travels between these items — they live
// together in the one scrollable list. Segnalazioni/Impostazioni moved to
// the profile dropdown menu, so they no longer have a place here at all.
const MAIN_ITEMS: NavItem[] = [TOP_ITEM, ...NAV_GROUPS.flatMap((g) => g.items), ANALYTICS_ITEM];

const INDICATOR_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
}

function NavLink({
  item,
  active,
  collapsed,
  registerRef,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  registerRef?: (el: HTMLAnchorElement | null) => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      ref={registerRef}
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative z-10 flex items-center gap-3 rounded-2xl py-3 text-sm",
        collapsed ? "justify-center px-0" : "px-3.5",
        active ? "text-white" : "nav-pill text-white hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className={active ? "font-semibold" : "font-medium"}>{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({ label, collapsed, children }: { label: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <div>
      {!collapsed && <p className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-white/70">{label}</p>}
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const glassRef = usePointerGlass<HTMLElement>();
  const { collapsed, toggle } = useSidebarCollapse();
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
    const activeItem = MAIN_ITEMS.find((item) => isActive(pathname, item));
    const el = activeItem ? itemRefs.current.get(activeItem.href) : undefined;
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [pathname, collapsed]);

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        ref={glassRef}
        aria-label="Navigazione principale"
        className={cn("liquid-sidebar flex h-full flex-col gap-6", collapsed ? "p-3" : "p-5")}
      >
        {/* Layer 1: refracts the real mesh background behind the sidebar. */}
        <div className="liquid-sidebar__refraction" aria-hidden="true" />
        {/* Layer 2: blur/saturate/contrast + adaptive dark tint from the shared gradient. */}
        <div className="liquid-sidebar__glass" aria-hidden="true" />
        {/* Layer 3: border light, top sheen, mouse-reactive highlight. */}
        <div className="liquid-sidebar__highlights" aria-hidden="true" />

        {/* Layer 4: real content — never blurred or distorted. */}
        <div className="liquid-sidebar__content flex h-full flex-col gap-6">
          <div className={cn("flex py-3", collapsed ? "flex-col items-center gap-3 px-0" : "items-center justify-between px-3.5")}>
            <Link href="/overview" className="flex items-center gap-3 overflow-hidden">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background text-accent">
                <span className="font-display text-sm font-bold">T</span>
              </span>
              {!collapsed && <span className="text-display text-lg tracking-tight text-white">Tavolo</span>}
            </Link>

            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Espandi la sidebar" : "Contrai la sidebar"}
              className="sidebar-toggle"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

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
              active={isActive(pathname, TOP_ITEM)}
              collapsed={collapsed}
              registerRef={(el) => {
                if (el) itemRefs.current.set(TOP_ITEM.href, el);
                else itemRefs.current.delete(TOP_ITEM.href);
              }}
            />

            {NAV_GROUPS.map((group) => (
              <NavGroup key={group.key} label={group.label} collapsed={collapsed}>
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item)}
                    collapsed={collapsed}
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
              active={isActive(pathname, ANALYTICS_ITEM)}
              collapsed={collapsed}
              registerRef={(el) => {
                if (el) itemRefs.current.set(ANALYTICS_ITEM.href, el);
                else itemRefs.current.delete(ANALYTICS_ITEM.href);
              }}
            />
          </div>

          <div className={cn("agent-divider flex items-center gap-3 pt-4", collapsed && "justify-center")}>
            <div
              className={cn(
                "icon-glass-circle grid shrink-0 place-items-center rounded-full text-white",
                collapsed ? "h-8 w-8" : "h-11 w-11",
              )}
            >
              <BrainCircuit className={collapsed ? "h-4 w-4" : "h-5 w-5"} />
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight">
                <span className="text-display text-sm text-white">Agente AI</span>
                <span className="flex items-center gap-1.5 text-[11px] text-[#f5e6da]/60">
                  <span className="agent-status-dot" aria-hidden="true" />
                  Assistente attivo
                </span>
              </div>
            )}
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}
