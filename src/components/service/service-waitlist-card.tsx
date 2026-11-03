"use client";

import { useState } from "react";
import { BellRing, MoreHorizontal, Timer, UserMinus, Users, UtensilsCrossed, X } from "lucide-react";
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
  /* Accomodata, esce scivolando verso «Accomodati», come la scheda di
     prenotazione. Dopo quattro secondi torna visibile se nulla è cambiato. */
  const [uscente, setUscente] = useState(false);

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
      data-uscente={uscente || undefined}
      className={cn(
        "surface scheda-passo overflow-hidden rounded-2xl border",
        secondarie.length > 0 && "cursor-pointer",
        entry.overdue ? "border-accent/60" : "border-border",
      )}
    >
      {/* La stessa struttura della scheda di prenotazione, fascia per fascia:
          chi scorre la colonna «In attesa» passa da una all'altra senza dover
          rileggere dove sta il nome. Al posto dell'ora c'è il posto in coda. */}
      <div className="flex items-center gap-2.5 pl-4 pr-2 pt-3.5">
        <span
          className="segnale-pastiglia flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums"
          aria-label={`${posizione}° in lista`}
        >
          {posizione}
        </span>
        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]">
          {entry.guestName}
          {entry.isVip && (
            <span className="ml-2 align-[2px] text-[11px] font-bold tracking-[0.1em] text-accent-strong">VIP</span>
          )}
        </span>

        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {!azioniAperte && principale && (
              <Button
                size="sm"
                variant="accent"
                className="tocco-comodo azione-servizio"
                disabled={busy}
                onClick={principale.onClick}
              >
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

      {/* Solo l'essenziale, su una riga: quanti, da quanto aspettano, e lo
          stato se non è più «in attesa». L'attesa resta anche con le azioni
          aperte: è il dato con cui si decide chi accomodare. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pb-3.5 pt-2 text-[15px] text-foreground/80">
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
          <Users className="h-4 w-4 opacity-60" aria-hidden="true" />
          {entry.partySize}
          <span className="sr-only">{entry.partySize === 1 ? "persona" : "persone"}</span>
        </span>
        <span className={cn("inline-flex items-center gap-1.5", entry.overdue && "font-semibold text-accent-strong")}>
          <Timer className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          {entry.waitingMin === 0 ? "appena entrato" : durataUmana(entry.waitingMin)}
        </span>
        {entry.status === "NOTIFIED" && (
          <span className="segnale-attenzione ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-semibold">avvisato</span>
        )}
        {entry.status === "CONFIRMED" && (
          <span className="segnale-arriva ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-semibold">sta arrivando</span>
        )}
      </div>

      {azioniAperte && (
        <div className="px-4 pb-4">
          <GrigliaAzioni azioni={azioni} />
        </div>
      )}

      {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}

      {seatOpen && (
        <SeatFromWaitlistDialog
          entryId={entry.id}
          guestName={entry.guestName}
          partySize={entry.partySize}
          open={seatOpen}
          onOpenChange={setSeatOpen}
          onSeated={() => {
            setUscente(true);
            window.setTimeout(() => setUscente(false), 4000);
            onChanged();
          }}
        />
      )}
    </article>
  );
}
