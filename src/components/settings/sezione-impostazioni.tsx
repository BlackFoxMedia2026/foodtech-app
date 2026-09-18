"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PARTI, parteDa, type ParteId } from "@/lib/parti-impostazioni";
import { useImpostazioni } from "./contesto-impostazioni";

/**
 * Una delle quattro sezioni della pagina, e **l'ancora** della voce in barra.
 *
 * Il titolo sta qui e non nella barra: scorrendo si deve poter capire dove si
 * è arrivati senza guardare in alto. È l'unico posto delle Impostazioni dove
 * il serif torna — sono quattro titoli in duemila pixel, non quaranta.
 */
export function SezioneImpostazioni({
  id,
  children,
}: {
  id: ParteId;
  children: ReactNode;
}) {
  const { registra } = useImpostazioni();
  const parte = PARTI.find((p) => p.id === id)!;

  // Stabile fra un render e l'altro: una `ref` scritta a mano qui verrebbe
  // richiamata con `null` a ogni render, e l'osservatore smonterebbe e
  // rimonterebbe la sezione a ogni battito.
  const ref = useCallback(
    (el: HTMLElement | null) => registra(id, el),
    [registra, id],
  );

  return (
    <section
      id={id}
      data-parte={id}
      ref={ref}
      aria-labelledby={`titolo-${id}`}
      /* Lo spazio sopra il titolo quando ci si arriva da un'ancora. Sul
         telefono è largo quanto la barra delle sezioni, che lì è appiccicata
         al bordo alto: senza, arrivare a «Ospiti» significherebbe trovare
         «Ospiti» sotto la barra che dice «Ospiti». */
      className="scroll-mt-16 md:scroll-mt-6"
    >
      <header className="border-b border-border pb-3 md:pb-4">
        <h2 id={`titolo-${id}`} className="t-titolo-pagina">
          {parte.titolo}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {parte.sottotitolo}
        </p>
      </header>

      {/* Le schede di un gruppo sono già oggetti con il loro bordo: fra loro
          basta l'aria, e fra le sezioni ce n'è il triplo (`space-y` della
          pagina). Prima erano dieci unità di spazio fra gruppi e quattordici
          fra sezioni: due distanze troppo simili per dire due cose diverse. */}
      <div className="mt-5 space-y-4 md:mt-6 md:space-y-5">{children}</div>
    </section>
  );
}

/**
 * Chi arriva con una sezione già chiesta — `/settings#ospiti`, o il vecchio
 * `/settings?parte=ospiti` che sta ancora nei link già mandati — ci scende da
 * solo.
 *
 * Va montata **dopo** le sezioni: gli effetti dei figli girano in ordine di
 * pagina, quindi a quel punto tutte e quattro si sono già registrate e c'è
 * qualcosa a cui scendere.
 */
export function ParteChiesta() {
  const { vaiA } = useImpostazioni();
  const parametri = useSearchParams();
  const chiesta = parametri.get("parte");

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const id = hash || chiesta;
    if (!id) return;
    // `parteDa` non va bene qui: torna la prima parte quando non riconosce il
    // valore, e scendere all'inizio è ciò che accade comunque senza fare
    // niente.
    if (!PARTI.some((p) => p.id === id)) return;
    // Un giro di rendering dopo il montaggio: il browser ripristina da sé la
    // posizione dell'ancora, e sovrapporsi produrrebbe due scorrimenti.
    const t = window.setTimeout(() => vaiA(parteDa(id)), 60);
    return () => window.clearTimeout(t);
  }, [chiesta, vaiA]);

  return null;
}
