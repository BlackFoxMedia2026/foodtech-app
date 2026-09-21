"use client";

import { useState } from "react";
import { AlertTriangle, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OspiteDaAccomodare } from "@/server/staff-app/da-accomodare";

/**
 * **Da accomodare** — la coda dell'ingresso, in cima alla Sala.
 *
 * ## Perché non è un altro riquadro grande
 *
 * Il brief è esplicito: «non un altro enorme box testuale, una pill/barra
 * compatta e operativa». Quindi: un'etichetta con un numero, e una riga per
 * persona alta 60 px con il nome, i coperti, l'ora e il pulsante che fa la
 * cosa. Niente icone decorative, niente bordi doppi, niente titolo di sezione
 * in maiuscoletto grande — la coda deve stare sopra i tavoli senza spingerli
 * fuori dallo schermo, perché entrambi servono nello stesso momento.
 *
 * ## Quando non c'è nessuno
 *
 * La coda **scompare**, e non lascia niente al suo posto. Un riquadro che
 * dice «nessuno in attesa» occupa ottanta pixel per confermare la condizione
 * normale di due terzi del servizio — è la stessa regola che «Da fare» segue
 * già in Home. Il walk-in non sparisce con lei: sta al centro della barra in
 * basso, sempre a portata di pollice, perché chi entra senza prenotazione
 * arriva anche quando la coda è vuota.
 *
 * ## L'attesa che si vede
 *
 * Oltre dieci minuti la riga cambia tono. Non è un allarme: è il fatto che
 * chi è in piedi da dieci minuti ha la precedenza su chi è appena entrato, e
 * la coda è già ordinata per attesa. Il numero dei minuti si scrive solo
 * quando c'è, perché «attende da 0 min» è rumore.
 */

/** Quante righe si vedono prima di chiedere di aprirle tutte. */
const VISIBILI = 3;

export function CodaDaAccomodare({
  ospiti,
  puoAccomodare,
  onTrovaTavolo,
}: {
  ospiti: OspiteDaAccomodare[];
  puoAccomodare: boolean;
  onTrovaTavolo: (ospite: OspiteDaAccomodare) => void;
}) {
  const [tutte, setTutte] = useState(false);
  const visibili = tutte ? ospiti : ospiti.slice(0, VISIBILI);
  const nascoste = ospiti.length - visibili.length;

  if (ospiti.length === 0) return null;

  return (
    <div className="fissa px-4 pb-3">
      <section
        aria-label="Ospiti da accomodare"
        className="rounded-[16px] border border-accent/50 bg-accent/10 p-2.5"
      >
        <div className="flex items-center gap-2 px-1 pb-2">
          <DoorOpen className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <h2 className="sa-etichetta text-accent-strong">Da accomodare</h2>
          <span className="ml-auto rounded-full bg-accent/25 px-2 py-0.5 text-[0.8125rem] font-medium tabular-nums text-accent-strong">
            {ospiti.length}
          </span>
        </div>

        <ul className="space-y-1.5">
          {visibili.map((o) => (
            <li key={o.bookingId}>
              <button
                type="button"
                disabled={!puoAccomodare}
                onClick={() => onTrovaTavolo(o)}
                className={cn(
                  "sa-tocco flex min-h-[60px] w-full items-center gap-3 rounded-[12px] border bg-card px-3 py-2 text-left",
                  o.attesaLunga ? "border-accent/60" : "border-border",
                  !puoAccomodare && "cursor-default",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="sa-corpo truncate font-medium">
                    {o.nome}
                    {o.allergie && (
                      <AlertTriangle
                        className="ml-1.5 inline h-4 w-4 align-[-2px] text-destructive-soft"
                        aria-label="Allergie dichiarate"
                      />
                    )}
                  </p>
                  <p className="sa-nota mt-0.5 truncate tabular-nums">
                    {o.coperti === 1 ? "1 ospite" : `${o.coperti} ospiti`} · {o.ora}
                    {o.attesaMin > 0 && ` · attende da ${o.attesaMin} min`}
                  </p>
                </div>
                {puoAccomodare && (
                  <span className="shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-[0.8125rem] font-medium text-accent-strong">
                    Trova tavolo
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {nascoste > 0 && (
          <button
            type="button"
            onClick={() => setTutte(true)}
            className="sa-nota min-h-[40px] w-full px-1 text-left"
          >
            Altri {nascoste} in attesa
          </button>
        )}

      </section>
    </div>
  );
}
