"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ListOrdered, ListPlus, Timer, UserCheck } from "lucide-react";
import { FasciaTessere, TesseraKpi } from "@/components/ui/tessera-kpi";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AddToWaitlistDialog } from "@/components/waitlist/add-to-waitlist-dialog";
import { WaitlistRow, type WaitlistRowEntry } from "@/components/waitlist/waitlist-row";
import { durataUmana } from "@/lib/durata";
import { useServizioVivo } from "@/lib/use-servizio-vivo";

export type WaitlistSummary = {
  inAttesa: number;
  avvisati: number;
  confermati: number;
  personeInCoda: number;
  /** Calcolata su chi sta davvero aspettando, non sulle righe dimenticate. */
  attesaMediaMin: number;
  inRitardo: number;
  /** Righe in lista da più di quattro ore: da chiudere, non da contare. */
  dimenticate: number;
};

export function WaitlistPageClient({
  entries,
  suggeriti,
  summary,
  rooms,
  canManage,
}: {
  entries: WaitlistRowEntry[];
  /**
   * Il tavolo da proporre a ciascuno, per identificativo della riga. Chi non
   * c'è dentro non ha un tavolo libero che lo regga adesso — e la riga non
   * scrive niente invece di scrivere «nessun tavolo», che sarebbe una riga in
   * più per un'informazione che si vede già dall'assenza.
   */
  suggeriti: Record<string, { tableId: string; label: string; seats: number }>;
  summary: WaitlistSummary;
  rooms: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();

  /*
    La lista d'attesa non si aggiornava da sola: si ricaricava solo dopo
    un'azione fatta su questa schermata. Ma la coda la muovono anche gli
    altri — chi accomoda dalla Sala, chi conferma dal Servizio, e il lavoro in
    coda che fa scadere un'offerta dopo il suo tempo. Chi teneva aperta questa
    pagina vedeva una fila che non era più quella, e chiamava un nome già
    andato a tavola.

    Qui non c'è una fotografia da scaricare — le righe arrivano dal server —
    quindi la ricarica è `router.refresh()`, che rifà solo questa pagina.
  */
  useServizioVivo(async () => {
    router.refresh();
  });
  const [addOpen, setAddOpen] = useState(false);

  return (
    // `fondo-caldo` porta le variabili del vetro della Panoramica: le righe
    // sono schede di quel vetro, i gesti sono i suoi tondi allungati.
    <div className="schermo fondo-caldo animate-fade-in gap-4">
      {/* La testata come quella della Panoramica: una riga in serif che dice
          la cosa che serve — quante persone stanno aspettando — e accanto il
          gesto, col tono delle chiamate all'azione. */}
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-display text-xl md:text-2xl">
            {entries.length === 0
              ? "Nessuno in attesa."
              : `${summary.personeInCoda} ${summary.personeInCoda === 1 ? "persona" : "persone"} in coda.`}
          </p>
          {summary.dimenticate > 0 && (
            /* Una riga aperta da stamattina non è una persona che aspetta: è
               una riga da chiudere. Fuori dalla media, e detta qui. */
            <p className="mt-1 text-sm text-accent-strong">
              {summary.dimenticate === 1
                ? "Una persona è in lista da più di quattro ore: se non è più qui, chiudi la riga."
                : `${summary.dimenticate} persone sono in lista da più di quattro ore: se non sono più qui, chiudi le righe.`}
            </p>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="pulsante-cta tocco-comodo inline-flex h-10 items-center justify-center gap-2 rounded-full bg-cta pl-3 pr-4 text-xs font-semibold uppercase tracking-wider text-cta-ink shadow-[shadow:var(--button-accent-shadow)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ListPlus className="h-5 w-5 shrink-0" aria-hidden="true" />
            Aggiungi in lista
          </button>
        )}
      </header>

      {entries.length > 0 && (
        /* La fascia è la stessa tessera della Panoramica. «2 in attesa»
           accanto a «9 persone in coda» si leggeva come una contraddizione:
           sono gruppi, non persone. Un numero, un nome. */
        <FasciaTessere colonne={4}>
          <TesseraKpi
            icona={ListOrdered}
            etichetta={["Gruppo in attesa", "Gruppi in attesa"]}
            corta="In attesa"
            valore={summary.inAttesa}
            nota="in fila per un tavolo"
          />
          <TesseraKpi
            icona={BellRing}
            etichetta={["Avvisato", "Avvisati"]}
            valore={summary.avvisati}
            nota="tavolo tenuto"
          />
          <TesseraKpi
            icona={UserCheck}
            etichetta={["Confermato", "Confermati"]}
            valore={summary.confermati}
            nota={["sta arrivando", "stanno arrivando"]}
          />
          <TesseraKpi
            icona={Timer}
            etichetta="Attesa media"
            corta="Attesa"
            valore={summary.attesaMediaMin > 0 ? durataUmana(summary.attesaMediaMin) : "—"}
            allarme={summary.inRitardo > 0}
            nota={
              summary.inRitardo > 0
                ? `${summary.inRitardo} oltre la stima`
                : "tutti entro la stima"
            }
          />
        </FasciaTessere>
      )}

      {entries.length === 0 ? (
        <div className="fill">
        <EmptyState
          icon={ListOrdered}
          title="Nessuno in lista d'attesa"
          action={
            canManage ? (
              <Button variant="accent" onClick={() => setAddOpen(true)}>
                Aggiungi la prima persona
              </Button>
            ) : undefined
          }
        >
          Quando il locale è pieno, annota qui chi aspetta: Tavolo tiene il turno, calcola l&apos;attesa e
          ti dice appena si libera un tavolo che può accoglierli.
        </EmptyState>
        </div>
      ) : (
        /* `-mr-[18px]`: il margine destro più i 10 px del binario della barra
           (`scrollbar-gutter: stable`), così le schede finiscono a filo delle
           tessere sopra. */
        <ul className="vi-scorre fill-scroll -ml-2 -mr-[18px] flex flex-col gap-3.5 px-2 pb-2">
          {entries.map((entry, i) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
              suggerito={suggeriti[entry.id]}
              position={i + 1}
              canManage={canManage}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <AddToWaitlistDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          rooms={rooms}
          onAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}

