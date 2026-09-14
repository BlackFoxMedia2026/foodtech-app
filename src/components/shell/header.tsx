"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Agent } from "@/components/agent/agent";
import { PRIMARY_NAV, isNavActive, titoloPagina } from "@/components/shell/nav-items";
import { VenueSwitcher } from "./venue-switcher";
import { ProfileMenu } from "./profile-menu";
import { NotificationBell } from "./notification-bell";
import { RicercaGlobale } from "./ricerca-globale";

/**
 * La barra in alto è la navigazione **da scrivania**: su telefono le voci
 * spariscono e il loro posto lo prende la barra in basso
 * (`MobileNav`), che sta sotto il pollice.
 *
 * Porta sette voci e **nient'altro**: niente dropdown «Altro» in mezzo alla
 * fila. Quel menu teneva insieme cose che si aprono durante il servizio
 * (Staff, Menu) e cose che si aprono a locale chiuso (campagne, incassi,
 * impostazioni): era un terzo posto dove guardare, e non rispondeva a nessuna
 * domanda precisa. Le voci amministrative stanno sotto l'avatar
 * (`ProfileMenu`), che è già il posto dove si cercano le impostazioni.
 *
 * Le sette voci non entrano in fila con il nome intero prima dei 1536 px: sotto
 * quella soglia si accorcia l'etichetta, e sotto i 1280 px il nome va **sotto**
 * l'icona, come nella barra del telefono. Stessa gerarchia su tutti gli
 * schermi, nessuna voce che sparisce e nessuna fila che scorre di lato.
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

  return (
    <header className="relative z-10 bg-background">
      <div className="flex h-16 items-center gap-3 px-4 pt-3 lg:px-6">
        {/*
          A sinistra c'è il marchio del locale e, accanto, il titolo della
          pagina: non è più il contenuto a dire dove ci si trova, lo dice la
          testata — una riga in meno su ogni schermata. Il gruppo si può
          comprimere (`min-w-0`), altrimenti un titolo lungo spingerebbe la
          fila delle voci fuori dallo schermo invece di accorciarsi.
        */}
        <div className="flex min-w-0 items-center gap-3">
          <VenueSwitcher venues={venues} activeId={activeVenueId} titolo={titoloPagina(pathname)} />
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
                    // Tre misure per la stessa voce, e il salto avviene dove
                    // la fila smetterebbe di entrare:
                    // · fino a 1280 px il nome sta **sotto** l'icona, come
                    //   nella barra del telefono (su tablet si tocca: 44 px);
                    // · da 1280 px torna accanto all'icona, abbreviato;
                    // · da 1536 px il nome è intero.
                    // Prima il nome tornava in fila già a 1024 px: con sei
                    // voci ci stava, con sette la pillola finiva sotto la
                    // sfera dell'agente. Una barra che scorre di lato è una
                    // barra che nasconde metà prodotto.
                    "relative z-10 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-2 py-1.5 text-[10px] font-medium leading-tight transition-colors md:min-w-0 xl:flex-row xl:gap-2 xl:px-3 xl:py-2 xl:text-sm 2xl:px-3.5",
                    active ? "text-forest" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {/*
                    Su tablet c'erano **icone senza nome**: il telefono ha le
                    etichette nella barra in basso, la scrivania le ha accanto
                    alle icone, e il tablet — l'unico schermo che una hostess
                    tiene su un supporto — non le aveva. Da 768 px in su si
                    legge la parola, abbreviata finché lo spazio è quello.
                  */}
                  <span className="hidden 2xl:inline">{item.label}</span>
                  <span className="hidden md:inline 2xl:hidden">{item.shortLabel ?? item.label}</span>
                  <span className="sr-only md:hidden">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Su telefono il gruppo di destra si allarga per riempire lo spazio
            lasciato libero dalla navigazione. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* L'agente apre il gruppo. È l'unico dei quattro che non è
              un'icona ma un oggetto con un alone, e in mezzo agli altri
              quell'alone finiva addosso al cerchio della ricerca: adesso ha un
              confine libero alla sua sinistra, dove c'è solo il vuoto fra la
              navigazione e questo gruppo. */}
          <Agent />
          <RicercaGlobale />
          <NotificationBell />
          <ProfileMenu user={user} />
        </div>
      </div>
    </header>
  );
}
