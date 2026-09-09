"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Agent } from "@/components/agent/agent";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  isNavActive,
  secondarioPerGruppo,
} from "@/components/shell/nav-items";
import { VenueSwitcher } from "./venue-switcher";
import { ProfileMenu } from "./profile-menu";
import { NotificationBell } from "./notification-bell";
import { RicercaGlobale } from "./ricerca-globale";

/**
 * La barra in alto è la navigazione **da scrivania**: su telefono le voci
 * spariscono e il loro posto lo prende la barra in basso
 * (`MobileNav`), che sta sotto il pollice.
 *
 * Prima tutte le voci stavano in una fila con scorrimento orizzontale: a
 * 390 px se ne vedeva **una su nove**, e niente lo suggeriva. Con la lista
 * d'attesa siamo passati a dieci voci e la fila non ci stava più nemmeno a
 * 1440 px. Da qui le due scelte: sei voci operative in barra, il resto sotto
 * «Altro».
 */
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
    const activeItem = PRIMARY_NAV.find((item) => isNavActive(pathname, item));
    const el = activeItem ? itemRefs.current.get(activeItem.href) : undefined;
    setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [pathname]);

  const secondaryActive = SECONDARY_NAV.some((item) => isNavActive(pathname, item));

  return (
    <header className="relative z-10 bg-background">
      <div className="flex h-16 items-center gap-3 px-4 pt-3 lg:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <VenueSwitcher venues={venues} activeId={activeVenueId} />
        </div>

        {/* Su telefono la navigazione sta in basso: qui non si scorre più niente. */}
        <nav
          aria-label="Navigazione principale"
          className="hidden min-w-0 flex-1 justify-center md:flex"
        >
          <div className="relative flex items-center gap-1 rounded-full border border-border bg-muted/70 p-1">
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

            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.href, el);
                    else itemRefs.current.delete(item.href);
                  }}
                  title={item.label}
                  className={cn(
                    // Sotto lg restano le sole icone: a 768 e 1024 px sei
                    // etichette più "Altro" non ci stavano, e una barra che
                    // scorre di lato è una barra che nasconde metà prodotto.
                    // 44 px di altezza minima perché su tablet si tocca.
                    // Su tablet l'etichetta sta **sotto** l'icona, come nella
                    // barra in basso del telefono: in fila i sei nomi
                    // chiedevano 671 px e lo spazio è 522, e infatti la
                    // pillola veniva tagliata e finiva sotto la sfera
                    // dell'agente. Sopra i 1024 px tornano accanto.
                    "relative z-10 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-2 py-1.5 text-[10px] font-medium leading-tight transition-colors md:min-w-0 lg:flex-row lg:gap-2 lg:px-3.5 lg:py-2 lg:text-sm",
                    active ? "text-forest" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {/*
                    Su tablet c'erano **sei icone senza nome**: il telefono ha
                    le etichette nella barra in basso, la scrivania le ha
                    accanto alle icone, e il tablet — l'unico schermo che una
                    hostess tiene su un supporto — non le aveva. Da 768 px in
                    su si legge la parola.
                  */}
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="hidden md:inline xl:hidden">{item.shortLabel ?? item.label}</span>
                  <span className="sr-only md:hidden">{item.label}</span>
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "relative z-10 flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-[10px] font-medium transition-colors lg:px-3.5 lg:py-2 lg:text-sm",
                  secondaryActive
                    ? "bg-cream text-forest"
                    : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
              >
                <span className="flex flex-col items-center gap-0.5 lg:flex-row lg:gap-1.5">
                  Altro
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {/*
                  Sette voci in fila si leggono una per una. In tre gruppetti
                  con l'etichetta, l'occhio salta alla parte che c'entra: le
                  cose da configurare, quelle da guardare, quelle che non
                  riguardano il ristorante.
                */}
                {secondarioPerGruppo().map((gruppo, i) => (
                  <div key={gruppo.label}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {gruppo.label}
                    </DropdownMenuLabel>
                    {gruppo.voci.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link
                            href={item.href}
                            aria-current={isNavActive(pathname, item) ? "page" : undefined}
                            className="flex items-center gap-2"
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>

        {/* Su telefono il gruppo di destra si allarga per riempire lo spazio
            lasciato libero dalla navigazione. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* La ricerca sta a sinistra dell'agente: è la cosa che si usa più
              spesso delle tre, e il pollice sul telefono arriva prima qui. */}
          <RicercaGlobale />
          <Agent />
          <NotificationBell />
          <ProfileMenu user={user} />
        </div>
      </div>
    </header>
  );
}
