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

  /**
   * Gli urgenti pesano, gli altri no.
   *
   * Prima erano tutti riquadri identici: «Riccardo in ritardo di 48 minuti» e
   * «una prenotazione non è mai arrivata» — la prima è una telefonata da
   * fare adesso, la seconda è lavoro di chiusura — avevano lo stesso fondo,
   * lo stesso bordo e la stessa altezza. Cinque cartelli uguali si leggono
   * come nessun cartello, ed è quello che l'audit visivo ha misurato dando 4
   * a questa schermata.
   *
   * Adesso: **i warning per esteso e con il fondo**, tutto il resto in una
   * riga con il «perché» dietro un dettaglio che si apre. Nessuna delle
   * quattro parti si perde — problema, motivo, impatto e azione ci sono
   * ancora tutte — ma solo l'urgente occupa lo spazio di un urgente.
   */
  const urgenti = insights.filter((i) => i.severity === "warning");
  const altri = insights.filter((i) => i.severity !== "warning");

  return (
    <div className="space-y-2">
      <ul className={cn("grid gap-2", !compact && urgenti.length > 1 && "md:grid-cols-2")}>
      {urgenti.map((i) => {
        const stile = STILE[i.severity];
        const Icona = stile.icona;
        return (
          <li
            key={i.id}
            className={cn("surface rounded-md border p-2.5 lg:p-3", stile.classe, "bg-accent/[0.07]")}
          >
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

                {/*
                  Il motivo su schermo largo si legge; su un telefono da 390
                  px diventa tre righe, e con quattro ritardi sono quattro
                  schermate da scorrere prima di arrivare al lavoro. Su
                  telefono va dietro «perché»: **lo stesso testo**, non un
                  riassunto — e resta a un tocco, non a una schermata.
                */}
                <p className="mt-1 hidden text-sm leading-relaxed text-muted-foreground lg:block">
                  {i.motivo}
                </p>

                <p className="mt-1.5 text-sm leading-relaxed">
                  <span className={cn("font-medium", stile.icona_classe)}>{PREFISSO[i.severity]}</span>{" "}
                  {i.impatto}
                </p>

                <details className="mt-1 text-xs text-muted-foreground lg:hidden">
                  <summary className="cursor-pointer list-none underline-offset-4">perché</summary>
                  <p className="mt-1 leading-relaxed">{i.motivo}</p>
                </details>
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

      {altri.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden riquadro">
          {altri.map((i) => {
            const stile = STILE[i.severity];
            const Icona = stile.icona;
            return (
              <li key={i.id} className="px-3 py-2">
                <div className="flex items-start gap-2.5">
                  <Icona
                    className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", stile.icona_classe)}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-medium">{i.title}</span>{" "}
                      <span className="text-muted-foreground">— {i.impatto}</span>
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                      {/*
                        Il motivo non sparisce: si apre. `<details>` è nativo,
                        funziona senza JavaScript e con la tastiera, e non
                        aggiunge un componente al sistema per una riga.
                      */}
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer list-none underline-offset-4 hover:underline">
                          perché
                        </summary>
                        <p className="mt-1 leading-relaxed">{i.motivo}</p>
                      </details>
                      {i.action && (
                        <Link
                          href={i.action.href}
                          className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                        >
                          {i.action.label}
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
