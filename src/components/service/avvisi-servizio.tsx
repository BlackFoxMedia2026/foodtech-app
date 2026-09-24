"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ServiceInsights } from "@/components/service/service-insights";
import { livelloAvviso } from "@/lib/livello-avviso";
import { cn } from "@/lib/utils";
import type { ServiceInsight } from "@/server/service-intelligence";

/**
 * Gli avvisi, in un bersaglio invece che in una fascia.
 *
 * ## Perché escono dalla pagina
 *
 * Fino a oggi «Da tenere d'occhio» era una sezione alta fino al 34% dello
 * schermo. Il costo non era lo spazio in sé: era **dove** lo prendeva. Stava
 * fra i numeri della sera e il lavoro, quindi con sei avvisi la prima
 * prenotazione cominciava a 540 px e su un portatile finiva sotto la piega.
 * Cioè la fascia si allargava **esattamente quando c'è più da fare**, e per
 * farlo copriva il lavoro.
 *
 * Adesso è un pulsante accanto all'interruttore Elenco/Sala, come la
 * campanella delle notifiche nello shell: gli avvisi non sono spariti, hanno
 * smesso di interrompere la pagina.
 *
 * ## Cosa non cambia, di proposito
 *
 * - **le quattro parti** — problema, motivo, impatto, azione — perché è la
 *   gerarchia che già regge `ServiceInsights`, e qui non se ne inventa una
 *   seconda;
 * - **l'ordine per *quando*** (`livelloAvviso`), non per gravità;
 * - **l'azione contestuale** su ogni avviso, che è ciò che distingue un
 *   avviso da una notifica.
 *
 * ## Cosa conta il numero sul pulsante
 *
 * Solo quello che si decide **adesso o fra poco**. Un «6» che comprende
 * quattro righe di contesto di chiusura dice di alzarsi per niente, e la
 * seconda sera non lo si guarda più. Le altre restano nel pannello, sotto,
 * nella loro forma compatta.
 */
export function AvvisiServizio({ insights }: { insights: ServiceInsight[] }) {
  const [aperto, setAperto] = useState(false);

  const daFare = insights.filter((i) => {
    const l = livelloAvviso(i);
    return l === "adesso" || l === "fra_poco";
  }).length;

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            daFare > 0
              ? `Da tenere d'occhio: ${daFare} ${daFare === 1 ? "avviso" : "avvisi"}`
              : "Da tenere d'occhio: nessun avviso"
          }
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors lg:px-3.5",
            /*
              Due stati e nessun alone. Con avvisi il bordo è accento pieno e
              il fondo una velatura al 12%: si trova con la coda dell'occhio
              senza brillare. Senza avvisi è un bordo come quello del tondo
              «aggiorna» qui accanto — c'è, non chiama.
            */
            daFare > 0
              ? "border-accent/60 bg-accent/[0.12] text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <AlertTriangle
            className={cn("h-4 w-4 shrink-0", daFare > 0 && "text-accent-strong")}
            aria-hidden="true"
          />
          {/* Il nome per esteso da `lg` in su. Sotto, la testata ha già
              l'interruttore Elenco/Sala e i cambiamenti recenti, e resta la
              sola icona con il suo numero. */}
          <span className="hidden lg:inline">Da tenere d&apos;occhio</span>
          {daFare > 0 && (
            /* La pillola `warning` del sistema — accento al 50% con il crema
               sopra, 5,12 : 1 — non un pallino rosso fuori tavolozza. */
            <span
              className="grid h-5 min-w-[1.25rem] place-items-center rounded-full border border-accent/60 bg-accent/50 px-1.5 text-[11px] font-semibold tabular-nums text-ink"
              aria-hidden="true"
            >
              {daFare}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/*
        Un pannello ancorato, non una modale: chi lo apre sta guardando la
        sala e deve poterlo chiudere con un tocco fuori. 22rem sul telefono,
        26rem da `sm`, e l'altezza si ferma a metà schermo — l'elenco scorre
        dentro di sé invece di allungare il pannello oltre il bordo.
      */}
      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-[26rem]">
        <div className="px-3.5 pb-2.5 pt-3">
          <p className="text-sm font-medium">Da tenere d&apos;occhio</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {insights.length === 0
              ? "niente in sospeso"
              : daFare === 0
                ? `${insights.length === 1 ? "1 cosa" : `${insights.length} cose`} da sapere, niente da decidere adesso`
                : `${daFare === 1 ? "1 cosa" : `${daFare} cose`} da decidere adesso`}
          </p>
        </div>
        <div className="h-px bg-border" />
        <div className="max-h-[50vh] overflow-y-auto p-2.5">
          {insights.length === 0 ? (
            <p className="px-1 py-3 text-sm leading-relaxed text-muted-foreground">
              Nessun problema in vista: arrivi distribuiti, tavoli che si liberano in tempo, nessuno
              che aspetta senza motivo.
            </p>
          ) : (
            /* `compact` toglie la griglia a due colonne: in 26rem due colonne
               sarebbero due strisce. Il resto — barra del «quando», prefisso
               dell'impatto, azione — è lo stesso componente di prima. */
            <ServiceInsights insights={insights} compact />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
