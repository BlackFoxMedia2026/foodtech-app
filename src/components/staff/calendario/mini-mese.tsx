"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { INIZIALI_GIORNI, etichettaMese, grigliaMese, numeroGiorno, stessoMese } from "@/lib/turni";
import { cn } from "@/lib/utils";

/**
 * Il mini-calendario della barra laterale.
 *
 * Scritto a mano invece che con `react-day-picker`, che pure è in
 * dipendenza: la libreria è installata ma non usata da nessuna parte del
 * prodotto, e portarla dentro per trentacinque caselle vorrebbe dire
 * riscriverne tutti gli stili per farla somigliare al resto — più codice di
 * questo, e un pezzo di interfaccia che si aggiorna per conto suo.
 *
 * Le tre evidenziazioni sono distinte apposta, perché il caso normale è
 * vederle tutte e tre insieme: **la settimana mostrata** è una fascia
 * continua, **il giorno scelto** è una pastiglia piena, **oggi** è un puntino
 * sotto il numero.
 */
export function MiniMese({
  mese,
  selezionato,
  oggi,
  settimana,
  onSeleziona,
  onCambiaMese,
}: {
  /** Un giorno qualsiasi del mese da mostrare. */
  mese: string;
  selezionato: string;
  oggi: string;
  /** I giorni coperti dalla vista principale, da evidenziare come fascia. */
  settimana: string[];
  onSeleziona: (dateKey: string) => void;
  onCambiaMese: (delta: number) => void;
}) {
  const giorni = useMemo(() => grigliaMese(mese), [mese]);
  const nellaSettimana = useMemo(() => new Set(settimana), [settimana]);

  return (
    <section className="riquadro bg-card/40 p-3">
      {/* Titolo a sinistra e frecce insieme a destra: sono due comandi dello
          stesso tipo, e separati ai due lati del titolo si premono uno per
          volta guardando ogni volta dove sono. */}
      <header className="mb-2.5 flex items-center justify-between gap-1">
        <p className="text-sm font-medium">{etichettaMese(mese)}</p>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onCambiaMese(-1)}
            aria-label="Mese precedente"
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-veil-10 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onCambiaMese(1)}
            aria-label="Mese successivo"
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-veil-10 hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </span>
      </header>

      <div className="grid grid-cols-7 gap-y-0.5">
        {INIZIALI_GIORNI.map((iniziale, i) => (
          <span key={i} className="pb-1 text-center text-[0.65rem] font-medium text-tertiary-foreground">
            {iniziale}
          </span>
        ))}

        {giorni.map((g, i) => {
          const fuoriMese = !stessoMese(g, mese);
          const inSettimana = nellaSettimana.has(g);
          const scelto = g === selezionato;
          const oggiQui = g === oggi;
          return (
            <div
              key={g}
              className={cn(
                // La fascia della settimana è disegnata sul contenitore, non
                // sul bottone: così i sette giorni formano una barra continua
                // invece di sette pastiglie staccate.
                "py-[1px]",
                inSettimana && "bg-veil-7",
                inSettimana && i % 7 === 0 && "rounded-l-md",
                inSettimana && i % 7 === 6 && "rounded-r-md",
              )}
            >
              <button
                type="button"
                onClick={() => onSeleziona(g)}
                aria-current={scelto ? "date" : undefined}
                aria-label={new Date(`${g}T12:00:00`).toLocaleDateString("it-IT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                className={cn(
                  "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                  /* I giorni del mese prima e dopo restano in secondo piano, ma
                     si leggono: al 35% stavano a 2.14:1, e sono **pulsanti** —
                     ci si clicca sopra per scegliere una data, quindi il numero
                     va letto. La gerarchia la fa `muted-foreground` contro
                     `foreground`, non l'opacità. */
                  fuoriMese ? "text-muted-foreground" : "text-foreground/85",
                  !scelto && "hover:bg-veil-15",
                  scelto && "bg-segment font-semibold text-segment-ink",
                  oggiQui && !scelto && "font-semibold text-accent-strong",
                )}
              >
                {numeroGiorno(g)}
                {oggiQui && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-[3px] h-[3px] w-[3px] rounded-full",
                      scelto ? "bg-clay-ink" : "bg-accent-strong",
                    )}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
