/**
 * Il volo delle schede del Servizio (3 novembre 2026).
 *
 * Quando una prenotazione passa al passo dopo — «Arrivato», «Accomoda» — la
 * scheda non sparisce da una colonna per ricomparire in un'altra: **vola**
 * dal punto in cui era fino allo spazio che le si apre nella colonna nuova, e
 * ci si incastra. È la tecnica FLIP: si misura dove stava (prima che la
 * fotografia nuova cambi il DOM), si misura dove sta adesso, e si anima la
 * differenza.
 *
 * Due dettagli che non sono estetica:
 *
 * - **Vola una copia, non la scheda.** Le corsie scorrono (`overflow-y`), e un
 *   elemento trasformato dentro una corsia viene tagliato al bordo della sua
 *   colonna: la scheda sparirebbe a metà strada. La copia sta in `position:
 *   fixed` sopra tutto, nel guscio dell'app (dove valgono i colori del
 *   vetro), con l'attributo `data-passo` della colonna d'arrivo per la tinta.
 * - **Lo spazio si apre mentre arriva.** La scheda vera è già al suo posto ma
 *   invisibile, e la sua altezza cresce da zero: le schede sotto scivolano giù
 *   e la copia atterra esattamente nel buco.
 *
 * Chi ha chiesto meno movimento nelle impostazioni del sistema non vede
 * niente di tutto questo: la scheda è semplicemente al suo posto.
 */

/** L'attributo con cui ogni scheda si fa ritrovare: il suo identificativo. */
export const ATTRIBUTO_SCHEDA = "data-scheda";

/** Dove sta ogni scheda adesso, in coordinate dello schermo. */
export function misuraSchede(radice: HTMLElement | null): Map<string, DOMRect> {
  const m = new Map<string, DOMRect>();
  radice?.querySelectorAll<HTMLElement>(`[${ATTRIBUTO_SCHEDA}]`).forEach((el) => {
    const r = el.getBoundingClientRect();
    // Una colonna nascosta (sul telefono si vede un passo per volta) misura
    // zero: da lì non si parte.
    if (r.width > 0 && r.height > 0) m.set(el.getAttribute(ATTRIBUTO_SCHEDA)!, r);
  });
  return m;
}

function senzaMovimento() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DURATA_MS = 620;
const CURVA = "cubic-bezier(0.22, 0.9, 0.3, 1)";

/**
 * Fa volare la scheda `el` dalla posizione `da` a quella che ha adesso.
 * Restituisce la funzione che interrompe il volo e rimette tutto a posto.
 */
export function volaScheda(el: HTMLElement, da: DOMRect): () => void {
  if (senzaMovimento()) return () => {};
  const a = el.getBoundingClientRect();
  if (a.width === 0 || a.height === 0) return () => {};

  const dx = da.left - a.left;
  const dy = da.top - a.top;
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return () => {};

  // La copia, nel guscio dell'app e con la tinta della colonna d'arrivo.
  const ospite = el.closest<HTMLElement>(".guscio-app") ?? document.body;
  const passo = el.closest("[data-passo]")?.getAttribute("data-passo");
  const involucro = document.createElement("div");
  if (passo) involucro.setAttribute("data-passo", passo);
  involucro.setAttribute("aria-hidden", "true");
  Object.assign(involucro.style, {
    position: "fixed",
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    zIndex: "60",
    pointerEvents: "none",
    transformOrigin: "top left",
  });
  const copia = el.cloneNode(true) as HTMLElement;
  copia.removeAttribute(ATTRIBUTO_SCHEDA);
  copia.classList.remove("scheda-entra");
  copia.classList.add("scheda-in-volo");
  Object.assign(copia.style, { width: "100%", height: "100%", margin: "0", animation: "none" });
  involucro.append(copia);
  ospite.append(involucro);

  // La scheda vera: al suo posto, invisibile, e il posto si apre.
  // Con l'opacità e non con `visibility`: i pulsanti hanno `transition-all`,
  // e una `visibility` ereditata si anima — il pulsante restava visibile per
  // un istante dentro il buco che si apriva.
  // Senza transizione: `.scheda-passo` anima l'opacità, e la scheda svaniva
  // piano lasciando la sua ombra nel buco.
  el.style.transition = "none";
  el.style.opacity = "0";
  el.style.animation = "none";
  const apertura = el.animate([{ height: "0px" }, { height: `${a.height}px` }], {
    duration: DURATA_MS * 0.55,
    easing: "ease-out",
  });

  const sx = da.width / a.width;
  const volo = involucro.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, 1)` },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 14}px) scale(1.03)`, offset: 0.5 },
      { transform: "translate(0, 0) scale(1)" },
    ],
    { duration: DURATA_MS, easing: CURVA },
  );

  let finito = false;
  const chiudi = () => {
    if (finito) return;
    finito = true;
    volo.cancel();
    apertura.cancel();
    involucro.remove();
    // Prima l'opacità, poi la transizione: insieme, la scheda riapparirebbe
    // in dissolvenza proprio quando la copia atterra.
    el.style.opacity = "";
    void el.offsetWidth;
    el.style.transition = "";
  };
  volo.onfinish = chiudi;
  return chiudi;
}
