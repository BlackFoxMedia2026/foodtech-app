"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarPlus, ListPlus, MoreHorizontal, Plus, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_NAV, PRIMARY_NAV, SECONDARY_NAV, isNavActive } from "@/components/shell/nav-items";

/**
 * Navigazione da telefono, pensata per il servizio.
 *
 * Chi la usa è in piedi in sala con una mano occupata: le quattro voci stanno
 * sotto il pollice, e al centro c'è il gesto che si fa più spesso — aggiungere
 * qualcuno. Prima la navigazione era la stessa fila della scrivania con
 * scorrimento orizzontale: a 390 px si vedeva **una voce su nove**, e niente
 * diceva che si potesse scorrere.
 *
 * Tutti i bersagli sono almeno 44×44 px, che è il minimo perché un dito li
 * prenda senza sbagliare.
 */
export function MobileNav({ canManageBookings }: { canManageBookings: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [altroOpen, setAltroOpen] = useState(false);
  const [azioniOpen, setAzioniOpen] = useState(false);

  const altroAttivo =
    SECONDARY_NAV.some((i) => isNavActive(pathname, i)) ||
    PRIMARY_NAV.filter((i) => !MOBILE_NAV.includes(i)).some((i) => isNavActive(pathname, i));

  function vaiA(href: string) {
    setAltroOpen(false);
    setAzioniOpen(false);
    router.push(href);
  }

  return (
    <>
      {/* Le due tendine condividono lo stesso fondo scurito. */}
      {(altroOpen || azioniOpen) && (
        <button
          type="button"
          aria-label="Chiudi"
          onClick={() => {
            setAltroOpen(false);
            setAzioniOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}

      {azioniOpen && canManageBookings && (
        <div
          role="dialog"
          aria-label="Azioni rapide"
          className="fixed inset-x-3 bottom-24 z-50 space-y-2 md:hidden"
        >
          <AzioneRapida
            icon={CalendarPlus}
            label="Nuova prenotazione"
            hint="Al telefono o allo sportello"
            onClick={() => vaiA("/bookings/new")}
          />
          <AzioneRapida
            icon={ListPlus}
            label="Aggiungi in lista d'attesa"
            hint="Quando il locale è pieno"
            onClick={() => vaiA("/waitlist")}
          />
          <AzioneRapida
            icon={UtensilsCrossed}
            label="Accomoda un walk-in"
            hint="Chi entra senza prenotazione"
            onClick={() => vaiA("/floor")}
          />
        </div>
      )}

      {altroOpen && (
        <nav
          aria-label="Altre sezioni"
          className="fixed inset-x-3 bottom-24 z-50 overflow-hidden rounded-md border border-border bg-popover shadow-xl md:hidden"
        >
          <ul className="divide-y divide-border">
            {[...PRIMARY_NAV.filter((i) => !MOBILE_NAV.includes(i)), ...SECONDARY_NAV].map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setAltroOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[52px] items-center gap-3 px-4 text-sm",
                      active ? "bg-current/10 font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex items-stretch justify-around">
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <VoceBarra key={item.href} item={item} pathname={pathname} onNavigate={() => setAltroOpen(false)} />
          ))}

          <li className="flex items-center justify-center px-1">
            {canManageBookings ? (
              <button
                type="button"
                aria-label={azioniOpen ? "Chiudi azioni rapide" : "Azioni rapide"}
                aria-expanded={azioniOpen}
                onClick={() => {
                  setAltroOpen(false);
                  setAzioniOpen((v) => !v);
                }}
                className="-mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream text-clay-ink shadow-lg transition-transform active:scale-95"
              >
                {azioniOpen ? (
                  <X className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Plus className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="h-14 w-14" aria-hidden="true" />
            )}
          </li>

          {MOBILE_NAV.slice(2).map((item) => (
            <VoceBarra key={item.href} item={item} pathname={pathname} onNavigate={() => setAltroOpen(false)} />
          ))}

          <li className="flex-1">
            <button
              type="button"
              aria-label="Altre sezioni"
              aria-expanded={altroOpen}
              onClick={() => {
                setAzioniOpen(false);
                setAltroOpen((v) => !v);
              }}
              className={cn(
                "flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px]",
                altroAttivo || altroOpen ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              Altro
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function VoceBarra({
  item,
  pathname,
  onNavigate,
}: {
  item: (typeof MOBILE_NAV)[number];
  pathname: string;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const active = isNavActive(pathname, item);
  return (
    <li className="flex-1">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px]",
          active ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {item.shortLabel ?? item.label}
      </Link>
    </li>
  );
}

function AzioneRapida({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-md border border-border bg-popover px-4 text-left"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-current/10">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
