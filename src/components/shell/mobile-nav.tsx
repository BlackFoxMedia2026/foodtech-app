"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarPlus, ListPlus, MoreHorizontal, Plus, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOBILE_NAV,
  PROFILE_NAV,
  isNavActive,
  primarieFuoriDallaBarra,
} from "@/components/shell/nav-items";
import { WalkInDialog } from "@/components/bookings/walk-in-dialog";
import type { StaffRole } from "@prisma/client";

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
export function MobileNav({
  canManageBookings,
  role,
  telefonoAttivo = false,
}: {
  canManageBookings: boolean;
  /** Il ruolo: «Altro» porta solo le sezioni che questo ruolo può aprire. */
  role: StaffRole;
  /** Se questo locale ha il telefono collegato: decide la voce «Telefono». */
  telefonoAttivo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [azioniOpen, setAzioniOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  /* «Altro» è acceso sulla sua pagina e dentro tutto quello che ci si apre:
     le sezioni fuori dalla barra e le voci del profilo. */
  const altroAttivo =
    pathname === "/altro" ||
    [...primarieFuoriDallaBarra(telefonoAttivo, role), ...PROFILE_NAV].some((i) =>
      isNavActive(pathname, i),
    );

  function vaiA(href: string) {
    setAzioniOpen(false);
    router.push(href);
  }

  return (
    <>
      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} />

      {/* Sempre presente, così si scurisce e si schiarisce in dissolvenza
          invece di comparire di colpo insieme al ventaglio. */}
      <button
        type="button"
        aria-label="Chiudi"
        aria-hidden={!azioniOpen}
        tabIndex={azioniOpen ? 0 : -1}
        onClick={() => setAzioniOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none md:hidden",
          azioniOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        {/* Un filo di respiro ai lati: «Panoramica» a 10 px riempie il suo
            posto, e senza questo tocca il bordo dello schermo. */}
        <ul className="mx-auto flex items-stretch justify-around px-1">
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <VoceBarra key={item.href} item={item} pathname={pathname} onNavigate={() => setAzioniOpen(false)} />
          ))}

          <li className="relative flex items-center justify-center px-1">
            {canManageBookings && (
              /* Il ventaglio: tre cerchi che escono dal «+» lungo un arco.
                 Stanno sempre nel DOM, così l'apertura e la chiusura si
                 animano; da chiusi sono raccolti sotto il «+» e non si
                 toccano. Il centro dell'arco è il centro del «+» (che sta
                 alzato di 40 px, metà fuori dalla barra). */
              <div
                role="group"
                aria-label="Azioni rapide"
                aria-hidden={!azioniOpen}
                className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 -translate-y-5"
              >
                {[
                  {
                    icon: CalendarPlus,
                    label: "Prenotazione",
                    aria: "Nuova prenotazione",
                    pos: [-104, -100],
                    onClick: () => vaiA("/bookings/new"),
                  },
                  {
                    icon: ListPlus,
                    label: "Lista d'attesa",
                    aria: "Aggiungi in lista d'attesa",
                    pos: [0, -158],
                    onClick: () => vaiA("/waitlist"),
                  },
                  {
                    icon: UtensilsCrossed,
                    label: "Walk-in",
                    aria: "Accomoda un walk-in",
                    pos: [104, -100],
                    onClick: () => {
                      setAzioniOpen(false);
                      setWalkInOpen(true);
                    },
                  },
                ].map((a, i) => (
                  <PetaloAzione
                    key={a.label}
                    {...a}
                    aperto={azioniOpen}
                    ordine={i}
                  />
                ))}
              </div>
            )}
            {canManageBookings ? (
              <button
                type="button"
                aria-label={azioniOpen ? "Chiudi azioni rapide" : "Azioni rapide"}
                aria-expanded={azioniOpen}
                onClick={() => setAzioniOpen((v) => !v)}
                /* Più grande e sporgente: metà del cerchio esce sopra il filo
                    della barra, così si vede come il gesto principale. */
                className="relative z-10 -mt-10 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-cta text-cta-ink shadow-xl ring-4 ring-background transition-transform active:scale-95"
              >
                {/* Il «+» ruota di 45° e diventa la ✕: è lo stesso segno che
                    si chiude, non un'icona che ne sostituisce un'altra. */}
                <Plus
                  className={cn(
                    "h-8 w-8 transition-transform duration-300 ease-out motion-reduce:transition-none",
                    azioniOpen && "rotate-45",
                  )}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="h-[72px] w-[72px]" aria-hidden="true" />
            )}
          </li>

          {MOBILE_NAV.slice(2).map((item) => (
            <VoceBarra key={item.href} item={item} pathname={pathname} onNavigate={() => setAzioniOpen(false)} />
          ))}

          <li className="flex-1">
            {/* «Altro» porta a una pagina, come la quinta linguetta di
                un'app: profilo in cima, sezioni a gruppi, impostazioni ed
                «Esci» in fondo (`/altro`). */}
            <Link
              href="/altro"
              onClick={() => setAzioniOpen(false)}
              aria-current={altroAttivo ? "page" : undefined}
              className={cn(
                "flex min-h-[60px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] leading-tight",
                altroAttivo ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
              Altro
            </Link>
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
          // Con quattro voci più il «+» ogni posto è largo un quinto dello
          // schermo: a 12 px ci stanno «Panoramica» e «Prenotazioni» intere.
          "flex min-h-[60px] flex-col items-center justify-center gap-1 px-0.5 py-2 text-[12px] leading-tight",
          active ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="h-6 w-6 shrink-0" />
        <span className="w-full truncate text-center">{item.label}</span>
      </Link>
    </li>
  );
}

/** Curva a molla per l'apertura: arriva, supera di poco il punto e torna. */
const MOLLA = "cubic-bezier(0.34, 1.56, 0.64, 1)";
/** Curva per la chiusura: parte piano e accelera verso il «+», senza rimbalzo. */
const RIENTRO = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * Un cerchio del ventaglio del «+».
 *
 * Da chiuso è piccolo, trasparente e nascosto **dietro** il «+». All'apertura
 * esce lungo la sua direzione con una molla, uno dopo l'altro (45 ms di
 * scarto, da sinistra a destra), e il nome compare solo quando il cerchio è
 * quasi arrivato: un'etichetta che vola insieme al cerchio si legge male e
 * sporca il movimento. Alla chiusura tutto rientra insieme, più veloce e
 * senza rimbalzo — un rimbalzo verso il centro farebbe sbucare i cerchi
 * dall'altra parte del «+».
 */
