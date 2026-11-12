"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENTI, applicaSegmento, segmentoAttivo, segmentoById } from "@/lib/campaign-segments";
import { useWizardDispatch, useWizardState } from "./wizard-context";
import { useSegmentPreview } from "./use-segment-preview";
import { ICONE_SEGMENTO, RiepilogoPubblico } from "./riepilogo-pubblico";
import { quotaDelPiano } from "./quota-piano";

/**
 * A chi arriva, detto accanto all'obiettivo appena scelto.
 *
 * Era un passo a sé («Segmento»): si sceglieva l'obiettivo, si premeva Avanti
 * e solo lì si scopriva a chi l'obiettivo aveva già deciso di scrivere. Ma
 * l'obiettivo **è** già una scelta di pubblico, e mostrarlo un passo dopo
 * nascondeva la conseguenza del clic. Qui la colonna entra da destra appena
 * si sceglie, col gruppo proposto e il numero dei destinatari.
 *
 * Gli otto gruppi non tornano come card: sarebbero state una seconda griglia
 * sotto la prima, simile e in concorrenza. Restano raggiungibili da un menu
 * nella colonna — alcuni («Compleanno questo mese», «Clienti a rischio») non
 * li propone nessun obiettivo, e senza menu sparirebbero dal percorso.
 */
export function PannelloPubblico() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const preview = useSegmentPreview();

  /* «Segmento personalizzato» non ha un valore proprio: è l'assenza di
     gruppo, e finché i filtri del passo dopo non ci sono si leggerebbe come
     «Tutti i clienti». Il flag tiene la scelta visibile; il genitore lo
     azzera cambiando obiettivo, via `key`. */
  const [personalizzatoScelto, setPersonalizzatoScelto] = useState(
    () => segmentoAttivo(state.segment) === "personalizzato",
  );
  const attivoDaiFiltri = segmentoAttivo(state.segment);
  const attivo = personalizzatoScelto && attivoDaiFiltri === "tutti" ? "personalizzato" : attivoDaiFiltri;

  function scegli(id: string) {
    const preset = segmentoById(id);
    if (!preset) return;
    setPersonalizzatoScelto(preset.id === "personalizzato");
    dispatch({ type: "SET_SEGMENT", segment: applicaSegmento(state.segment, preset) });
  }

  return (
    <RiepilogoPubblico
      preset={segmentoById(attivo)}
      preview={preview}
      quota={quotaDelPiano(state)}
      nota
      titoloSegmento="Chi la riceve"
      sceltaSegmento={
        /* Il menu prende il posto dell'etichetta, non le si aggiunge: due
           righe con lo stesso nome direbbero la stessa cosa due volte. */
        <Select value={attivo} onValueChange={scegli}>
          <SelectTrigger aria-label="Gruppo di clienti: cambialo da qui">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEGMENTI.map((preset) => {
              const Icon = ICONE_SEGMENTO[preset.icon];
              return (
                <SelectItem key={preset.id} value={preset.id}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {preset.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      }
    />
  );
}
