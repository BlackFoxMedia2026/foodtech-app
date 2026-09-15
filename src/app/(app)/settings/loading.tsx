import { Skeleton } from "@/components/ui/skeleton";

/**
 * L'attesa delle Impostazioni, **con la pagina ancora intorno** (§69).
 *
 * Quello che non dipende dai dati non diventa un rettangolo grigio: la barra
 * delle quattro sezioni sta nella testata, che qui non si smonta, e la riga
 * che dice di cosa si parla è scritta. Restano grigie le righe, che i dati ce
 * li hanno — e hanno **la forma delle righe**, non delle schede: uno scheletro
 * a schede alte farebbe saltare la pagina appena i dati arrivano.
 */
export default function Loading() {
  return (
    <div className="animate-cambio-area pb-[30vh]">
      <div className="mx-auto w-full max-w-[1500px]">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Come è configurato il locale e come si comporta il gestionale. Le modifiche valgono da subito.
        </p>

        <div className="mt-8 space-y-10 md:mt-10" aria-busy="true" aria-label="Carico le impostazioni">
          <div className="border-b border-border pb-3 md:pb-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-80" />
          </div>

          {Array.from({ length: 2 }).map((_, gruppo) => (
            <div key={gruppo} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="riquadro rounded-xl border-border/80 bg-white/[0.02] px-4 md:px-5">
                {Array.from({ length: 4 }).map((_, riga) => (
                  <div
                    key={riga}
                    className="flex items-center justify-between gap-4 border-b border-border/60 py-5 last:border-b-0"
                  >
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
