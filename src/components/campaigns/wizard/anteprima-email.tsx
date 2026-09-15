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
