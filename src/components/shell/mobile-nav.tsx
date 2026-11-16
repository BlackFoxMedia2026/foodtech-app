"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarPlus, ChevronDown, ListPlus, MoreHorizontal, Plus, Search, UtensilsCrossed } from "lucide-react";
import { EVENTO_APRI_RICERCA } from "@/components/shell/ricerca-globale";
import { cn } from "@/lib/utils";
import {
  MOBILE_NAV,
  isNavActive,
  primarieFuoriDallaBarra,
  sottovoceAttiva,
  type NavItem,
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
  const [altroOpen, setAltroOpen] = useState(false);
  /*
    Quale sezione di «Altro» è aperta a fisarmonica — oggi solo Marketing, che
    ha sette strumenti dentro. Sul telefono non si usa il pannello della
    scrivania: un menu che esce da un elenco già dentro una tendina finirebbe
    fuori schermo o sotto il pollice. Qui l'elenco si allunga, che è il gesto
    che il telefono conosce.
  */
  const [sezioneAperta, setSezioneAperta] = useState<string | null>(null);
  const [azioniOpen, setAzioniOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  /*
    «Altro» porta **solo** le voci principali che non entrano nella barra —
    Ospiti, Staff, Marketing, Menu. Le sezioni amministrative (incassi,
    impostazioni) stanno sotto l'avatar in alto a destra, che su telefono c'è
    come su scrivania: metterle anche qui vorrebbe dire due strade per la
    stessa pagina sullo stesso schermo, e nessuna delle due che insegna dove
    stanno le cose.

    Marketing è l'unica che non porta a una pagina: si allunga e mostra i suoi
    sette strumenti. Sono gli stessi sette del pannello della scrivania, con
    gli stessi nomi e le stesse descrizioni — la lista vive in un posto solo,
    `MARKETING_NAV`.
  */
  /* Le due domande insieme: cosa il locale ha comprato e cosa questa persona
     può aprire. Il filtro sta in `nav-items.ts`, qui si passano i dati. */
  const altreSezioni = primarieFuoriDallaBarra(telefonoAttivo, role);
  const altroAttivo = altreSezioni.some((i) => isNavActive(pathname, i));

  function vaiA(href: string) {
    setAltroOpen(false);
    setAzioniOpen(false);
    router.push(href);
  }

  return (
    <>
      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} />

      {/* Le due tendine condividono lo stesso fondo scurito. */}
      {/* Sempre presente, così si scurisce e si schiarisce in dissolvenza
          invece di comparire di colpo insieme al ventaglio. */}
      <button
        type="button"
        aria-label="Chiudi"
        aria-hidden={!(altroOpen || azioniOpen)}
        tabIndex={altroOpen || azioniOpen ? 0 : -1}
        onClick={() => {
          setAltroOpen(false);
          setAzioniOpen(false);
        }}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none md:hidden",
          altroOpen || azioniOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {altroOpen && (
        <nav
          aria-label="Altre sezioni"
          className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 overflow-hidden riquadro bg-popover shadow-xl md:hidden"
        >
          <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto">
            {/* La ricerca sta qui sul telefono: in testata la lente toglieva
                al titolo della pagina lo spazio per stare intero. */}
            <li>
              <button
                type="button"
                onClick={() => {
                  setAltroOpen(false);
                  window.dispatchEvent(new Event(EVENTO_APRI_RICERCA));
                }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm text-muted-foreground"
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                Cerca
              </button>
            </li>
            {altreSezioni.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item);

              if (item.sottovoci) {
                const aperta = sezioneAperta === item.href;
                const dentro = sottovoceAttiva(pathname, item);
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      aria-expanded={aperta}
                      onClick={() => setSezioneAperta(aperta ? null : item.href)}
                      className={cn(
                        "flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm",
                        active ? "bg-current/10 font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      {/* Quando la fisarmonica è chiusa, il nome dello
                          strumento aperto: chi torna qui da «Coupon» vede da
                          dove viene senza dover riaprire l'elenco. */}
                      {!aperta && dentro && (
                        <span className="truncate text-xs text-accent-strong">{dentro.label}</span>
                      )}
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 shrink-0 opacity-60 transition-transform duration-200",
                          aperta && "rotate-180",
                        )}
                      />
                    </button>

                    {aperta && (
                      <ul className="border-t border-border bg-black/15 py-1">
                        {item.sottovoci.map((voce) => (
                          <li key={voce.href}>
                            <SottovoceAltro
                              voce={voce}
                              attiva={dentro?.href === voce.href}
                              onNavigate={() => setAltroOpen(false)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              }

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
        {/* Un filo di respiro ai lati: «Panoramica» a 10 px riempie il suo
            posto, e senza questo tocca il bordo dello schermo. */}
        <ul className="mx-auto flex items-stretch justify-around px-1">
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <VoceBarra key={item.href} item={item} pathname={pathname} onNavigate={() => setAltroOpen(false)} />
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
                onClick={() => {
                  setAltroOpen(false);
                  setAzioniOpen((v) => !v);
                }}
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
            <VoceBarra key={item.href} item={item} pathname={pathname} onNavigate={() => setAltroOpen(false)} />
          ))}

          <li className="flex-1">
            <button
              type="button"
              aria-label="Altre sezioni"
              aria-expanded={altroOpen}
              onClick={() => {
                setAzioniOpen(false);
                setAltroOpen((v) => {
                  /* Chi è già dentro il marketing trova la sua sezione
                     aperta: altrimenti il primo gesto dopo aver aperto
                     «Altro» è riaprire la cosa in cui si trova. */
                  if (!v) {
                    const dentro = altreSezioni.find(
                      (i) => i.sottovoci && isNavActive(pathname, i),
                    );
                    setSezioneAperta(dentro?.href ?? null);
                  }
                  return !v;
                });
              }}
              className={cn(
                "flex min-h-[60px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] leading-tight",
                altroAttivo || altroOpen ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
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

/**
 * Uno strumento dentro la fisarmonica di «Altro».
 *
 * Rientrato di un gradino e con la descrizione sotto il nome, come nel
 * pannello della scrivania: gli stessi sette nomi e le stesse sette frasi su
 * tutti e due gli schermi. I 48 px di altezza sono il minimo perché un dito
 * prenda la riga giusta in una lista fitta.
 */
function SottovoceAltro({
  voce,
  attiva,
  onNavigate,
}: {
  voce: NavItem;
  attiva: boolean;
  onNavigate: () => void;
}) {
  const Icon = voce.icon;
  return (
    <Link
      href={voce.href}
      onClick={onNavigate}
      aria-current={attiva ? "page" : undefined}
      className={cn(
        "flex min-h-[48px] items-start gap-3 py-2 pl-11 pr-4",
        attiva ? "text-accent-strong" : "text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className={cn("block text-sm leading-tight", attiva ? "font-medium" : "text-foreground")}>
          {voce.label}
        </span>
        {voce.descrizione && (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{voce.descrizione}</span>
        )}
      </span>
    </Link>
  );
}
