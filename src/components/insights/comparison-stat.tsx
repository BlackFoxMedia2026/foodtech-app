import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeDelta } from "@/lib/period-delta";

interface ComparisonStatProps {
  label: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
  higherIsBetter?: boolean;
  kind?: "count" | "rate";
  /**
   * Perche' questo valore non si può dire.
   *
   * Serve alle **percentuali**: su pochi casi dicono più di quello che sanno,
   * e su zero casi non dicono niente. Passando questo, il riquadro mostra il
   * motivo invece del numero — e non mostra un confronto, perché variare da
   * una percentuale inventata a un'altra non è una variazione.
   */
  nonDisponibile?: string;
  /**
   * Sotto questo valore, il periodo precedente non regge un confronto.
   *
   * `computeDelta` si difende già dallo zero, ma non dall'uno: un piatto
   * passato da 1 a 134 porzioni produce «+13300%», che è aritmeticamente
   * esatto e non significa niente — nel periodo prima quel piatto non si
   * vendeva, punto. È la stessa regola che il menu engineering applica alle
   * classifiche: sotto un minimo di vendite il dato non dice niente.
   *
   * Il valore corrente resta scritto — è misurato, e serve: sparisce solo la
   * freccia, e la didascalia dice qual era il numero di prima.
   */
  minPrecedente?: number;
}

export function ComparisonStat({
  label,
  current,
  previous,
  format,
  higherIsBetter = true,
  kind = "count",
  nonDisponibile,
  minPrecedente,
}: ComparisonStatProps) {
  const confrontabile = minPrecedente === undefined || previous >= minPrecedente;
  const delta = confrontabile
    ? computeDelta(current, previous, { higherIsBetter, kind })
    : ({ available: false } as const);
  const fmt = format ?? String;

  if (nonDisponibile) {
    return (
      <div className="rounded-md border p-3">
        <p className="t-etichetta">{label}</p>
        <p className="mt-1 text-display text-xl">—</p>
        <p className="text-xs text-muted-foreground">{nonDisponibile}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3">
      <p className="t-etichetta">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-display text-xl">{fmt(current)}</p>
        {delta.available && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              delta.value === 0 ? "text-muted-foreground" : delta.isGood ? "text-sage-strong" : "text-destructive-soft",
            )}
          >
            {delta.value === 0 ? (
              <Minus className="h-3 w-3" />
            ) : delta.value > 0 ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(delta.value)}
            {delta.kind === "rate" ? " pt" : "%"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {delta.available
          ? `vs ${fmt(previous)} periodo precedente`
          : confrontabile
            ? "Confronto non disponibile"
            : `Nel periodo precedente: ${fmt(previous)} — troppo poco per un confronto`}
      </p>
    </div>
  );
}
