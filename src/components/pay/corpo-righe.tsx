"use client";

import { Check } from "lucide-react";
import type { ContoTavolo } from "@/server/conto-tavolo";

export type Unita = {
  chiave: string;
  orderItemId: string;
  nome: string;
  prezzoCents: number;
  libera: boolean;
};

/**
 * Le unità del conto, una per riga.
 *
 * ## Le unità, non le righe
 *
 * Tre calici di Barolo stanno sul conto come **una** riga con quantità tre.
 * Se questa lista mostrasse una riga sola da selezionare o no, due persone non
 * potrebbero pagarsi un calice ciascuna — che è esattamente la situazione per
 * cui esiste il pagamento diviso. Quindi ogni unità è una voce a sé: tre righe
 * «Barolo €12», selezionabili separatamente.
 *
 * Le unità già pagate da qualcun altro restano visibili, barrate e non
 * toccabili: sparire sarebbe peggio — chi sta cercando il proprio piatto nella
 * lista si chiederebbe se ha sbagliato tavolo.
 */
export function unitaDelConto(conto: ContoTavolo): Unita[] {
  return conto.righe.flatMap((r) =>
    Array.from({ length: r.quantita }, (_, i) => ({
      chiave: `${r.id}#${i}`,
      orderItemId: r.id,
      nome: r.nome,
      prezzoCents: r.prezzoUnitarioCents,
      // Le prime unità di ogni riga sono quelle già prese: quale bottiglia sia
      // stata pagata non lo sa nessuno, quindi si mostrano in ordine.
      libera: i >= r.quantita - r.disponibili,
    })),
  );
}

/**
 * La riga intera è il bersaglio, non il quadratino.
 *
 * Un segno di spunta da sedici pixel in un elenco che si scorre col pollice è
 * un invito a sbagliare piatto. Qui il quadratino è solo il segno di cosa è
 * successo: quello che si tocca è tutta la riga, alta abbastanza da prendersi
 * senza guardare.
 */
export function CorpoRighe({
  unita,
  euro,
  presi,
  onCommuta,
}: {
  unita: Unita[];
  euro: (c: number) => string;
  presi: Set<string>;
  onCommuta: (chiave: string) => void;
}) {
  return (
    <ul className="space-y-2 pb-2">
      {unita.map((u) => {
        const scelto = presi.has(u.chiave);
        return (
          <li key={u.chiave}>
            <button
              type="button"
              disabled={!u.libera}
              onClick={() => onCommuta(u.chiave)}
              aria-pressed={scelto}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] transition duration-200 active:scale-[0.99] disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                scelto
                  ? "border-accent bg-accent/15"
                  : u.libera
                    ? "border-border bg-background/40 hover:border-accent/50"
                    : "border-border/40 bg-transparent opacity-45"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  scelto ? "border-accent bg-accent text-cream" : "border-border-strong"
                }`}
              >
                {scelto && <Check className="h-4 w-4" />}
              </span>
              <span className={`min-w-0 flex-1 truncate ${!u.libera ? "line-through" : ""}`}>
                {u.nome}
              </span>
              <span className={`shrink-0 tabular-nums ${!u.libera ? "line-through" : ""}`}>
                {euro(u.prezzoCents)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
