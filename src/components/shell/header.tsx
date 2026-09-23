"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Agent } from "@/components/agent/agent";
import {
  vociPrincipali,
  classiVoce,
  isNavActive,
  titoloPagina,
} from "@/components/shell/nav-items";
import type { StaffRole } from "@prisma/client";
import { MarketingMenu } from "./marketing-menu";
import { VenueSwitcher } from "./venue-switcher";
import { ProfileMenu } from "./profile-menu";
import { NotificationBell } from "./notification-bell";
import { RicercaGlobale } from "./ricerca-globale";
import { IndicatoreTelefono } from "@/components/telefono/indicatore-telefono";
import { NavigazioneImpostazioni } from "@/components/settings/navigazione-impostazioni";

/**
 * La barra in alto è la navigazione **da scrivania**: su telefono le voci
 * spariscono e il loro posto lo prende la barra in basso
 * (`MobileNav`), che sta sotto il pollice.
 *
 * Porta le voci di `PRIMARY_NAV` e **nient'altro**: niente dropdown «Altro»
 * in mezzo alla fila. Quel menu teneva insieme cose che si aprono durante il
 * servizio (Staff, Menu) e cose che si aprono a locale chiuso (campagne,
 * incassi, impostazioni): era un terzo posto dove guardare, e non rispondeva
 * a nessuna domanda precisa. Le voci amministrative stanno sotto l'avatar
 * (`ProfileMenu`), che è già il posto dove si cercano le impostazioni.
 *
 * Le voci non entrano in fila con il nome intero prima dei 1536 px: sotto
 * quella soglia si accorcia l'etichetta, e sotto i 1280 px il nome va **sotto**
 * l'icona, come nella barra del telefono. Stessa gerarchia su tutti gli
 * schermi, nessuna voce che sparisce e nessuna fila che scorre di lato.
 *
 * **Dentro le Impostazioni la barra cambia contenuto.** Le otto voci del
 * servizio spariscono e al loro posto compaiono le quattro sezioni della
 * pagina, nello stesso contenitore e con la stessa pillola che scorre. Non è
 * una decorazione: tenere le due navigazioni insieme voleva dire due file di
 * pillole a tre centimetri l'una dall'altra, e quella di sotto — quattro
 * parole in riga, crema su verde — si leggeva come una fila di filtri. Una
 * barra sola che cambia quello che contiene dice «sei in un'altra area» senza
 * doverlo scrivere.
 */
export function Header({
  user,
  venues,
  activeVenueId,
  role,
  telefonoAttivo = false,
  conStaffApp = false,
}: {
  user: { name?: string | null; email?: string | null };
  venues: { id: string; name: string; city: string | null }[];
  activeVenueId: string;
  /** Il ruolo di chi guarda: decide quali voci esistono in barra. */
  role: StaffRole;
  /** Se questo locale ha il telefono collegato: decide la voce «Telefono». */
  telefonoAttivo?: boolean;
  /** Vero quando questa persona ha anche un'anagrafica, e quindi la Staff App. */
  conStaffApp?: boolean;
}) {
  const pathname = usePathname();
  /* Memoizzata perché entra nelle dipendenze dell'effetto che misura la
     pillola: un array nuovo a ogni rendering rifarebbe la misura a ogni
     battito. Le voci passano da **due** filtri, che `vociPrincipali` applica
     insieme: quello che il locale ha comprato e quello che questo ruolo può
     aprire. */
  const voci = useMemo(
    () => vociPrincipali(telefonoAttivo, role),
    [telefonoAttivo, role],
  );
  const inImpostazioni =
    pathname === "/settings" || pathname.startsWith("/settings/");
  // `HTMLElement` e non `HTMLAnchorElement`: Marketing non è un link ma il
  // bottone che apre il suo menu, e occupa lo stesso posto in fila.
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    // Dentro le Impostazioni questa fila non è montata: misurarla darebbe zero
    // e la pillola ricomparirebbe larga zero all'uscita.
    if (inImpostazioni) return;
    const activeItem = voci.find((item) => isNavActive(pathname, item));
    const el = activeItem ? itemRefs.current.get(activeItem.href) : undefined;
    setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [pathname, inImpostazioni, voci]);

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
          <VenueSwitcher
            venues={venues}
            activeId={activeVenueId}
            titolo={titoloPagina(pathname)}
          />
        </div>

        {/* Su telefono la navigazione sta in basso: qui non si scorre più niente. */}
        {inImpostazioni ? (
          /*
            Il `key` è ciò che fa la transizione: cambiando, React monta un
            elemento nuovo e l'animazione d'ingresso riparte da capo. Vale nei
            due versi — entrando nelle Impostazioni e uscendone — quindi il
            passaggio si vede uguale all'andata e al ritorno senza tenere in
            piedi due barre insieme per incrociarle.
          */
          <div
            key="impostazioni"
            className="flex min-w-0 flex-1 animate-cambio-area justify-center"
          >
            <NavigazioneImpostazioni />
          </div>
        ) : (
          <nav
            key="gestionale"
            aria-label="Navigazione principale"
            className="hidden min-w-0 flex-1 animate-cambio-area justify-center md:flex"
          >
            <div className="relative flex items-center gap-1 rounded-full border border-border bg-muted/70 p-1">
              {indicator && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-1 z-0 rounded-full bg-nav-pill"
                  style={{
                    left: indicator.left,
                    width: indicator.width,
                    transition: reducedMotion
                      ? "none"
                      : "left 260ms ease-in-out, width 260ms ease-in-out",
                  }}
                />
              )}

              {voci.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item);
                const registra = (el: HTMLElement | null) => {
                  if (el) itemRefs.current.set(item.href, el);
                  else itemRefs.current.delete(item.href);
                };

                /*
                Marketing è l'unica voce che non porta da nessuna parte: apre
                il suo menu. Prende **le stesse classi** delle altre — stessa
                pillola, stessa altezza, stesso salto di misura fra tablet e
                scrivania — perché una voce che si comporta diversamente non
                deve anche sembrare diversa: l'unico segno in più è la freccia
                che si gira quando il pannello è aperto.
              */
                if (item.sottovoci) {
                  return (
                    <MarketingMenu
                      key={item.href}
                      item={item}
                      triggerRef={registra}
                      triggerClassName={classiVoce(active)}
                    />
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    ref={registra}
                    title={item.label}
                    className={classiVoce(active)}
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
                    <span className="hidden md:inline 2xl:hidden">
                      {item.shortLabel ?? item.label}
                    </span>
                    <span className="sr-only md:hidden">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

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
          {/* Il telefono **prima** delle notifiche: quando è acceso chiede
              qualcosa che si fa adesso — una persona in linea, una da
              richiamare — mentre una notifica si legge quando capita. E non
              compare affatto quando non c'è niente da fare, così le icone in
              testata restano tre. */}
          <IndicatoreTelefono />
          <NotificationBell />
          <ProfileMenu user={user} role={role} conStaffApp={conStaffApp} />
        </div>
      </div>
    </header>
  );
}
