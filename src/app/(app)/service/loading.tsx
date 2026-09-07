import { Skeleton } from "@/components/ui/skeleton";

/**
 * Il Servizio mentre carica.
 *
 * La forma è quella vera, non un rettangolo generico: intestazione, la riga
 * dei numeri, gli avvisi e le tre colonne. Uno scheletro che non somiglia
 * alla pagina fa saltare tutto quando i dati arrivano, ed è peggio di una
 * pagina bianca — l'occhio ha già cominciato a leggere nel posto sbagliato.
 *
 * L'ordine è quello del telefono, dove i numeri stanno **sotto** gli avvisi.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-11 w-11 rounded-full" />
      </header>

      <section className="order-2 grid grid-cols-3 gap-2 lg:order-1 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={`h-20 ${i === 0 || i === 1 || i === 5 ? "hidden lg:block" : ""}`} />
        ))}
      </section>

      <section className="order-1 space-y-2 lg:order-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="hidden h-16 w-full lg:block" />
      </section>

      <div className="order-3 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, colonna) => (
          <div key={colonna} className={`space-y-2 ${colonna > 0 ? "hidden lg:block" : ""}`}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
