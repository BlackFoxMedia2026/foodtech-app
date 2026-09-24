"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FORME, disponiFila, type Disposizione, type Forma } from "./disponi-fila";

/**
 * La misura di una fila di voci in barra, **una per le due barre**.
 *
 * La usano la fila del gestionale e quella delle Impostazioni: stesse forme,
 * stesso «Altro», stessa pillola che scorre. Due copie di questo conto
 * smetterebbero di dare lo stesso risultato alla prima modifica fatta su una.
 *
 * Chi la usa mette tre riferimenti nel suo disegno:
 * - `navRef` sul contenitore che prende lo spazio (`flex-1 min-w-0`);
 * - `pillolaRef` sulla pillola che contiene le voci (da lei si leggono gap,
 *   bordo e imbottitura, così il conto non ha numeri scritti a mano);
 * - `misuraRef` sulla copia invisibile, con un gruppo `[data-forma]` per
 *   forma, dentro una voce `[data-voce]` per chiave e un `[data-altro]`.
 *
 * `riservaRef` è ciò che sta **dentro** il contenitore ma fuori dalla pillola
 * — il «Gestionale» delle Impostazioni — e si toglie dallo spazio.
 */
export function useFilaAdattiva({
  chiavi,
  attiva,
  riservaRef,
}: {
  chiavi: string[];
  /** La chiave della voce accesa, o `null`. */
  attiva: string | null;
  riservaRef?: RefObject<HTMLElement>;
}) {
  const navRef = useRef<HTMLElement>(null);
  const pillolaRef = useRef<HTMLDivElement>(null);
  const misuraRef = useRef<HTMLDivElement>(null);
  // `HTMLElement` e non `HTMLAnchorElement`: una voce può essere il bottone
  // che apre un menu, e occupa lo stesso posto in fila.
  const voci = useRef(new Map<string, HTMLElement>());
  const [disposizione, setDisposizione] = useState<Disposizione | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const indiceAttiva = attiva ? chiavi.indexOf(attiva) : -1;
  const firma = chiavi.join("|");

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const misuraPillola = useCallback(() => {
    const el = attiva ? voci.current.get(attiva) : undefined;
    setIndicator((prima) => {
      const dopo = el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      return prima?.left === dopo?.left && prima?.width === dopo?.width ? prima : dopo;
    });
  }, [attiva]);

  const ricalcola = useCallback(() => {
    const nav = navRef.current;
    const misura = misuraRef.current;
    const pillola = pillolaRef.current;
    if (!nav || !misura || !pillola) return;
    // Su telefono la fila non è a schermo (`hidden`): niente da misurare.
    if (nav.clientWidth === 0) return;

    const px = (v: string) => parseFloat(v) || 0;
    const riserva = riservaRef?.current;
    const spazio =
      nav.clientWidth - (riserva ? riserva.offsetWidth + px(getComputedStyle(nav).columnGap) : 0);

    const larghezza = (el: Element) => Math.ceil(el.getBoundingClientRect().width);
    const larghezze = {} as Record<Forma, number[]>;
    const altro = {} as Record<Forma, number>;
    for (const forma of FORME) {
      const gruppo = misura.querySelector(`[data-forma="${forma}"]`);
      if (!gruppo) return;
      larghezze[forma] = Array.from(gruppo.querySelectorAll("[data-voce]")).map(larghezza);
      const bottone = gruppo.querySelector("[data-altro]");
      altro[forma] = bottone ? larghezza(bottone) : 0;
    }

    const stile = getComputedStyle(pillola);
    const dopo = disponiFila({
      spazio,
      larghezze,
      altro,
      attiva: indiceAttiva,
      gap: px(stile.columnGap),
      cornice:
        px(stile.paddingLeft) + px(stile.paddingRight) + px(stile.borderLeftWidth) + px(stile.borderRightWidth),
    });
    setDisposizione((prima) =>
      prima && prima.forma === dopo.forma && prima.visibili.join() === dopo.visibili.join() ? prima : dopo,
    );
    // `firma` rifà il conto quando cambiano le voci (il telefono acceso, un
    // ruolo diverso): le misure vecchie sarebbero di un'altra fila.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceAttiva, firma, riservaRef]);

  /*
    Tre cose cambiano lo spazio o le misure, e l'osservatore le guarda tutte:
    la finestra (la fila si allarga con lei), la copia invisibile (i caratteri
    che arrivano dopo il primo disegno allargano le voci) e la pillola (che
    cambia larghezza quando la forma cambia, e con lei la voce accesa). Più
    la riserva, che cambia misura a una soglia sua.
  */
  useLayoutEffect(() => {
    ricalcola();
    const osservatore = new ResizeObserver(() => {
      ricalcola();
      misuraPillola();
    });
    for (const el of [navRef.current, misuraRef.current, pillolaRef.current, riservaRef?.current]) {
      if (el) osservatore.observe(el);
    }
    return () => osservatore.disconnect();
  }, [ricalcola, misuraPillola, riservaRef]);

  useLayoutEffect(() => {
    misuraPillola();
  }, [misuraPillola, disposizione]);

  const registra = useCallback(
    (chiave: string) => (el: HTMLElement | null) => {
      if (el) voci.current.set(chiave, el);
      else voci.current.delete(chiave);
    },
    [],
  );

  /*
    Prima della misura — cioè nell'HTML che arriva dal server — la fila non sa
    quanto spazio ha: tutto nella forma più compatta, e chi la disegna taglia
    quello che sborda (`misurata` falso) invece di lasciarlo scivolare sotto
    l'agente. Per un istante si può perdere l'ultima voce, non si può coprire
    un pulsante.
  */
  const forma: Forma = disposizione?.forma ?? "pila";
  const visibili = disposizione ? disposizione.visibili : chiavi.map((_, i) => i);

  return {
    navRef,
    pillolaRef,
    misuraRef,
    registra,
    misurata: disposizione !== null,
    forma,
    /** Gli indici delle voci in barra, nell'ordine della barra. */
    visibili,
    /** Gli indici delle voci che vanno in «Altro». */
    nascoste: disposizione ? chiavi.map((_, i) => i).filter((i) => !visibili.includes(i)) : [],
    indicator,
    reducedMotion,
  };
}
