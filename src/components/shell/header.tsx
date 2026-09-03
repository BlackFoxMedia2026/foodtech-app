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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DiningTableIcon, TuxedoGuestIcon } from "@/components/shell/nav-icons";
import { Agent } from "@/components/agent/agent";
import { VenueSwitcher } from "./venue-switcher";
import { ProfileMenu } from "./profile-menu";
import { NotificationBell } from "./notification-bell";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Percorsi aggiuntivi che contano come "attivo" per questa voce anche se l'href non corrisponde — es. Marketing resta evidenziata dentro /campaigns/*, rimasto al suo path per non rompere il wizard esistente. */
  matchPrefixes?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Panoramica", icon: LayoutDashboard },
  { href: "/bookings", label: "Prenotazioni", icon: CalendarRange },
  { href: "/floor", label: "Sala", icon: DiningTableIcon },
  { href: "/waiters", label: "Camerieri", icon: UserRound },
  { href: "/guests", label: "Ospiti", icon: TuxedoGuestIcon },
  { href: "/experiences", label: "Esperienze", icon: Sparkles },
  { href: "/marketing", label: "Marketing", icon: Megaphone, matchPrefixes: ["/campaigns"] },
  { href: "/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/insights", label: "Analytics", icon: LineChart },
];

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
}

export function Header({
  user,
  venues,
  activeVenueId,
}: {
  user: { name?: string | null; email?: string | null };
  venues: { id: string; name: string; city: string | null }[];
  activeVenueId: string;
}) {
  const pathname = usePathname();
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const activeItem = NAV_ITEMS.find((item) => isActive(pathname, item));
    const el = activeItem ? itemRefs.current.get(activeItem.href) : undefined;
    setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [pathname]);

  return (
    <header className="relative z-10 bg-background">
      <div className="flex h-16 items-center gap-3 px-4 pt-3 lg:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <VenueSwitcher venues={venues} activeId={activeVenueId} />
        </div>

        <nav aria-label="Navigazione principale" className="nav-scroll min-w-0 flex-1 overflow-x-auto">
          <div className="relative mx-auto flex w-max items-center gap-1 rounded-full border border-border bg-muted/70 p-1">
            {indicator && (
              <div
                aria-hidden="true"
                className="absolute inset-y-1 z-0 rounded-full bg-cream"
                style={{
                  left: indicator.left,
                  width: indicator.width,
                  transition: reducedMotion ? "none" : "left 260ms ease-in-out, width 260ms ease-in-out",
                }}
              />
            )}
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.href, el);
                    else itemRefs.current.delete(item.href);
                  }}
                  className={cn(
                    "relative z-10 flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    active ? "text-forest" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Agent />
          <NotificationBell />
          <ProfileMenu user={user} />
        </div>
      </div>
    </header>
  );
}
