"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Check, MapPin, Star, Timer, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { SeatFromWaitlistDialog } from "@/components/waitlist/seat-from-waitlist-dialog";
import { cn } from "@/lib/utils";
import { durataUmana } from "@/lib/durata";

export type WaitlistRowEntry = {
  id: string;
  guestName: string;
  phone: string | null;
  partySize: number;
  status: string;
  notes: string | null;
  waitingMin: number;
  overdue: boolean;
  /** Di quanto abbiamo sforato la promessa: è il numero che dà la precedenza. */
  ritardoSullaPromessa: number;
  expectedWaitMin: number;
  desiredAt: string | null;
  offerExpiresAt: string | null;
  isVip: boolean;
  allergies: string | null;
  preferredRoomName: string | null;
  /**
   * Vero quando la precedenza sul primo tavolo che si libera è sua, e **non**
   * è già la prima della fila: si segnala solo quando l'ordine di arrivo e la
   * precedenza non coincidono.
   */
  tocca: boolean;
};

const STATO: Record<string, { testo: string; classe: string }> = {
  WAITING: { testo: "In attesa", classe: "bg-current/10 text-muted-foreground" },
  NOTIFIED: { testo: "Avvisato", classe: "bg-accent/20 text-accent-foreground" },
  CONFIRMED: { testo: "Sta arrivando", classe: "bg-sage/25 text-foreground" },
};

