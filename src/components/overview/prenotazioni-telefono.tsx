"use client";

import { useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { WidgetPrenotazioni } from "@/components/overview/widget-prenotazioni";
import type { PrenotazioneRiquadro } from "@/lib/prenotazioni-nuove";
import { cn } from "@/lib/utils";

/**
 * Le prenotazioni della Panoramica, con un banner davanti sul telefono
 * (16 novembre 2026).
 *
 * Sul telefono il riquadro intero, con le sue schede e le card, occupava la
 * schermata sotto i numeri: la dashboard diventava una lista. Adesso al suo
 * posto c'è un banner di una riga, col numero da gestire cerchiato in verde;
 * toccarlo apre il riquadro **sotto** il banner e ci porta lo schermo.
 *
 * Da tablet in su il banner non c'è e il contenitore è `contents`: il
 * riquadro torna a essere direttamente la cella della griglia, alto quanto
 * l'andamento accanto, come prima.
 */
export function PrenotazioniTelefono({
  nuove,
  oggi,
  puoGestire,
}: {
  nuove: PrenotazioneRiquadro[];
  oggi: PrenotazioneRiquadro[];
  puoGestire: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const riquadro = useRef<HTMLDivElement>(null);

  const daGestire = nuove.length;
  /* Il numero cerchiato è quello su cui si agisce: le nuove. Quando non ce ne
     sono, il tondo mostra quelle di oggi, ma senza il verde pieno — non c'è
     niente che chieda attenzione. */
  const numero = daGestire > 0 ? daGestire : oggi.length;

  const tocca = () => {
    const apri = !aperto;
    setAperto(apri);
    if (apri) {
      // Dopo il disegno: prima il riquadro è `hidden` e non ha dove scorrere.
      requestAnimationFrame(() => riquadro.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div className="flex flex-col gap-3 md:contents">
      <button
        type="button"
        onClick={tocca}
        aria-expanded={aperto}
        aria-controls="riquadro-prenotazioni-telefono"
        className="vetro card-notch flex w-full items-center gap-3 p-4 text-left active:scale-[0.99] md:hidden"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--vi-verde)]">
          <CalendarDays className="h-6 w-6 text-white" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold leading-tight text-foreground">Prenotazioni</span>
          <span className="block text-sm text-muted-foreground">
            {daGestire > 0
              ? `${daGestire === 1 ? "1 nuova" : `${daGestire} nuove`} da gestire · oggi ${oggi.length}`
              : `Tutto gestito · oggi ${oggi.length}`}
          </span>
        </span>

        <span
          className={cn(
            "grid h-12 min-w-12 shrink-0 place-items-center rounded-full px-2 font-mono text-xl font-semibold tabular-nums",
            daGestire > 0
              ? "bg-[var(--vi-verde)] text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--vi-verde)_18%,transparent)]"
              : "border-2 border-[var(--vi-verde)] text-[var(--vi-verde)]",
          )}
          aria-label={daGestire > 0 ? `${daGestire} da gestire` : `${oggi.length} oggi`}
        >
          {numero}
        </span>

        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", aperto && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <div
        ref={riquadro}
        id="riquadro-prenotazioni-telefono"
        className={cn("scroll-mt-4 md:contents", !aperto && "max-md:hidden")}
      >
        <WidgetPrenotazioni nuove={nuove} oggi={oggi} puoGestire={puoGestire} />
      </div>
    </div>
  );
}
