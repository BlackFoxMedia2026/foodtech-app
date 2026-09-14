import { Skeleton } from "@/components/ui/skeleton";

/**
 * Il planning mentre carica.
 *
 * Ha la forma della pagina vera — barra stretta a sinistra, testata, griglia —
 * e non una fila di card generiche: uno scheletro che non somiglia a quello
 * che arriva fa saltare l'impaginazione sotto gli occhi al primo dato.
 */
export default function Loading() {
  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-7 w-40 rounded-full" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </header>

      <div className="fill flex min-h-0 gap-4">
        <div className="hidden w-[264px] shrink-0 flex-col gap-3 xl:flex">
          <Skeleton className="h-[13rem] w-full rounded-md" />
          <Skeleton className="h-[9.5rem] w-full rounded-md" />
          <Skeleton className="h-[9rem] w-full rounded-md" />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          <div className="fissa flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-8 w-44 rounded-full" />
          </div>
          <div className="riquadro fill overflow-hidden bg-[#0c1a14]">
            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[68px] border-b border-r border-border/40 p-2">
                  {i > 0 && <Skeleton className="h-3.5 w-16" />}
                </div>
              ))}
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-40 border-r border-border/25 p-1.5">
                  {i > 0 && i % 2 === 1 && <Skeleton className="mt-6 h-20 w-full rounded-lg" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