export function WaitlistRow({
  entry,
  suggerito,
  position,
  canManage,
  onChanged,
}: {
  entry: WaitlistRowEntry;
  /**
   * Il tavolo che potrebbe accoglierlo adesso — il più piccolo che basta, e
   * proposto a una persona sola. Assente quando non ce n'è nessuno: la riga
   * non scrive «nessun tavolo», perché l'assenza si vede già.
   */
  suggerito?: { tableId: string; label: string; seats: number };
  position: number;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);

  async function azione(nome: string, url: string, body?: unknown) {
    setBusy(nome);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a completare l'operazione. Riprova."));
      return;
    }
    onChanged();
  }

  const stato = STATO[entry.status] ?? { testo: entry.status, classe: "bg-current/10" };

  return (
    <li
      className={cn(
        "surface rounded-md border p-4",
        entry.overdue ? "border-accent/60" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-current/10 text-xs font-medium">
            {position}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{entry.guestName}</p>
              {/*
                «Tocca a lei» compare solo quando la precedenza non coincide
                con l'ordine di arrivo: è la decisione del motore detta in due
                parole, con accanto il perché — quanto abbiamo sforato la
                promessa — nella riga sotto. Sul primo della fila non
                comparirebbe niente, perché non ci sarebbe niente da dire.
              */}
              {entry.tocca && (
                <span className="inline-flex items-center gap-1 rounded-md border border-accent/50 bg-accent/15 px-2 py-0.5 text-xs font-medium">
                  Tocca a lei
                </span>
              )}
              {entry.isVip && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs">
                  <Star className="h-3 w-3" aria-hidden="true" /> VIP
                </span>
              )}
              <span className={cn("rounded-full px-2 py-0.5 text-xs", stato.classe)}>{stato.testo}</span>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">
              {entry.partySize} {entry.partySize === 1 ? "persona" : "persone"}
              {entry.phone && ` · ${entry.phone}`}
              {entry.preferredRoomName && (
                <>
                  {" · "}
                  <MapPin className="inline h-3 w-3" aria-hidden="true" /> {entry.preferredRoomName}
                </>
              )}
            </p>

            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-xs",
                entry.overdue ? "text-accent" : "text-tertiary-foreground",
              )}
            >
              <Timer className="h-3 w-3" aria-hidden="true" />
              {/*
                In ore, non in minuti: «in attesa da 937 min» era esatto e
                illeggibile, e nessuno converte a mente mentre ha una persona
                davanti. È il terzo dei sette principi dell'audit visivo, e
                qui era rimasto scoperto.
              */}
              {entry.waitingMin === 0
                ? "appena entrato"
                : `in attesa da ${durataUmana(entry.waitingMin)}`}
              {/*
                Non «oltre la stima di venti minuti» ma «quindici minuti oltre
                la stima»: il numero che serve è di quanto abbiamo sforato, non
                quanto avevamo promesso. Ed è lo stesso numero che decide chi
                ha la precedenza sul primo tavolo che si libera
                (`confrontaPerPrecedenza`), quindi chi legge la riga capisce
                perché l'ordine è quello.
              */}
              {entry.overdue &&
                entry.ritardoSullaPromessa > 0 &&
                ` · ${durataUmana(entry.ritardoSullaPromessa)} oltre la stima`}
              {entry.status === "NOTIFIED" && entry.offerExpiresAt && (
                <> · tavolo tenuto fino alle {ora(entry.offerExpiresAt)}</>
              )}
            </p>

            {/*
              Il tavolo da proporre, **nella riga**.

              Il motore che lo trova esisteva già, ma bisognava premere
              «Accomoda» e aprire una finestra per sapere quale. In Servizio
              l'avviso lo dice ancora prima; qui, nella schermata che si chiama
              Attesa, no.

              È un suggerimento, non una promessa: premendo «Accomoda» la
              verifica completa si rifà, e se il tavolo è stato preso nel
              frattempo lo dice. Per questo il testo è «potrebbe stare», non
              «è suo».
            */}
            {suggerito && (
              <p className="mt-1 flex items-center gap-1 text-xs text-sage">
                <UtensilsCrossed className="h-3 w-3 shrink-0" aria-hidden="true" />
                Potrebbe stare al <strong className="font-medium">{suggerito.label}</strong> — {suggerito.seats}{" "}
                {suggerito.seats === 1 ? "posto" : "posti"}
              </p>
            )}

            {entry.allergies && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gilt">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {entry.allergies}
              </p>
            )}
            {entry.notes && <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {entry.status === "WAITING" && (
              <Button
                className="tocco-comodo"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => azione("notify", `/api/waitlist/${entry.id}/notify`, { via: "manuale" })}
              >
                <BellRing className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "notify" ? "Avviso…" : "Avvisa"}
              </Button>
            )}

            {entry.status === "NOTIFIED" && (
              <Button
                className="tocco-comodo"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => azione("confirm", `/api/waitlist/${entry.id}/confirm`)}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "confirm" ? "Salvo…" : "Ha confermato"}
              </Button>
            )}

            {/*
              Il pulsante nomina il tavolo quando ce n'è uno da proporre: chi
              lo preme sa dove sta mandando la persona prima di premerlo. La
              finestra si apre comunque, perché la scelta finale è del
              personale e a volte il tavolo giusto è un altro — ma si apre
              **con quello già scelto**.
            */}
            <Button
              size="sm"
              className="tocco-comodo"
              variant="accent"
              disabled={busy !== null}
              /*
                Il nome accessibile porta **chi**, non solo il verbo: dieci
                pulsanti «Accomoda» in una lista sono dieci pulsanti identici
                per chi naviga a voce, e non c'è modo di sapere quale riga si
                sta per accomodare. È la stessa lezione del pulsante «Walk-in»
                nella Panoramica, dove l'etichetta corta aveva perso il verbo.
              */
              aria-label={`Accomoda ${entry.guestName}${suggerito ? ` al tavolo ${suggerito.label}` : ""}`}
              onClick={() => setSeatOpen(true)}
            >
              <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {suggerito ? `Accomoda al ${suggerito.label}` : "Accomoda"}
            </Button>

            <Button
              size="sm"
              className="tocco-comodo"
              variant="ghost"
              disabled={busy !== null}
              aria-label={`Togli ${entry.guestName} dalla lista`}
              onClick={() => azione("close", `/api/waitlist/${entry.id}/close`, { status: "LEFT" })}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

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
    </li>
  );
}

function ora(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
