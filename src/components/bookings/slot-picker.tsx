"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Slot = {
  startsAt: string;
  label: string;
  available: boolean;
  seatsLeft: number | null;
  /** Dentro il margine oltre la capienza dichiarata dal locale. */
  oltreCapienza?: boolean;
};

type ShiftSlots = { shiftId: string; name: string; slots: Slot[] };

type DayAvailability = {
  date: string;
  timezone: string;
  closed: boolean;
  shifts: ShiftSlots[];
  /** Perché mancano orari, quando a toglierli è la finestra del locale. */
  nota: string | null;
};

type GiornoLibero = {
  date: string;
  label: string;
  primoOrario: { startsAt: string; label: string };
};

interface SlotPickerProps {
  /** Presente solo dal widget pubblico: dallo staff il locale arriva dalla
   * sessione, e passarlo dal client sarebbe un modo di leggere la
   * disponibilità di un ristorante non proprio. */
  venueId?: string;
  /** Data civile del locale, formato AAAA-MM-GG. */
  date: string;
  partySize: number;
  /** Istante ISO dell'orario scelto. */
  value: string | null;
  onChange: (startsAt: string | null) => void;
  /**
   * Cosa fare quando il cliente accetta un altro giorno.
   *
   * Passandolo, davanti a una giornata piena compare la risposta alla sola
   * domanda che quella persona si sta facendo — «e allora quando?». Senza,
   * il selettore si comporta come prima: in sala quella domanda si risponde
   * guardando il calendario, non con un bottone.
   */
  onPickDay?: (date: string, startsAt: string) => void;
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
export function SlotPicker({ venueId, date, partySize, value, onChange, onPickDay }: SlotPickerProps) {
  /**
   * In sala si segna quello che è oltre la capienza; al cliente no.
   *
   * `venueId` arriva **solo** dal widget pubblico (dallo staff il locale viene
   * dalla sessione): è già il modo in cui questo componente sa da che parte
   * del banco si trova.
   */
  const segnaOltre = !venueId;
  const [data, setData] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternative, setAlternative] = useState<GiornoLibero[] | null>(null);

  useEffect(() => {
    if (!date) {
      setData(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAlternative(null);

    const params = new URLSearchParams({ date, partySize: String(partySize) });
    if (venueId) params.set("venue", venueId);
    const endpoint = venueId ? "/api/public/availability" : "/api/availability";

    fetch(`${endpoint}?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.message || body?.error || "Impossibile caricare gli orari.");
        return body as DayAvailability;
      })
      .then((body) => {
        setData(body);

        // Se l'orario scelto non è più fra quelli proponibili — cambiata data o
        // numero di persone — la selezione va annullata invece di restare appesa.
        const stillThere = body.shifts.some((s) => s.slots.some((x) => x.startsAt === value && x.available));
        if (value && !stillThere) onChange(null);

        // «E allora quando?» si chiede solo davanti a una giornata piena: chi
        // trova posto al primo colpo non paga il conto di una ricerca che non
        // gli serve.
        const nienteLibero = body.shifts.every((s) => s.slots.every((x) => !x.available));
        if (!onPickDay || !venueId || !nienteLibero) return;

        const q = new URLSearchParams({ venue: venueId, date, partySize: String(partySize) });
        fetch(`/api/public/availability/alternatives?${q}`, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((alt) => setAlternative(alt?.giorni ?? []))
          .catch(() => {
            /* Le alternative sono un aiuto: se non arrivano, la pagina resta
               quella di prima invece di mostrare un errore in più. */
          });
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
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {/* Se a togliere gli orari è stata la finestra del locale, si dice
                quello: «non ci sono orari» manderebbe via un cliente che al
                telefono un tavolo lo troverebbe. */}
            {data?.closed
              ? "Il locale è chiuso in questa data."
              : data?.nota
                ? data.nota
                : "Per questa data non ci sono più orari disponibili."}
          </span>
        </div>
        <Alternative giorni={alternative} onPickDay={onPickDay} />
      </div>
    );
  }

  const nothingFree = data.shifts.every((s) => s.slots.every((x) => !x.available));

  return (
    <div className="space-y-4">
      {nothingFree && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Per {partySize} {partySize === 1 ? "persona" : "persone"} non c&apos;è posto in questa data.
          </p>
          <Alternative giorni={alternative} onPickDay={onPickDay} />
        </div>
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
                    !slot.available
                      ? `Ore ${slot.label}, al completo`
                      : segnaOltre && slot.oltreCapienza
                        ? `Ore ${slot.label}, oltre la capienza dichiarata`
                        : `Ore ${slot.label}`
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
                  title={
                    !slot.available
                      ? "Al completo"
                      : segnaOltre && slot.oltreCapienza
                        ? "Oltre la capienza dichiarata: il locale accetta, ma questo posto c'è solo se qualcuno non viene"
                        : undefined
                  }
                >
                  {slot.label}
                  {/* Il pallino c'è solo in sala: al cliente non si racconta
                      come il locale gestisce la propria capienza. */}
                  {segnaOltre && slot.available && slot.oltreCapienza && (
                    <span className="ml-1 text-accent" aria-hidden="true">
                      •
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/**
 * «E allora quando?».
 *
 * È la sola domanda che una persona si fa davanti a un sabato pieno, e senza
 * una risposta chiude la pagina e cerca un altro ristorante. Con una risposta,
 * spesso sposta la cena di un giorno.
 *
 * Si mostrano i primi giorni con posto, non un calendario: tre proposte si
 * leggono, trenta caselle no. E se non c'è niente nelle prossime settimane, si
 * dice — invece di lasciare la domanda in sospeso.
 */
function Alternative({
  giorni,
  onPickDay,
}: {
  giorni: GiornoLibero[] | null;
  onPickDay?: (date: string, startsAt: string) => void;
}) {
  if (!onPickDay || giorni === null) return null;

  if (giorni.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nelle prossime tre settimane non troviamo posto per questo numero di persone. Chiamaci: a volte si
        libera qualcosa che qui non si vede.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Il primo posto libero</p>
      <div className="flex flex-wrap gap-2">
        {giorni.map((g) => (
          <button
            key={g.date}
            type="button"
            onClick={() => onPickDay(g.date, g.primoOrario.startsAt)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-secondary"
          >
            <span>
              {g.label} alle <strong>{g.primoOrario.label}</strong>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
