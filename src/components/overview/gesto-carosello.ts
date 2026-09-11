"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Quanto deve accumulare la ruota perché il gesto valga un passo. */
const SOGLIA_RUOTA = 40;
/** Il blocco dopo un passo: quanto dura la transizione delle righe. */
const BLOCCO_MS = 520;
/** Dopo questo silenzio della ruota, la spinta dopo è un gesto nuovo. */
const QUIETE_MS = 140;
/** Quanto deve correre il dito in orizzontale perché lo swipe conti. */
const SOGLIA_TOCCO = 44;
/** Sotto questa distanza il dito non ha ancora scelto un asse. */
const ASSE_MIN = 8;

/** Avanti (giù/destra) o indietro (su/sinistra). */
export type Verso = 1 | -1;

/**
 * I gesti che muovono un carosello: rotella, trackpad, swipe.
 *
 * Sta in un modulo suo perché è tutta meccanica del gesto — niente di quello
 * che c'è dentro sa cosa siano una prenotazione o una riga — e perché questa
 * meccanica ha due difetti classici che vanno scritti una volta sola:
 *
 * **Un gesto, un passo.** Una spinta di trackpad non è un evento: sono venti,
 * con la coda d'inerzia che continua ad arrivare per mezzo secondo dopo che le
 * dita si sono alzate. Presi uno per uno farebbero scorrere quattro
 * prenotazioni per una spinta sola. Quindi un gesto conta finché la ruota non
 * tace per `QUIETE_MS`, deve accumulare `SOGLIA_RUOTA` per valere, e vale
 * **una volta**: quel che arriva dopo è inerzia, non una seconda intenzione.
 *
 * **Ma non è una trappola per lo scroll.** `preventDefault()` solo quando il
 * carosello quel gesto se lo può davvero mangiare, cioè quando in quel verso
 * ha ancora dove andare: all'ultima riga chi continua a scorrere in giù scorre
 * la pagina, come si aspetta. E anche nel mezzo il blocco dura quanto
 * l'animazione e non un millisecondo di più — passato quello, la coda della
 * spinta torna alla pagina invece di restare appesa qui. Il caso peggiore è
 * quindi mezzo secondo di pagina ferma, una volta sola, non una card che si
 * tiene la rotella finché non l'ha attraversata tutta.
 *
 * Sul tocco l'asse lo decide il dito nei primi `ASSE_MIN` pixel e poi non
 * cambia più: orizzontale è nostro, verticale è della pagina. Senza questo, lo
 * scroll verticale con il pollice sopra la card si impuntava.
 */
export function useGestoCarosello({
  riferimento,
  puoAndare,
  vai,
}: {
  /** L'elemento su cui si sta con il puntatore o il dito. */
  riferimento: RefObject<HTMLElement>;
  /** Se in quel verso c'è ancora dove andare. Se no, il gesto passa alla pagina. */
  puoAndare: (verso: Verso) => boolean;
  vai: (verso: Verso) => void;
}) {
  // Le due funzioni cambiano a ogni render — dipendono dall'indice corrente —
  // mentre i listener vanno attaccati una volta sola: `wheel` e `touchmove`
  // qui sono non passivi (è l'unico modo per poter chiamare
  // `preventDefault()`: React li registra passivi sulla radice), e
  // staccarli/riattaccarli a metà gesto perderebbe il gesto. Uno specchio in
  // ref tiene insieme le due cose.
  const azioni = useRef({ puoAndare, vai });
  azioni.current = { puoAndare, vai };

  useEffect(() => {
    const el = riferimento.current;
    if (!el) return;

    /** Quanto ha spinto il gesto in corso. */
    let accumulo = 0;
    /** Quando è arrivato l'ultimo evento di ruota: sotto `QUIETE_MS` è lo stesso gesto. */
    let ultimoEvento = 0;
    /** Fino a quando l'animazione è in corso. */
    let bloccatoFino = 0;
    /** Se il gesto in corso ha già fatto il suo passo. */
    let gestoSpeso = false;

    function passo(verso: Verso, ora: number) {
      accumulo = 0;
      gestoSpeso = true;
      bloccatoFino = ora + BLOCCO_MS;
      azioni.current.vai(verso);
    }

    function onWheel(e: WheelEvent) {
      const ora = e.timeStamp;
      if (ora - ultimoEvento > QUIETE_MS) {
        accumulo = 0;
        gestoSpeso = false;
      }
      ultimoEvento = ora;

      // L'asse che comanda è quello in cui il gesto è più deciso: sul trackpad
      // lo swipe laterale dà `deltaX` e ha la precedenza, la rotella del mouse
      // dà solo `deltaY` e vale lo stesso.
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const verso: Verso = delta > 0 ? 1 : -1;

      // Al capo il gesto non è nostro: niente `preventDefault()`, la pagina
      // scorre come farebbe ovunque altro.
      if (!azioni.current.puoAndare(verso)) {
        accumulo = 0;
        return;
      }

      if (gestoSpeso) {
        // Resta solo l'inerzia della spinta già contata: la si tiene ferma
        // finché l'animazione è in corso, poi la si lascia andare alla pagina.
        if (ora < bloccatoFino) e.preventDefault();
        return;
      }

      e.preventDefault();
      accumulo += delta;
      if (Math.abs(accumulo) < SOGLIA_RUOTA) return;
      passo(accumulo > 0 ? 1 : -1, ora);
    }

    /** Da dove è partito il dito, e su quale asse si è deciso. */
    let tocco: { x: number; y: number; asse: "x" | "y" | null; speso: boolean } | null = null;

    function onTouchStart(e: TouchEvent) {
      // Due dita sono un pinch, non uno swipe: fuori dai piedi.
      if (e.touches.length !== 1) {
        tocco = null;
        return;
      }
      tocco = { x: e.touches[0].clientX, y: e.touches[0].clientY, asse: null, speso: false };
    }

    function onTouchMove(e: TouchEvent) {
      if (!tocco || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - tocco.x;
      const dy = e.touches[0].clientY - tocco.y;

      if (tocco.asse === null) {
        if (Math.abs(dx) < ASSE_MIN && Math.abs(dy) < ASSE_MIN) return;
        tocco.asse = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      // Verticale: è la pagina che scorre, e per tutto il resto del gesto
      // restiamo fuori — anche se il dito poi curva.
      if (tocco.asse === "y" || tocco.speso) return;

      // Swipe a sinistra = avanti, come su qualunque carosello.
      const verso: Verso = dx < 0 ? 1 : -1;
      if (!azioni.current.puoAndare(verso)) return;

      e.preventDefault();
      if (Math.abs(dx) < SOGLIA_TOCCO) return;
      tocco.speso = true;
      passo(verso, e.timeStamp);
    }

    function onTouchEnd() {
      tocco = null;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [riferimento]);
}
