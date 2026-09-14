"use client";

import { useState } from "react";
import { BellRing, MoreHorizontal, Timer, UserMinus, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { durataUmana } from "@/lib/durata";
import { cn } from "@/lib/utils";
import { SeatFromWaitlistDialog } from "@/components/waitlist/seat-from-waitlist-dialog";
import { clicSullaCard, GrigliaAzioni, type AzioneCard } from "@/components/service/azioni-card";

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
  const [azioniAperte, setAzioniAperte] = useState(false);

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

  /* Le stesse due grammatiche della card di prenotazione, e la stessa
     risposta: «Accomoda» resta sulla card, avvisa e «andato via» diventano
     piastrelle con il nome scritto. Erano due tondini da 36 px a due pixel
     l'uno dall'altro, e uno dei due toglie una persona dalla coda. */
  const azioni: AzioneCard[] = [];
  if (canManage) {
    azioni.push({
      chiave: "seat",
      etichetta: `Accomoda ${entry.guestName}`,
      corta: "Accomoda",
      icona: UtensilsCrossed,
      principale: true,
      disabilitato: busy,
      onClick: () => {
        setAzioniAperte(false);
        setSeatOpen(true);
      },
    });
    if (entry.status === "WAITING") {
      azioni.push({
        chiave: "notify",
        etichetta: `Avvisa ${entry.guestName} che il tavolo è pronto`,
        corta: "Avvisa",
        icona: BellRing,
        disabilitato: busy,
        onClick: () => {
          setAzioniAperte(false);
          azione(`/api/waitlist/${entry.id}/notify`, { via: "manuale" });
        },
      });
    }
    azioni.push({
      chiave: "left",
      etichetta: `Togli ${entry.guestName} dalla lista: se ne è andato`,
      corta: "Andato via",
      icona: UserMinus,
      disabilitato: busy,
      onClick: () => {
        setAzioniAperte(false);
        azione(`/api/waitlist/${entry.id}/close`, { status: "LEFT" });
      },
    });
  }

  const principale = azioni.find((a) => a.principale);
  const secondarie = azioni.filter((a) => !a.principale);

  return (
    <article
      onClick={(e) => {
        if (!clicSullaCard(e) || secondarie.length === 0) return;
        setAzioniAperte((v) => !v);
      }}
      className={cn(
        "surface rounded-md border p-3",
        secondarie.length > 0 && "cursor-pointer",
        entry.overdue ? "border-accent/60" : "border-border",
      )}
    >
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

          {/* L'attesa non si tace nemmeno con le azioni aperte: è il dato con
              cui si decide chi accomodare, e la decisione si prende proprio
              mentre si guarda il pulsante. */}
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
          <div className="flex shrink-0 items-center gap-1.5">
            {!azioniAperte && principale && (
              <Button size="sm" variant="accent" disabled={busy} onClick={principale.onClick}>
                <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Accomoda
              </Button>
            )}

            {secondarie.length > 0 && (
              <button
                type="button"
                onClick={() => setAzioniAperte((v) => !v)}
                aria-expanded={azioniAperte}
                aria-label={azioniAperte ? "Chiudi le azioni" : `Altre azioni per ${entry.guestName}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-current/10 hover:text-foreground"
              >
                {azioniAperte ? (
                  <X className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {azioniAperte && <GrigliaAzioni azioni={azioni} />}

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
