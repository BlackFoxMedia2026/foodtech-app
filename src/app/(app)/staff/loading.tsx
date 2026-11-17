import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lo Staff mentre carica, **solo all'ingresso**.
 *
 * Compare quando si arriva allo Staff da un'altra sezione. Fra Persone, Turni
 * e Richieste invece non compare più: le tre viste stanno dentro questo stesso
 * confine, già rivelato, e Next tiene a schermo la vista di prima finché la
 * nuova è pronta — l'interruttore si accende subito sulla voce scelta (vedi
 * `StaffSwitch`). Prima ogni vista aveva il suo scheletro e un fade da zero, e
 * cambiare linguetta sembrava ricaricare il sito.
 *
 * Per questo `turni/` e `richieste/` non hanno un `loading.tsx` loro: uno
 * scheletro lì aprirebbe un confine nuovo a ogni cambio di vista.
 *
 * Ha la forma comune alle tre viste: la colonna a sinistra, un riquadro a
 * destra.
 */
export default function Loading() {
  return (
    <div className="schermo animate-fade-in gap-3">
      <div className="fill flex min-h-0 gap-4">
        <div className="hidden w-[252px] shrink-0 flex-col gap-4 xl:flex">
          <Skeleton className="h-9 w-full rounded-full" />
          <Skeleton className="h-[17rem] w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-[9.5rem] w-full rounded-md" />
          <Skeleton className="h-[11rem] w-full rounded-md" />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          <div className="fissa flex items-center gap-2.5 xl:hidden">
            <Skeleton className="h-10 w-64 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <div className="riquadro fill overflow-hidden bg-card-sunken">
            <div className="border-b border-border/60 px-3 py-2.5">
              <Skeleton className="h-3.5 w-24" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border/40 px-3 py-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
