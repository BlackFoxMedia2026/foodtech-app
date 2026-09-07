"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type FreeTable = { tableId: string; label: string; seats: number; roomName: string | null };
type Ricerca = { tables: FreeTable[]; reason: "venue_closed" | "shift_full" | "all_busy" | null };

const MOTIVO: Record<NonNullable<Ricerca["reason"]>, string> = {
  venue_closed: "Il locale è chiuso a quest'ora: fuori dal servizio non si assegnano tavoli.",
  shift_full:
    "Il turno è al completo. Puoi comunque forzare l'assegnazione dalla Sala, se il locale decide di accettare.",
  all_busy: "Tutti i tavoli abbastanza grandi sono occupati in questo momento.",
};

/**
 * Scegliere il tavolo, durante il servizio.
 *
 * Mostra **solo i tavoli davvero liberi adesso** — glielo chiede il motore di
 * disponibilità — perché durante il servizio non si ha tempo di scoprire dopo
 * che quel tavolo era già occupato. Le due operazioni condividono lo stesso
 * elenco: accomodare qualcuno che è arrivato, o spostare chi è già seduto.
 */
export function TablePickerDialog({
  open,
  onOpenChange,
  bookingId,
  partySize,
  titolo,
  seatAfter,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  partySize: number;
  titolo: string;
  /** Dopo l'assegnazione segna anche «seduto». */
  seatAfter: boolean;
  onDone: () => void;
}) {
  const [ricerca, setRicerca] = useState<Ricerca | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    setRicerca(null);
    setSelected(null);
    setError(null);

    fetch(`/api/tables/free?partySize=${partySize}`)
      .then(async (res) => {
        if (annullato) return;
        if (!res.ok) {
          setError(await readApiError(res, "Non siamo riusciti a leggere i tavoli liberi."));
          setRicerca({ tables: [], reason: null });
          return;
        }
        const data: Ricerca = await res.json();
        setRicerca(data);
        if (data.tables.length > 0) setSelected(data.tables[0].tableId);
      })
      .catch(() => {
        if (!annullato) {
          setError("Non siamo riusciti a leggere i tavoli liberi.");
          setRicerca({ tables: [], reason: null });
        }
      });

    return () => {
      annullato = true;
    };
  }, [open, partySize]);

  async function conferma() {
    if (!selected) return;
    setInCorso(true);
    setError(null);

    const assegna = await fetch(`/api/bookings/${bookingId}/assign-table`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId: selected }),
    });

    if (!assegna.ok) {
      setInCorso(false);
      setError(await readApiError(assegna, "Non siamo riusciti ad assegnare il tavolo. Riprova."));
      return;
    }

    if (seatAfter) {
      const siedi = await fetch(`/api/bookings/${bookingId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "SEATED" }),
      });
      if (!siedi.ok) {
        setInCorso(false);
        // Il tavolo è stato assegnato: dirlo evita che si riprovi da capo.
        setError(
          await readApiError(
            siedi,
            "Tavolo assegnato, ma non siamo riusciti a segnare l'ospite come seduto.",
          ),
        );
        return;
      }
    }

    setInCorso(false);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>
            {partySize} {partySize === 1 ? "persona" : "persone"} · tavoli liberi adesso
          </DialogDescription>
        </DialogHeader>

        {ricerca === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cerco i tavoli liberi…
          </div>
        ) : ricerca.tables.length === 0 ? (
          <EmptyState icon={Users} compact title="Nessun tavolo libero">
            {ricerca.reason ? MOTIVO[ricerca.reason] : null}
          </EmptyState>
        ) : (
          <ul className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {ricerca.tables.map((t) => (
              <li key={t.tableId}>
                <button
                  type="button"
                  onClick={() => setSelected(t.tableId)}
                  aria-pressed={selected === t.tableId}
                  className={cn(
                    "flex min-h-[64px] w-full flex-col items-start justify-center rounded-md border px-3 py-2 text-left transition-colors",
                    selected === t.tableId ? "border-cream bg-current/10" : "border-border hover:bg-current/5",
                  )}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.seats} posti</span>
                  {t.roomName && (
                    <span className="flex w-full items-center gap-1 text-xs text-tertiary-foreground">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t.roomName}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button type="button" variant="accent" disabled={!selected || inCorso} onClick={conferma}>
            {inCorso ? "Un istante…" : seatAfter ? "Accomoda qui" : "Sposta qui"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
