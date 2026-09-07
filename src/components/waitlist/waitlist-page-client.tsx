"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ListOrdered, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AddToWaitlistDialog } from "@/components/waitlist/add-to-waitlist-dialog";
import { WaitlistRow, type WaitlistRowEntry } from "@/components/waitlist/waitlist-row";

export type WaitlistSummary = {
  inAttesa: number;
  avvisati: number;
  confermati: number;
  personeInCoda: number;
  attesaMediaMin: number;
  inRitardo: number;
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Lista d&apos;attesa</h1>
          {entries.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.personeInCoda} {summary.personeInCoda === 1 ? "persona" : "persone"} in coda
              {summary.attesaMediaMin > 0 && ` · attesa media ${summary.attesaMediaMin} min`}
              {summary.inRitardo > 0 && ` · ${summary.inRitardo} oltre la stima`}
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
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat icon={ListOrdered} label="In attesa" value={summary.inAttesa} />
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
  return (
    <div className="surface rounded-md border border-border p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-2xl text-display">{value}</p>
      {hint && <p className="text-xs text-tertiary-foreground">{hint}</p>}
    </div>
  );
}
