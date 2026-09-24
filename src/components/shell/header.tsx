"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Agent } from "@/components/agent/agent";
import { vociPrincipali, titoloPagina } from "@/components/shell/nav-items";
import type { StaffRole } from "@prisma/client";
import { FilaPrincipale } from "./fila-principale";
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
 * Porta le voci di `PRIMARY_NAV` e **nient'altro**. Il vecchio dropdown
 * «Altro» teneva insieme cose che si aprono durante il servizio (Staff, Menu)
 * e cose che si aprono a locale chiuso (campagne, incassi, impostazioni): le
 * voci amministrative stanno sotto l'avatar (`ProfileMenu`), che è già il
 * posto dove si cercano le impostazioni.
 *
 * **Tre gruppi che non si toccano.** Il marchio a sinistra e gli strumenti a
 * destra non si comprimono (`shrink-0`); la fila in mezzo prende quello che
 * resta (`flex-1 min-w-0`), lo misura e ci si adatta da sola — riga, riga più
 * stretta, poi le ultime voci in un «Altro» che porta solo loro, poi il nome
 * sotto l'icona (`FilaPrincipale`). Niente scorre di lato e niente passa
 * sotto la sfera dell'agente. L'altezza resta 64 px in ogni forma.
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

  return (
    <header className="relative z-10 bg-background">
      <div className="flex h-16 items-center gap-2 px-3 pt-3 md:gap-3 md:px-4 lg:px-6">
        {/*
          A sinistra c'è il marchio del locale e, accanto, il titolo della
          pagina: non è più il contenuto a dire dove ci si trova, lo dice la
          testata — una riga in meno su ogni schermata. Il gruppo si può
          comprimere (`min-w-0`) solo sul telefono, dove la fila non c'è; da
          tablet in su tiene la sua misura — il titolo ha già un tetto — e
          chi si adatta è la fila, che sa spostare una voce in «Altro»
          invece di troncare una parola.
        */}
        <div className="flex min-w-0 items-center gap-3 md:shrink-0">
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
          <FilaPrincipale key="gestionale" voci={voci} />
        )}

        {/* Su telefono il gruppo di destra si allarga per riempire lo spazio
            lasciato libero dalla navigazione. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
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
