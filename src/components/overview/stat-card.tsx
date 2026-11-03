import { cn } from "@/lib/utils";
import { TrattiSfumati } from "@/components/ui/tessera-kpi";

/**
 * Una tessera di numero per Report e Pagamenti.
 *
 * Dal 3 novembre 2026 ha **lo stesso disegno** della tessera della Panoramica
 * (`ui/tessera-kpi.tsx`): vetro, dischetto verde con l'icona a tratto
 * sfumato, etichetta in maiuscoletto, numero monospaziato. Prima qui c'erano
 * sei finiture a tinta piena (bronzo, pergamena, salvia, tre marroni) che
 * nessuna pagina usava più, e il numero stesso sembrava detto da un altro
 * prodotto rispetto alla Panoramica.
 *
 * `tone`, `fill` ed `emphasize` restano nella firma per non rompere chi li
 * passa, ma non cambiano più il materiale: la fascia è una sola. `tone="sage"`
 * accende ancora il numero in verde, `tone="accent"` nell'oro che si legge.
 */
export function StatCard({
  label,
  value,
  hint,
  trend,
  tone,
  icon: Icon,
  progressPct,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /**
   * Il confronto col periodo prima. La **freccia** viene dal segno di `value`
   * (dove è andato), il **colore** da `buono` (se è una buona notizia). Con
   * `value` a zero non si mostra freccia: non è andato da nessuna parte.
   */
  trend?: { value: number; buono?: boolean | null };
  tone?: "accent" | "cream" | "sage" | "brown-medium" | "brown-dark" | "brown-light";
  /** Non cambia più il materiale: vedi la nota in testa. */
  fill?: boolean;
  /** Non cambia più il materiale: vedi la nota in testa. */
  emphasize?: boolean;
  icon?: React.ComponentType<{ className?: string; stroke?: string }>;
  progressPct?: number;
  className?: string;
}) {
  return (
    <div className={cn("vetro card-notch flex items-start gap-3 p-4", className)}>
      {Icon && (
        <>
          <TrattiSfumati />
          <span className="vetro kpi-pastiglia hidden h-12 w-12 shrink-0 place-items-center rounded-full sm:grid">
            <Icon className="h-6 w-6" stroke="url(#trattoVetro)" />
          </span>
        </>
      )}
      <div className="min-w-0 flex-1">
        <p className="t-etichetta text-sm text-kpi-label-muted">{label}</p>
        <p
          className={cn(
            "mt-0.5 font-mono text-2xl leading-8 tabular-nums xl:text-3xl xl:leading-9",
            tone === "sage" ? "text-sage-strong" : tone === "accent" ? "text-accent-strong" : "text-foreground",
          )}
        >
          {value}
        </p>
        {typeof progressPct === "number" && (
          <div className="barra-binario mt-1.5 h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="barra-pieno h-full rounded-full bg-surface-brown-light"
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>
        )}
        {hint && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
        {trend && (
          <p
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 font-mono text-xs font-medium",
              trend.buono == null
                ? "text-muted-foreground"
                : trend.buono
                  ? "text-sage-strong"
                  : "text-destructive-soft",
            )}
          >
            {trend.value === 0 ? "invariato" : `${trend.value > 0 ? "▲" : "▼"} ${Math.abs(trend.value)}%`}
          </p>
        )}
      </div>
    </div>
  );
}
