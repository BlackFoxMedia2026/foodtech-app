"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { IndiceParti } from "@/components/settings/indice-parti";

/**
 * L'attesa delle Impostazioni, **con la pagina ancora intorno** (§69).
 *
 * Prima erano quattro rettangoli grigi: sparivano il titolo, l'indice delle
 * quattro parti e la riga che dice cosa c'è dentro quella scelta. Niente di
 * tutto questo dipende dai dati, quindi niente di tutto questo ha motivo di
 * diventare un rettangolo — e sono gli stessi componenti che si vedranno un
 * istante dopo.
 *
 * I rettangoli restano dove arriveranno i blocchi, e hanno **la forma dei
 * blocchi chiusi**: righe, non schede. Da quando un blocco dichiara il suo
 * valore nell'intestazione, uno scheletro a schede alte farebbe saltare la
 * pagina appena i dati arrivano.
 */
export default function Loading() {
  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex items-baseline gap-2">
        <h1 className="text-lg font-semibold leading-none">Impostazioni</h1>
        <p className="t-etichetta">Configurazione</p>
      </header>

      <IndiceParti />

      <div className="fill-scroll space-y-3 pr-0.5" aria-busy="true" aria-label="Carico le impostazioni">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="surface flex items-center justify-between gap-3 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
