import Link from "next/link";
import { TAB_SCHEDA, type TabScheda } from "@/lib/scheda-dipendente";
import { cn } from "@/lib/utils";

/**
 * Le linguette della scheda.
 *
 * Sono **link** con `?tab=`, non uno stato: «guarda i documenti di Marco» è
 * un indirizzo che si manda, e tornare indietro dal browser deve riportare
 * alla linguetta di prima. Il server rende solo la linguetta aperta.
 *
 * ## Revisione del 4 novembre 2026
 *
 * Erano una fila sottolineata che scorreva in orizzontale: a 1300 px
 * l'ultima si leggeva «Note e s», e chi non sapeva che la fila scorreva non
 * la trovava. Adesso sono il binario a segmenti del vetro iOS (fondo grigio
 * trasparente, la scelta in bianco rialzato) e **vanno a capo** invece di
 * uscire dal bordo: nessuna linguetta si taglia, a nessuna larghezza. I nomi
 * sono quelli corti (`corta` in `TAB_SCHEDA`), così a schermo largo stanno
 * su una riga.
 *
 * Il binario è largo quanto la pagina e le linguette si dividono lo spazio
 * (`flex-auto`): una barra corta a sinistra lasciava un buco a destra.
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
  return (
    <nav aria-label="Sezioni della scheda">
      <ul className="flex w-full flex-wrap gap-0.5 rounded-[14px] bg-[rgba(118,118,128,0.12)] p-[3px]">
        {TAB_SCHEDA.filter((t) => !nascoste.includes(t.chiave)).map((t) => {
          const eAttiva = t.chiave === attiva;
          const n = contatori[t.chiave];
          return (
            <li key={t.chiave} className="flex-auto">
              <Link
                href={t.chiave === "panoramica" ? base : `${base}?tab=${t.chiave}`}
                scroll={false}
                aria-current={eAttiva ? "page" : undefined}
                title={t.label}
                className={cn(
                  "flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-[11px] px-3.5 text-[15px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  eAttiva
                    ? "bg-white/90 font-semibold text-[#10201a] shadow-[0_3px_8px_rgba(16,32,26,0.12),0_1px_1px_rgba(16,32,26,0.04)]"
                    : "text-muted-foreground hover:bg-white/40 hover:text-foreground",
                )}
              >
                {t.corta}
                {typeof n === "number" && n > 0 && (
                  <span
                    className={cn(
                      "grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-none",
                      t.chiave === "documenti" ? "bg-veil-10 text-muted-foreground" : "bg-accent-strong text-cream",
                    )}
                  >
                    {n}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
