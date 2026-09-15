import { Skeleton } from "@/components/ui/skeleton";

/**
 * L'attesa delle pagine sotto `/marketing`.
 *
 * Questo file è il confine di sospensione dell'**intero segmento**: lo vedono
 * i coupon, le gift card, il Wi-Fi, i QR e le automazioni, non solo la pagina
 * `/marketing` — che oggi non disegna più niente e reindirizza. Prima qui
 * c'era lo scheletro delle sei card dell'indice: chi apriva i coupon vedeva
 * per un istante la forma di una pagina diversa da quella che stava
 * arrivando, e il passaggio sembrava un salto.
 *
 * Una forma neutra — una testata e un elenco — assomiglia abbastanza a tutte e
 * sei senza promettere nessuna in particolare.
 */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
