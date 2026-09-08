"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ListOrdered, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AddToWaitlistDialog } from "@/components/waitlist/add-to-waitlist-dialog";
import { WaitlistRow, type WaitlistRowEntry } from "@/components/waitlist/waitlist-row";
import { durataUmana } from "@/lib/durata";

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
  summary,
  rooms,
  canManage,
}: {
  entries: WaitlistRowEntry[];
  summary: WaitlistSummary;
  rooms: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Direzione C: qui si lavora, e chi guarda questa schermata ha
          qualcuno in piedi davanti. Il titolo si asciuga, il riassunto resta
          — è quello che serve. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold leading-none">Lista d&apos;attesa</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
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
        <section className="surface grid grid-cols-3 divide-x divide-border riquadro">
          {/* «2 in attesa» accanto a «9 persone in coda» si leggeva come una
              contraddizione: sono gruppi, non persone. Un numero, un nome. */}
          <Stat icon={ListOrdered} label="Gruppi in attesa" value={summary.inAttesa} />
          <Stat icon={Clock} label="Avvisati" value={summary.avvisati} hint="tavolo tenuto" />
          <Stat icon={Users} label="Confermati" value={summary.confermati} hint="stanno arrivando" />
        </section>
      )}

      {entries.length === 0 ? (
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
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, i) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
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

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  hint?: string;
}) {
  /** Una cella di una fascia, come i numeri del Servizio: sans e tabellari. */
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums">{value}</p>
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
          {hint && <span className="normal-case tracking-normal text-tertiary-foreground"> · {hint}</span>}
        </p>
      </div>
    </div>
  );
}
