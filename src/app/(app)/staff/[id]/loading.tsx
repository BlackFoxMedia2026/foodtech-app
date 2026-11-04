import { Skeleton } from "@/components/ui/skeleton";

/** La scheda di una persona, mentre carica: la stessa sagoma della pagina. */
export default function Loading() {
  return (
    <div className="schermo fondo-caldo animate-fade-in gap-4">
      <div className="fissa flex items-center gap-3 border-b border-border/70 pb-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-11 w-full max-w-2xl rounded-[14px]" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