function PetaloAzione({
  icon: Icon,
  label,
  aria,
  pos,
  onClick,
  aperto,
  ordine,
}: {
  icon: typeof Plus;
  label: string;
  aria: string;
  /** Dove si ferma il centro del cerchio, rispetto al centro del «+». */
  pos: number[];
  onClick: () => void;
  aperto: boolean;
  ordine: number;
}) {
  const [x, y] = pos;
  return (
    <button
      type="button"
      aria-label={aria}
      tabIndex={aperto ? 0 : -1}
      onClick={onClick}
      style={{
        // -30px: il punto di riferimento è il centro del cerchio, non del
        // pulsante intero (che ha anche il nome sotto).
        transform: aperto
          ? `translate(-50%, -30px) translate(${x}px, ${y}px) scale(1)`
          : "translate(-50%, -30px) scale(0.2)",
        transitionProperty: "transform, opacity",
        transitionDuration: aperto ? "420ms, 160ms" : "200ms, 160ms",
        transitionTimingFunction: aperto ? `${MOLLA}, linear` : RIENTRO,
        transitionDelay: aperto ? `${ordine * 45}ms` : "0ms",
      }}
      className={cn(
        "absolute left-0 top-0 flex w-24 flex-col items-center gap-1.5 motion-reduce:!transition-none",
        aperto ? "pointer-events-auto opacity-100" : "opacity-0",
      )}
    >
      <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-popover text-foreground shadow-xl ring-1 ring-border transition-transform active:scale-90">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span
        style={{
          transitionDelay: aperto ? `${ordine * 45 + 220}ms` : "0ms",
        }}
        className={cn(
          "whitespace-nowrap rounded-full bg-popover/95 px-2.5 py-0.5 text-[12px] font-medium leading-tight text-foreground shadow-sm transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          aperto ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        )}
      >
        {label}
      </span>
    </button>
  );
}
