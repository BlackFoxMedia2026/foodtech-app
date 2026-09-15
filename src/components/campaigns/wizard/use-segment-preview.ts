"use client";

import { useEffect, useRef } from "react";
import { fetchSegmentPreview } from "@/lib/campaign-wizard-api";
import { useWizardDispatch, useWizardState } from "./wizard-context";

/**
 * Il conteggio dei destinatari, ricalcolato mentre si sceglie.
 *
 * Sta qui e non dentro un passo perché ora i passi che toccano il pubblico
 * sono due — «Segmento» e «Filtri» — e il numero deve essere lo stesso in
 * entrambi, aggiornato con la stessa attesa.
 */
export function useSegmentPreview() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const preview = await fetchSegmentPreview(state.segment);
        // Scarta la risposta se nel frattempo è partita una richiesta più recente
        // (es. rete lenta/instabile): l'ultima innescata deve vincere, non l'ultima arrivata.
        if (requestId === requestIdRef.current) {
          dispatch({ type: "SET_SEGMENT_PREVIEW", preview });
        }
      } catch {
        // il breakdown è un ausilio, non blocca il wizard se la preview fallisce
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state.segment)]);

  return state.segmentPreview;
}
