"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Slot = {
  startsAt: string;
  label: string;
  available: boolean;
  seatsLeft: number | null;
};

type ShiftSlots = { shiftId: string; name: string; slots: Slot[] };

type DayAvailability = {
  date: string;
  timezone: string;
  closed: boolean;
  shifts: ShiftSlots[];
};

interface SlotPickerProps {
  venueId: string;
  /** Data civile del locale, formato AAAA-MM-GG. */
  date: string;
  partySize: number;
  /** Istante ISO dell'orario scelto. */
  value: string | null;
  onChange: (startsAt: string | null) => void;
}

/**
 * Mostra gli orari che il locale può davvero accettare, raggruppati per servizio.
 *
 * Gli orari arrivano dal server come istanti assoluti e vengono rimandati indietro
 * identici: chi prenota da un altro fuso orario ottiene l'ora che ha letto, non
 * quella tradotta dal proprio browser.
 *
 * Gli orari al completo restano visibili ma disattivati: dire "quello non si può"
 * è più utile che far sparire la riga senza spiegazioni.
 */
export function SlotPicker({ venueId, date, partySize, value, onChange }: SlotPickerProps) {
  const [data, setData] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) {
      setData(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ venue: venueId, date, partySize: String(partySize) });

    fetch(`/api/public/availability?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Impossibile caricare gli orari.");
        return body as DayAvailability;
      })
      .then((body) => {
        setData(body);

        // Se l'orario scelto non è più fra quelli proponibili — cambiata data o
        // numero di persone — la selezione va annullata invece di restare appesa.
        const stillThere = body.shifts.some((s) => s.slots.some((x) => x.startsAt === value && x.available));
        if (value && !stillThere) onChange(null);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Impossibile caricare gli orari.");
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // `value` e `onChange` sono deliberatamente fuori: la ricarica dipende solo da
    // locale, data e coperti, altrimenti scegliere un orario rifarebbe la chiamata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, date, partySize]);

  if (!date) {
    return <p className="text-sm text-muted-foreground">Scegli prima una data.</p>;
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cerco gli orari liberi…
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!data || data.closed || data.shifts.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {data?.closed
            ? "Il locale è chiuso in questa data. Prova con un altro giorno."
            : "Per questa data non ci sono più orari disponibili. Prova con un altro giorno."}
        </span>
      </div>
    );
  }

  const nothingFree = data.shifts.every((s) => s.slots.every((x) => !x.available));

  return (
    <div className="space-y-4">
      {nothingFree && (
        <p className="text-sm text-muted-foreground">
          Per {partySize} {partySize === 1 ? "persona" : "persone"} non c&apos;è posto in questa data.
          Prova a cambiare giorno o a ridurre il numero di persone.
        </p>
      )}

      {data.shifts.map((shift) => (
        <fieldset key={shift.shiftId} className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {shift.name}
          </legend>

          <div className="flex flex-wrap gap-2">
            {shift.slots.map((slot) => {
              const selected = slot.startsAt === value;

              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  disabled={!slot.available}
                  aria-pressed={selected}
                  aria-label={
                    slot.available
                      ? `Ore ${slot.label}`
                      : `Ore ${slot.label}, al completo`
                  }
                  onClick={() => onChange(slot.startsAt)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    selected
                      ? "border-transparent bg-accent text-accent-foreground"
                      : "border-border text-foreground hover:bg-secondary",
                    !slot.available && "cursor-not-allowed border-dashed text-muted-foreground opacity-50 hover:bg-transparent",
                  )}
                  title={slot.available ? undefined : "Al completo"}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
