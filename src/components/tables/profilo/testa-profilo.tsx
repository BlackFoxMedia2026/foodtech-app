"use client";

import { ChevronLeft, CreditCard, X } from "lucide-react";
import { PannelloClose, PannelloTitle } from "@/components/ui/pannello";
import { StatoTavoloBadge } from "@/components/tables/stile-stato";
import { cn } from "@/lib/utils";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";

/**
 * La testata: **il tavolo e il suo stato**, in due righe invece di tre blocchi.
 *
 * ## Cosa è cambiato
 *
 * Prima erano tre cose impilate che sembravano indipendenti — un titolo, una
 * riga di metadati, una pillola — ognuna con la sua interlinea. Adesso il nome
 * e la sala stanno insieme perché sono la stessa domanda («quale tavolo»), e
 * lo stato sta sulla propria riga accanto al servizio perché è la risposta
 * all'altra domanda («com'è messo»). Due domande, due righe.
 *
 * ## La X
 *
 * È un comando secondario e adesso lo sembra: stessa misura, colore terziario,
 * e prende il suo peso solo quando ci passi sopra. Prima era crema piena
 * accanto a un titolo crema, cioè due cose dello stesso colore in cima al
 * pannello, di cui una sola conta.
 *
 * ## Il ritorno dai livelli
 *
 * Quando si è dentro «Personale» o «QR» la X diventa una freccia indietro: da
 * un livello si torna, non si esce. Uscire dal pannello per tornare al tavolo
 * che si stava guardando è il genere di cosa che si fa una volta e poi non si
 * riapre più.
 */
export function TestaProfilo({
  profilo,
  indietro,
}: {
  profilo: ProfiloTavolo;
  /** Se presente, si è dentro un livello: la chiusura diventa un ritorno. */
  indietro?: { etichetta: string; onIndietro: () => void };
}) {
  const { tavolo } = profilo;

  return (
    <div className="fissa border-b border-border px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {indietro ? (
            <>
              <button
                type="button"
                onClick={indietro.onIndietro}
                className="-ml-1 flex min-h-[32px] items-center gap-1 rounded-md pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Tavolo {tavolo.label}
              </button>
              <PannelloTitle className="text-display text-lg leading-tight">
                {indietro.etichetta}
              </PannelloTitle>
            </>
          ) : (
            <>
              <PannelloTitle className="text-display text-xl leading-none">
                Tavolo {tavolo.label}
              </PannelloTitle>
              <p className="mt-1 t-nota">
                {[tavolo.sala, `${tavolo.seats} ${tavolo.seats === 1 ? "posto" : "posti"}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          )}
        </div>

        <PannelloClose
          className={cn(
            "-mr-1 -mt-1 shrink-0 rounded-md p-2 text-tertiary-foreground transition-colors",
            "hover:bg-white/5 hover:text-foreground",
          )}
          aria-label="Chiudi"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </PannelloClose>
      </div>

      {!indietro && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatoTavoloBadge stato={profilo.stato} grande />
          {profilo.servizio && <span className="t-nota">{profilo.servizio}</span>}
          {/*
            «Sta pagando» non è un ottavo stato: è la ragione per cui conviene
            aspettare dieci secondi prima di portare il POS al tavolo. Sta
            accanto allo stato, non al suo posto.
          */}
          {profilo.pagamentoInCorso && (
            <span className="inline-flex items-center gap-1.5 text-xs text-accent-strong">
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              sta pagando
            </span>
          )}
        </div>
      )}
    </div>
  );
}
