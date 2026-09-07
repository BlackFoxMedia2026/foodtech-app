"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Check, MapPin, Star, Timer, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { SeatFromWaitlistDialog } from "@/components/waitlist/seat-from-waitlist-dialog";
import { cn } from "@/lib/utils";

export type WaitlistRowEntry = {
  id: string;
  guestName: string;
  phone: string | null;
  partySize: number;
  status: string;
  notes: string | null;
  waitingMin: number;
  overdue: boolean;
  expectedWaitMin: number;
  desiredAt: string | null;
  offerExpiresAt: string | null;
  isVip: boolean;
  allergies: string | null;
  preferredRoomName: string | null;
};

const STATO: Record<string, { testo: string; classe: string }> = {
  WAITING: { testo: "In attesa", classe: "bg-current/10 text-muted-foreground" },
  NOTIFIED: { testo: "Avvisato", classe: "bg-accent/20 text-accent-foreground" },
  CONFIRMED: { testo: "Sta arrivando", classe: "bg-sage/25 text-foreground" },
};

export function WaitlistRow({
  entry,
  position,
  canManage,
  onChanged,
}: {
  entry: WaitlistRowEntry;
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
              {entry.waitingMin === 0 ? "appena entrato" : `in attesa da ${entry.waitingMin} min`}
              {entry.overdue && ` · oltre la stima di ${entry.expectedWaitMin} min`}
              {entry.status === "NOTIFIED" && entry.offerExpiresAt && (
                <> · tavolo tenuto fino alle {ora(entry.offerExpiresAt)}</>
              )}
            </p>

            {entry.allergies && (
              <p className="mt-1 flex items-center gap-1 text-xs text-accent">
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
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => azione("confirm", `/api/waitlist/${entry.id}/confirm`)}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "confirm" ? "Salvo…" : "Ha confermato"}
              </Button>
            )}

            <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => setSeatOpen(true)}>
              <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Accomoda
            </Button>

            <Button
              size="sm"
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
