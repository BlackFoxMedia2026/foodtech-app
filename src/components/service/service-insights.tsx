"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightSeverity, ServiceInsight } from "@/server/service-intelligence";

/**
 * Come si introduce l'impatto.
 *
 * Cambia con la gravità perché la stessa frase non va bene per tutti: «se
 * resta così» davanti a un'opportunità la trasformerebbe in una minaccia, e
 * «se agisci adesso» davanti a una collisione suonerebbe come un consiglio
 * facoltativo.
 */
const PREFISSO: Record<InsightSeverity, string> = {
  warning: "Se resta così:",
  opportunity: "Se agisci adesso:",
  info: "Effetto:",
};

const STILE: Record<InsightSeverity, { icona: typeof Info; classe: string; icona_classe: string }> = {
  warning: { icona: AlertTriangle, classe: "border-accent/60", icona_classe: "text-accent" },
  opportunity: { icona: Sparkles, classe: "border-sage/60", icona_classe: "text-sage" },
  info: { icona: Info, classe: "border-border", icona_classe: "text-muted-foreground" },
};

/**
 * Gli avvisi del servizio.
 *
 * Non sono notifiche: sono cose che stanno per andare storte, con il posto
 * dove andare a sistemarle. Per questo ognuno ha un'azione, e per questo sono
 * pochi — tre in Panoramica, tutti nel Servizio. Un elenco di quindici avvisi
 * non lo legge nessuno, e chi non li legge non si accorge dei due che
 * contavano.
 */
export function ServiceInsights({
  insights,
  compact = false,
}: {
  insights: ServiceInsight[];
  compact?: boolean;
}) {
  if (insights.length === 0) {
    return compact ? null : (
      <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Nessun problema in vista: arrivi distribuiti, tavoli che si liberano in tempo, nessuno che
        aspetta senza motivo.
      </p>
    );
  }

  return (
    <ul className={cn("grid gap-2", !compact && "lg:grid-cols-2")}>
      {insights.map((i) => {
        const stile = STILE[i.severity];
        const Icona = stile.icona;
        return (
          <li key={i.id} className={cn("surface rounded-md border p-3", stile.classe)}>
            <div className="flex items-start gap-2.5">
              <Icona className={cn("mt-0.5 h-4 w-4 shrink-0", stile.icona_classe)} aria-hidden="true" />
              <div className="min-w-0">
                {/*
                  Le quattro parti, nell'ordine in cui servono: **problema**
                  (il titolo), **motivo** (il fatto misurato), **impatto**
                  (cosa cambia se nessuno fa niente) e **azione** (dove si
                  va). L'impatto è la riga che decide se vale la pena
                  alzarsi, e per questo non è grigia come il motivo.
                */}
                <p className="font-medium leading-snug">{i.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{i.motivo}</p>
                <p className="mt-1.5 text-sm leading-relaxed">
                  <span className={cn("font-medium", stile.icona_classe)}>{PREFISSO[i.severity]}</span>{" "}
                  {i.impatto}
                </p>
                {i.action && (
                  <Link
                    href={i.action.href}
                    className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {i.action.label}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
