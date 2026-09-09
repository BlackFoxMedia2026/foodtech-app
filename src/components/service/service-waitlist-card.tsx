"use client";

import { useState } from "react";
import { BellRing, Star, Timer, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { durataUmana } from "@/lib/durata";
import { cn } from "@/lib/utils";
import { SeatFromWaitlistDialog } from "@/components/waitlist/seat-from-waitlist-dialog";

/** La versione compatta della riga in attesa, per la colonna del servizio. */
export function ServiceWaitlistCard({
  entry,
  posizione,
  canManage,
  onChanged,
}: {
  entry: {
    id: string;
    guestName: string;
    partySize: number;
    status: string;
    waitingMin: number;
    overdue: boolean;
    isVip: boolean;
  };
  posizione: number;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);

  async function azione(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a completare l'operazione."));
      return;
    }
    onChanged();
  }

  return (
    <article className={cn("surface rounded-md border p-3", entry.overdue ? "border-accent/60" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/10 text-[11px]">
              {posizione}
            </span>
            <span className="truncate font-medium">{entry.guestName}</span>
            {entry.isVip && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px]">VIP</span>}
            {entry.status === "NOTIFIED" && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px]">avvisato</span>
            )}
            {entry.status === "CONFIRMED" && (
              <span className="rounded-full bg-sage/25 px-2 py-0.5 text-[11px]">sta arrivando</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.partySize} {entry.partySize === 1 ? "persona" : "persone"}
          </p>
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-xs",
              entry.overdue ? "text-accent-strong" : "text-tertiary-foreground",
            )}
          >
            <Timer className="h-3 w-3" aria-hidden="true" />
            {entry.waitingMin === 0 ? "appena entrato" : `da ${durataUmana(entry.waitingMin)}`}
          </p>
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Button size="sm" variant="accent" disabled={busy} onClick={() => setSeatOpen(true)}>
              <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Accomoda
            </Button>
            <div className="flex items-center gap-0.5">
              {entry.status === "WAITING" && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Avvisa ${entry.guestName}`}
                  title="Avvisa"
                  onClick={() => azione(`/api/waitlist/${entry.id}/notify`, { via: "manuale" })}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                aria-label={`Togli ${entry.guestName} dalla lista`}
                title="Se ne è andato"
                onClick={() => azione(`/api/waitlist/${entry.id}/close`, { status: "LEFT" })}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {seatOpen && (
        <SeatFromWaitlistDialog
          entryId={entry.id}
          guestName={entry.guestName}
          partySize={entry.partySize}
          open={seatOpen}
          onOpenChange={setSeatOpen}
          onSeated={onChanged}
        />
      )}
    </article>
  );
}
