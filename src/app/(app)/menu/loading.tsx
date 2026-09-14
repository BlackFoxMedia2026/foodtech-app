import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Il menu mentre carica: le categorie come schede, ognuna con i suoi piatti. */
export default function Loading() {
  return (
    <div className="animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-44" />
      </header>

      <div className="mt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {/* La stessa forma della riga vera: foto a sinistra, testo
                  accanto, comandi a destra. Uno scheletro che non somiglia a
                  quello che arriva fa saltare la pagina quando arriva. */}
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-4 py-2">
                  <Skeleton className="aspect-[4/3] w-28 shrink-0 rounded-md md:w-36" />
                  <div className="w-full space-y-2">
                    <Skeleton className="h-5 w-56" />
                    <Skeleton className="h-3 w-72" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
