"use client";

import { useState } from "react";
import { CellaNumero } from "@/components/ui/cella-numero";
import { useRouter } from "next/navigation";
import { Clock, ListOrdered, Users } from "lucide-react";
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
    <div className="schermo animate-fade-in gap-4">
      {/* Direzione C: qui si lavora, e chi guarda questa schermata ha
          qualcuno in piedi davanti. Il titolo si asciuga, il riassunto resta
          — è quello che serve. */}
      <header className="fissa flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold leading-none">Lista d&apos;attesa</h1>
            <p className="t-etichetta">Sala</p>
          </div>
          {entries.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.personeInCoda} {summary.personeInCoda === 1 ? "persona" : "persone"} in coda
              {summary.attesaMediaMin > 0 && ` · attesa media ${durataUmana(summary.attesaMediaMin)}`}
              {summary.inRitardo > 0 && ` · ${summary.inRitardo} oltre la stima`}
            </p>
          )}
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
          <Button variant="accent" onClick={() => setAddOpen(true)}>
            + Aggiungi in lista
          </Button>
        )}
      </header>

      {entries.length > 0 && (
        <section className="fissa surface grid grid-cols-3 divide-x divide-border riquadro">
          {/* «2 in attesa» accanto a «9 persone in coda» si leggeva come una
              contraddizione: sono gruppi, non persone. Un numero, un nome. */}
          <CellaNumero icona={ListOrdered} etichetta={["Gruppo in attesa", "Gruppi in attesa"]} valore={summary.inAttesa} />
          <CellaNumero icona={Clock} etichetta={["Avvisato", "Avvisati"]} valore={summary.avvisati} nota="tavolo tenuto" />
          <CellaNumero icona={Users} etichetta={["Confermato", "Confermati"]} valore={summary.confermati} nota={["sta arrivando", "stanno arrivando"]} />
        </section>
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
        <ul className="fill-scroll space-y-2 pr-0.5">
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

