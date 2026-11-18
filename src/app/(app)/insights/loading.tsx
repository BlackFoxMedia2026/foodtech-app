import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SchedeViste } from "@/components/insights/schede-viste";

/**
 * L'attesa di Analytics, **con la pagina ancora intorno** (§69).
 *
 * Stessa forma della pagina vera: le quattro tessere del periodo, la barra
 * delle viste e del periodo (lo stesso componente, quindi non salta), poi
 * il contenuto. I rettangoli grigi stanno solo dove arriveranno i numeri.
 */
export default function Loading() {
  return (
    <div className="schermo animate-fade-in gap-3">
      <div className="fill-scroll -mx-2 -mt-2 space-y-4 px-2 pb-4 pt-2" aria-busy="true" aria-label="Carico i numeri">
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="vetro card-notch space-y-2 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-24" />
            </li>
          ))}
        </ul>

        <SchedeViste />

        <section className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-4 w-9/12" />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
