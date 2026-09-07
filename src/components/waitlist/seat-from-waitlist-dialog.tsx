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

type TableMatch = {
  tableId: string;
  label: string;
  seats: number;
  roomName: string | null;
  matchesPreference: boolean;
};

type TableSearch = { tables: TableMatch[]; reason: "venue_closed" | "shift_full" | "all_busy" | null };

/** «Nessun tavolo» non basta: il rimedio è diverso a seconda del motivo. */
const MOTIVO: Record<NonNullable<TableSearch["reason"]>, { titolo: string; spiegazione: string }> = {
  venue_closed: {
    titolo: "Il locale è chiuso a quest'ora",
    spiegazione:
      "Fuori dai turni di servizio non si può accomodare nessuno. Controlla i turni in Impostazioni, oppure accomoda quando apre il servizio.",
  },
  shift_full: {
    titolo: "Il turno è al completo",
    spiegazione:
      "I coperti di questo turno sono esauriti: non è un problema di tavoli. Puoi avvisare l'ospite dell'attesa e accomodarlo quando un tavolo si libera.",
  },
  all_busy: {
    titolo: "Tutti i tavoli sono occupati",
    spiegazione:
      "Nessun tavolo abbastanza grande è libero in questo momento. Avvisa l'ospite dell'attesa, oppure libera un tavolo dalla Sala e riprova.",
  },
};

/**
 * Accomodare qualcuno dalla lista d'attesa non è «scegli un tavolo fra
 * settanta»: è «ecco i tavoli che possono accoglierli adesso». L'elenco arriva
 * dal motore di disponibilità, quindi non contiene tavoli occupati, fuori
 * servizio o troppo piccoli.
 */
export function SeatFromWaitlistDialog({
  entryId,
  guestName,
  partySize,
  open,
  onOpenChange,
  onSeated,
}: {
  entryId: string;
  guestName: string;
  partySize: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeated: () => void;
}) {
  const [risultato, setRisultato] = useState<TableSearch | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    setRisultato(null);
    setError(null);
    setSelected(null);

    fetch(`/api/waitlist/${entryId}/tables`)
      .then(async (res) => {
        if (annullato) return;
        if (!res.ok) {
          setError(await readApiError(res, "Non siamo riusciti a leggere i tavoli liberi."));
          setRisultato({ tables: [], reason: null });
          return;
        }
        const data: TableSearch = await res.json();
        setRisultato(data);
        if (data.tables.length > 0) setSelected(data.tables[0].tableId);
      })
      .catch(() => {
        if (!annullato) {
          setError("Non siamo riusciti a leggere i tavoli liberi.");
          setRisultato({ tables: [], reason: null });
        }
      });

    return () => {
      annullato = true;
    };
  }, [open, entryId]);

  async function accomoda() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/waitlist/${entryId}/seat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId: selected }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad accomodare l'ospite. Riprova."));
      return;
    }
    onOpenChange(false);
    onSeated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accomoda {guestName}</DialogTitle>
          <DialogDescription>
            {partySize} {partySize === 1 ? "persona" : "persone"} · questi tavoli sono liberi adesso e
            hanno posto.
          </DialogDescription>
        </DialogHeader>

        {risultato === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cerco i tavoli liberi…
          </div>
        ) : risultato.tables.length === 0 ? (
          <EmptyState
            icon={Users}
            title={risultato.reason ? MOTIVO[risultato.reason].titolo : "Nessun tavolo disponibile"}
            compact
          >
            {risultato.reason
              ? MOTIVO[risultato.reason].spiegazione
              : `Nessun tavolo attivo può accogliere ${partySize} ${partySize === 1 ? "persona" : "persone"} in questo momento.`}
          </EmptyState>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {risultato.tables.map((t) => (
              <li key={t.tableId}>
                <button
                  type="button"
                  onClick={() => setSelected(t.tableId)}
                  aria-pressed={selected === t.tableId}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors",
                    selected === t.tableId
                      ? "border-cream bg-current/10"
                      : "border-border hover:bg-current/5",
                  )}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {t.roomName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {t.roomName}
                      </span>
                    )}
                    <span>{t.seats} posti</span>
                    {t.matchesPreference && (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs">
                        sala richiesta
                      </span>
                    )}
                  </span>
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
          <Button
            type="button"
            variant="accent"
            disabled={!selected || submitting}
            onClick={accomoda}
          >
            {submitting ? "Accomodo…" : "Accomoda qui"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
