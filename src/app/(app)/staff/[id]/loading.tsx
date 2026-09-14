import { Skeleton } from "@/components/ui/skeleton";

/** La scheda di una persona, mentre carica: la stessa sagoma della pagina. */
export default function Loading() {
  return (
    <div className="schermo animate-fade-in gap-4">
      <Skeleton className="fissa h-8 w-40" />
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div className="surface flex flex-col gap-6 p-6 lg:flex-row lg:justify-between">
          <div className="flex items-start gap-5">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-40" />
            ))}
          </div>
        </div>
        <div className="flex gap-4 border-b border-border pb-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
