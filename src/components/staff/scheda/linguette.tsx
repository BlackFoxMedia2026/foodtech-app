"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { TAB_SCHEDA, type TabScheda } from "@/lib/scheda-dipendente";
import { cn } from "@/lib/utils";

/**
 * Le linguette della scheda.
 *
 * Sono **link** con `?tab=`, non uno stato: «guarda i documenti di Marco» è
 * un indirizzo che si manda, e tornare indietro dal browser deve riportare
 * alla linguetta di prima. Il server rende solo la linguetta aperta, quindi
 * aprire la scheda non carica le note, i turni e il registro di una persona
 * per mostrare la Panoramica.
 *
 * Grandi (`text-base`) e con il sottolineato pieno sull'attiva: la scheda la
 * usa anche chi con il gestionale ha poca confidenza, e una linguetta da 12
 * px con un cambio di colore appena percettibile non si trova. Sul telefono
 * scorrono in orizzontale e l'attiva si porta in vista da sola.
 */
export function Linguette({
  attiva,
  base,
  nascoste = [],
  contatori = {},
}: {
  attiva: TabScheda;
  /** `/staff/<id>` */
  base: string;
  nascoste?: TabScheda[];
  /** Un numero accanto al nome: documenti caricati, scadenze da sistemare. */
  contatori?: Partial<Record<TabScheda, number>>;
}) {
  const attivaRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    attivaRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [attiva]);

  return (
    <nav aria-label="Sezioni della scheda" className="nav-scroll -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max items-stretch gap-1 border-b border-border">
        {TAB_SCHEDA.filter((t) => !nascoste.includes(t.chiave)).map((t) => {
          const eAttiva = t.chiave === attiva;
          const n = contatori[t.chiave];
          return (
            <li key={t.chiave}>
              <Link
                ref={eAttiva ? attivaRef : undefined}
                href={t.chiave === "panoramica" ? base : `${base}?tab=${t.chiave}`}
                scroll={false}
                aria-current={eAttiva ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-2 whitespace-nowrap px-3 text-[15px] font-medium transition-colors md:text-base",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  eAttiva ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {typeof n === "number" && n > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs tabular-nums leading-none",
                      eAttiva ? "bg-accent/50 text-cream" : "bg-cream/10 text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                )}
                {eAttiva && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-strong" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
