"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type FreeTable = {
  tableId: string;
  label: string;
  seats: number;
  roomName: string | null;
};

type Ricerca = {
  tables: FreeTable[];
  reason: "venue_closed" | "shift_full" | "all_busy" | "no_table_that_big" | null;
};

const MOTIVO: Record<NonNullable<Ricerca["reason"]>, { titolo: string; spiegazione: string }> = {
  venue_closed: {
    titolo: "Il locale è chiuso a quest'ora",
    spiegazione:
      "Fuori dai turni di servizio non si può accomodare nessuno. Se il servizio è aperto, controlla i turni in Impostazioni.",
  },
  shift_full: {
    titolo: "Il turno è al completo",
    spiegazione:
      "I coperti di questo turno sono esauriti: non è un problema di tavoli. Metti la persona in lista d'attesa e accomodala appena un tavolo si libera.",
  },
  all_busy: {
    titolo: "Nessun tavolo libero adesso",
    spiegazione:
      "Tutti i tavoli abbastanza grandi sono occupati. Mettili in lista d'attesa: Tavolo ti avvisa appena uno si libera.",
  },
  no_table_that_big: {
    titolo: "Nessun tavolo di questa misura",
    spiegazione:
      "Non è che siano occupati: un tavolo così grande non c'è. Per un gruppo del genere si uniscono più tavoli, dalla scheda della prenotazione in Servizio.",
  },
};

/**
 * Accomodare un walk-in in tre tocchi: quante persone, quale tavolo, fatto.
 *
 * Prima bisognava aprire «nuova prenotazione» e compilare un form pensato per
 * chi prenota al telefono — nome, cognome, email, data, ora, durata, fonte —
 * con una persona in piedi davanti che aspetta. Qui il nome è l'ultimo campo
 * ed è facoltativo: un walk-in senza nome è normale.
 */
export function WalkInDialog({
  open,
  onOpenChange,
  onSeated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeated?: () => void;
}) {
  const router = useRouter();
  const [partySize, setPartySize] = useState(2);
  const [ricerca, setRicerca] = useState<Ricerca | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // I tavoli si aggiornano al cambio del numero di persone: sono i due dati
  // legati fra loro, e chiedere di premere "cerca" sarebbe un tocco in più.
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

  async function accomoda() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/walk-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partySize, tableId: selected, guestName: guestName.trim() || null }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad accomodare il walk-in. Riprova."));
      return;
    }

    setGuestName("");
    setPartySize(2);
    onOpenChange(false);
    onSeated ? onSeated() : router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accomoda un walk-in</DialogTitle>
          <DialogDescription>Quante persone sono e dove li mettiamo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="wi-party">Persone</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Una persona in meno"
                onClick={() => setPartySize((n) => Math.max(1, n - 1))}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Input
                id="wi-party"
                type="number"
                min={1}
                max={50}
                value={partySize}
                onChange={(e) => setPartySize(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                className="w-20 text-center text-lg"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Una persona in più"
                onClick={() => setPartySize((n) => Math.min(50, n + 1))}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>

              <div className="ml-2 flex flex-wrap gap-1">
                {[2, 4, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPartySize(n)}
                    aria-pressed={partySize === n}
                    className={cn(
                      "min-h-[36px] rounded-full px-3 text-sm transition-colors",
                      partySize === n
                        ? "bg-cream text-clay-ink"
                        : "bg-current/10 text-muted-foreground hover:bg-current/15",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tavolo</Label>
            {ricerca === null ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Cerco i tavoli liberi…
              </div>
            ) : ricerca.tables.length === 0 ? (
              <EmptyState
                icon={Users}
                compact
                title={ricerca.reason ? MOTIVO[ricerca.reason].titolo : "Nessun tavolo disponibile"}
              >
                {ricerca.reason ? MOTIVO[ricerca.reason].spiegazione : null}
              </EmptyState>
            ) : (
              <ul className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {ricerca.tables.map((t) => (
                  <li key={t.tableId}>
                    <button
                      type="button"
                      onClick={() => setSelected(t.tableId)}
                      aria-pressed={selected === t.tableId}
                      className={cn(
                        "flex min-h-[68px] w-full flex-col items-start justify-center rounded-md border px-3 py-2 text-left transition-colors",
                        selected === t.tableId
                          ? "border-cream bg-current/10"
                          : "border-border hover:bg-current/5",
                      )}
                    >
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.seats} posti</span>
                      {t.roomName && (
                        <span className="flex w-full items-center gap-1 t-nota">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{t.roomName}</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wi-name">Nome (se lo sai)</Label>
            <Input
              id="wi-name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Puoi lasciarlo vuoto"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button type="button" variant="accent" disabled={!selected || submitting} onClick={accomoda}>
            {submitting ? "Accomodo…" : "Accomoda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
