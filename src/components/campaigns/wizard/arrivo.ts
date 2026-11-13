"use client";

import { useEffect } from "react";
import { useWizardDispatch, useWizardState } from "./wizard-context";

/**
 * Portare chi clicca esattamente lì.
 *
 * I controlli di «Pronta per partire?» aprono un altro passo del wizard: non
 * basta cambiare passo, bisogna arrivare sul punto da sistemare. Chi apre il
 * passo mette una `destinazione` (`SET_STEP`); qui, quando il passo è
 * disegnato, si cerca l'elemento con `data-destinazione` uguale (o con quell'id),
 * lo si porta al centro, lo si fa lampeggiare e, se è un campo, ci si mette
 * il cursore. Il passo può comparire con un attimo di ritardo (l'editor carica
 * i blocchi), quindi si riprova per un secondo e mezzo.
 */
export function useArrivo() {
  const { step, destinazione } = useWizardState();
  const dispatch = useWizardDispatch();

  useEffect(() => {
    if (!destinazione) return;
    let tentativi = 0;
    let timer: ReturnType<typeof setTimeout>;
    const cerca = () => {
      const el =
        document.querySelector<HTMLElement>(`[data-destinazione="${destinazione}"]`) ??
        document.getElementById(destinazione);
      if (!el) {
        if (++tentativi < 30) timer = setTimeout(cerca, 50);
        else dispatch({ type: "SET_DESTINAZIONE", destinazione: null });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const campo = el.matches("input, textarea, select") ? el : null;
      campo?.focus({ preventScroll: true });
      el.classList.remove("arrivo-qui");
      void el.offsetWidth; // riparte l'animazione anche se c'era già
      el.classList.add("arrivo-qui");
      setTimeout(() => el.classList.remove("arrivo-qui"), 2200);
      dispatch({ type: "SET_DESTINAZIONE", destinazione: null });
    };
    timer = setTimeout(cerca, 80);
    return () => clearTimeout(timer);
  }, [step, destinazione, dispatch]);
}
