"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, Map } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Due modi di guardare la stessa cosa.
 *
 * Durante il servizio si passa continuamente dall'elenco («chi arriva
 * adesso?») alla pianta («dove lo metto?»). Sono la stessa realtà da due
 * angoli, e tenerle in due sezioni distanti costringerebbe a navigare invece
 * di guardare.
 *
 * Sta **nella testata**, accanto al titolo «Servizio» (`#titolo-su-misura`,
 * lo stesso posto che usa l'editor della Sala). Prima aveva una riga sua sopra
 * le colonne, a destra, con gli avvisi accanto: una fascia di comandi che
 * spingeva giù il lavoro di 60 px e si leggeva come una barra di filtri.
 * Finché il posto non c'è — il primo passaggio sul server — non si vede
 * niente e resta il titolo di sempre.
 */
export function ServiceSwitch() {
  const pathname = usePathname();
  const [posto, setPosto] = useState<HTMLElement | null>(null);
  useEffect(() => setPosto(document.getElementById("titolo-su-misura")), []);

  const voci = [
    { href: "/service", label: "Elenco", icon: LayoutList },
    { href: "/service/room", label: "Sala", icon: Map },
  ];

  if (!posto) return null;

  return createPortal(
    <div className="flex min-w-0 items-center gap-3">
      {/* Sul telefono il titolo si legge solo a voce: marchio, titolo, due
          bottoni e le quattro icone di destra non stanno in 360 px, e la
          barra in basso dice già che si è nel Servizio. */}
      <h1 className="sr-only shrink-0 text-lg font-semibold leading-none sm:not-sr-only">Servizio</h1>
      <nav
        aria-label="Vista del servizio"
        /* La stessa capsula della fila di navigazione accanto — `capsula-fila`,
           p-1 e voci da 44 px — così le due stanno alla stessa altezza e si
           leggono come due gruppi dello stesso materiale. */
        className="capsula-fila flex shrink-0 gap-1 rounded-full border border-border bg-muted/70 p-1"
      >
        {voci.map(({ href, label, icon: Icon }) => {
          const attivo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={attivo ? "page" : undefined}
              aria-label={label}
              className={cn(
                "flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium leading-tight transition-colors sm:px-3.5",
                attivo ? "bg-segment text-segment-ink" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {/* Sul telefono la testata è contesa con le quattro icone di
                  destra: lì restano le icone, il nome è nell'`aria-label`. */}
              <span className="hidden sm:inline" aria-hidden="true">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>,
    posto,
  );
}
