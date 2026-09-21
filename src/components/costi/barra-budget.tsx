import { cn } from "@/lib/utils";

/**
 * Il consumo del budget, in una riga.
 *
 * Due letture in un colpo: **quanto** è stato speso, e **dove cade** rispetto
 * alle soglie. Le tacche di avviso e di criticità sono segnate sulla barra
 * invece che scritte sotto: così «40,1%» non è un numero astratto, è una
 * posizione — e si vede a colpo d'occhio che manca ancora parecchio alla
 * prima tacca.
 *
 * Il segmento chiaro in coda è l'**impegnato**: soldi promessi a campagne
 * programmate, non ancora spesi. Sommarlo allo speso direbbe che abbiamo già
 * pagato qualcosa che non è ancora partito; ometterlo mostrerebbe un residuo
 * che in realtà è già prenotato. È lo stesso ragionamento — e lo stesso
 * linguaggio visivo — della `BarraConsumo` degli invii.
 */
export function BarraBudget({
  spesoCents,
  impegnatoCents,
  budgetCents,
  warningPct,
  criticalPct,
  className,
}: {
  spesoCents: number;
  impegnatoCents: number;
  budgetCents: number;
  warningPct: number;
  criticalPct: number;
  className?: string;
}) {
  const quota = (n: number) => (budgetCents > 0 ? Math.min(100, (n / budgetCents) * 100) : 0);
  const speso = quota(spesoCents);
  const impegnato = Math.max(0, Math.min(100 - speso, quota(impegnatoCents)));

  /* Il colore dello speso segue la soglia in cui cade: sotto avviso è il verde
     del prodotto, oltre è l'oro, oltre ancora la terracotta piena. Nessun
     colore nuovo — sono le stesse tinte dei badge di stato. */
  const percentuale = budgetCents > 0 ? (spesoCents / budgetCents) * 100 : 0;
  const tinta =
    percentuale >= 100
      ? "bg-destructive"
      : percentuale >= criticalPct
        ? "bg-accent"
        : percentuale >= warningPct
          ? "bg-accent/70"
          : "bg-sage-strong";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="relative flex h-3 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${(spesoCents / 100).toFixed(2)} euro spesi su ${(budgetCents / 100).toFixed(2)} di budget`}
      >
        <span className={cn("h-full transition-all", tinta)} style={{ width: `${speso}%` }} />
        <span className={cn("h-full opacity-35 transition-all", tinta)} style={{ width: `${impegnato}%` }} />

        {/* Le tacche: dove scattano avviso e criticità. */}
        <span className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${warningPct}%` }} aria-hidden />
        <span className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${criticalPct}%` }} aria-hidden />
      </div>
    </div>
  );
}
