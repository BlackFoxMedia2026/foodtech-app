"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector } from "@/components/insights/period-selector";
import { SchedeViste } from "@/components/insights/schede-viste";
import { VISTE, vistaDa } from "@/lib/viste-insights";

/**
 * L'attesa di Analytics, **con la pagina ancora intorno** (§69).
 *
 * Prima questa schermata era fatta di soli rettangoli grigi, titolo compreso:
 * cambiando vista o periodo sparivano il nome della pagina, il periodo scelto e
 * le quattro viste, e per un secondo non si sapeva più dove si era né su cosa
 * si aveva appena cliccato. Un aggiornamento **parziale** mostrava uno
 * scheletro **intero**.
 *
 * Adesso restano le cose che non dipendono dai dati — titolo, sottotitolo della
 * vista, selettore del periodo, pillole delle viste — perché sono le stesse,
 * gli stessi componenti, che si vedranno un istante dopo. I rettangoli grigi
 * stanno solo dove arriveranno i numeri, e hanno la forma dei riquadri che
 * arriveranno.
 */
export default function Loading() {
  const parametri = useSearchParams();
  const vista = vistaDa(parametri.get("vista"));
  const range = parametri.get("range") ?? "last7";
  const da = parametri.get("from") ?? "";
  const a = parametri.get("to") ?? "";

  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold leading-none">Analytics</h1>
          <p className="t-etichetta">
            {VISTE.find((v) => v.id === vista)!.sottotitolo}
          </p>
        </div>
        <PeriodSelector range={range} from={da} to={a} />
      </header>

      <SchedeViste />

      {/*
        La forma dei riquadri che arriveranno, non un rettangolo unico: la
        vista «Com'è andata» comincia con quattro numeri in fila, le altre con
        un quadro grande. Uno scheletro che non somiglia al contenuto fa
        saltare la pagina quando i dati arrivano.
      */}
      <div className="fill-scroll space-y-4 pr-0.5" aria-busy="true" aria-label="Carico i numeri">
        {vista === "andamento" && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-2 pt-5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-9/12" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
