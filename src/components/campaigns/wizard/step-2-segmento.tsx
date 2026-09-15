"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEGMENTI,
  applicaSegmento,
  segmentoAttivo,
  segmentoById,
  type SegmentoPreset,
} from "@/lib/campaign-segments";
import { useWizardDispatch, useWizardState } from "./wizard-context";
import { useSegmentPreview } from "./use-segment-preview";
import { ICONE_SEGMENTO, RiepilogoPubblico } from "./riepilogo-pubblico";
import { quotaDelPiano } from "./quota-piano";

/**
 * Da chi si parte, e basta.
 *
 * Questa schermata prima conteneva anche gli otto filtri dettagliati: due
 * attività diverse — scegliere un pubblico e restringerlo — stipate nello
 * stesso spazio, con i gruppi ridotti a sei pillole grigie in cima e il vero
 * peso visivo tutto sulle caselle sotto. Chi arrivava qui leggeva un modulo,
 * non una scelta. I filtri stanno ora nel passo successivo; qui resta una
 * decisione sola, scritta abbastanza grande da prendersi la pagina.
 */
export function Step2Segmento() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const preview = useSegmentPreview();

  /**
   * «Segmento personalizzato» non ha un valore proprio da salvare: è
   * l'assenza di gruppo, e si riconosce dai filtri impostati sotto. Finché
   * quei filtri non ci sono, però, nessuna card risulterebbe scelta — e un
   * clic senza risposta visiva sembra un clic non registrato. Questo flag
   * vive solo nella schermata, non nel segmento: serve a tenere accesa la
   * card fino a quando non se ne sceglie un'altra.
   */
  const [personalizzatoScelto, setPersonalizzatoScelto] = useState(
    () => segmentoAttivo(state.segment) === "personalizzato",
  );

  const attivoDaiFiltri = segmentoAttivo(state.segment);
  const attivo = personalizzatoScelto && attivoDaiFiltri === "tutti" ? "personalizzato" : attivoDaiFiltri;

  function scegli(preset: SegmentoPreset) {
    setPersonalizzatoScelto(preset.id === "personalizzato");
    dispatch({ type: "SET_SEGMENT", segment: applicaSegmento(state.segment, preset) });
  }

  return (
    <div className="space-y-7">
      <div className="max-w-2xl">
        <h2 className="text-display text-2xl md:text-3xl">Chi vuoi raggiungere?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Scegli il gruppo di clienti da cui partire. Potrai affinare il pubblico nel passaggio successivo.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
        {/* Tre o quattro per riga: le card sono il contenuto della pagina, non
            una barra di scelta rapida sopra al contenuto vero. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {SEGMENTI.map((preset) => {
            const Icon = ICONE_SEGMENTO[preset.icon];
            const selected = attivo === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => scegli(preset)}
                className={cn(
                  // Sul telefono la card si sdraia — icona a sinistra, testo
                  // accanto: otto card alte una sotto l'altra sarebbero tre
                  // schermate di scorrimento per una scelta sola.
                  "group relative flex h-full flex-row items-center gap-4 rounded-xl border p-4 text-left transition-colors sm:flex-col sm:items-start sm:gap-3 sm:p-5",
                  selected
                    ? "border-accent-strong bg-accent-strong/10"
                    : "border-border bg-card/40 hover:border-border-strong hover:bg-secondary/60",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected
                      ? "border-accent-strong/50 bg-accent-strong/15 text-accent-strong"
                      : "border-border bg-secondary/50 text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="space-y-1.5">
                  <span className="block t-titolo-scheda">{preset.label}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{preset.descrizione}</span>
                </span>
                {/* La spunta conferma; il bordo e il fondo lo dicevano già, ma
                    solo col colore — e il colore da solo non è un'informazione. */}
                {selected && (
                  <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-accent-strong text-accent-strong-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <RiepilogoPubblico
          preset={segmentoById(attivo)}
          preview={preview}
          quota={quotaDelPiano(state)}
          nota
        />
      </div>
    </div>
  );
}
