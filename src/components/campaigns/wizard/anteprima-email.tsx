"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * La miniatura di un'email, ridotta in scala.
 *
 * Una libreria di modelli si guarda, non si legge: la cosa che fa scegliere è
 * la **forma** — dov'è la foto, quante colonne, quanto testo — e quella si
 * riconosce anche a un quinto della grandezza.
 *
 * L'HTML compilato è largo 600 px per costruzione (è un'email), quindi non si
 * adatta al contenitore: si disegna a grandezza vera e si riduce con una
 * `transform`, che è l'unico modo di rimpicciolire una tabella con misure in
 * pixel senza riscriverla. Il fattore si ricalcola con un `ResizeObserver`
 * perché la griglia è fluida e la colonna cambia larghezza con la finestra.
 *
 * Il contenuto è inerte: `pointer-events: none` e `aria-hidden`, così i link
 * dentro l'email non rubano il clic alla card né compaiono nella tabulazione.
 */
export function AnteprimaEmail({
  html,
  larghezzaSorgente = 600,
  className,
  sfumaInFondo = true,
}: {
  html: string;
  larghezzaSorgente?: number;
  className?: string;
  /** La sfumatura che dice «continua»: va tolta dove la miniatura non taglia niente. */
  sfumaInFondo?: boolean;
}) {
  const contenitore = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(0);

  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const misura = () => setScala(el.clientWidth / larghezzaSorgente);
    misura();
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [larghezzaSorgente]);

  return (
    <div ref={contenitore} className={cn("relative overflow-hidden bg-white", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
        style={{ width: larghezzaSorgente, transform: `scale(${scala})`, visibility: scala ? "visible" : "hidden" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {sfumaInFondo && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/15 to-transparent" />
      )}
    </div>
  );
}

/**
 * La barra di scorrimento del tema dentro l'anteprima.
 *
 * L'iframe è un documento a sé: le regole di globals.css non ci arrivano e
 * compariva la barra grigia di sistema, con le frecce. I colori si leggono
 * dall'iframe stesso — le variabili CSS si ereditano fino a lui — così la
 * capsula è quella del tema in uso, verde in Carta e grigia in Sera. Il
 * foglio si aggiunge solo all'anteprima: l'HTML dell'email resta intatto.
 */
export function barraDelTema(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  if (!doc?.head) return;
  const stile = getComputedStyle(iframe);
  const pollice = stile.getPropertyValue("--scorre-pollice").trim();
  const attivo = stile.getPropertyValue("--scorre-pollice-attivo").trim() || pollice;
  const tinta = stile.getPropertyValue("--scorre-tinta").trim();
  if (!pollice) return;
  const el = doc.createElement("style");
  el.textContent = `
    ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
    ::-webkit-scrollbar-button, ::-webkit-scrollbar-corner { display: none; background: transparent; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: ${pollice} padding-box; }
    ::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active { background: ${attivo} padding-box; }
    @supports not selector(::-webkit-scrollbar) { html { scrollbar-width: thin; scrollbar-color: ${tinta || "auto"} transparent; } }
  `;
  doc.head.appendChild(el);
}
