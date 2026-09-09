"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { livelloAvviso, type LivelloAvviso } from "@/lib/livello-avviso";
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

const STILE: Record<
  InsightSeverity,
  { icona: typeof Info; classe: string; icona_classe: string; fondo: string }
> = {
  warning: {
    icona: AlertTriangle,
    classe: "border-accent/60",
    icona_classe: "text-accent-strong",
    fondo: "bg-accent/[0.07]",
  },
  /*
    L'occasione non si tinge come il problema.

    Prima il fondo era scritto a mano sulla card — `bg-accent/[0.07]` — perché
    la card era solo per i `warning`. Adesso ci arriva anche un'opportunità che
    conta adesso, e un tavolo libero da riempire con il colore di un allarme
    dice la cosa sbagliata: la salvia è il colore del «si può fare», ed è quello
    che il resto del prodotto usa già per le occasioni.
  */
  opportunity: {
    icona: Sparkles,
    classe: "border-sage/60",
    icona_classe: "text-sage-strong",
    fondo: "bg-sage/[0.07]",
  },
  info: {
    icona: Info,
    classe: "border-border",
    icona_classe: "text-muted-foreground",
    fondo: "",
  },
};

/**
 * Il **quando**, detto senza parole: una barra a sinistra.
 *
 * Piena per quello che si decide adesso, sottile per quello che lo diventerà
 * da solo, niente per il resto. Un'etichetta «ADESSO» direbbe la stessa cosa
 * occupando una riga, e in una schermata dove il titolo già dice «in ritardo
 * di 40 minuti» sarebbe la terza volta che si parla di tempo.
 */
const BARRA: Record<LivelloAvviso, string> = {
  adesso: "border-l-4",
  fra_poco: "border-l-2",
  guarda: "",
  sapere: "",
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
   * Chi pesa e chi no — e la domanda è **quando**, non «quanto è grave».
   *
   * Prima erano tutti riquadri identici: «Riccardo in ritardo di 48 minuti» e
   * «una prenotazione non è mai arrivata» — la prima è una telefonata da
   * fare adesso, la seconda è lavoro di chiusura — avevano lo stesso fondo,
   * lo stesso bordo e la stessa altezza. Cinque cartelli uguali si leggono
   * come nessun cartello, ed è quello che l'audit visivo ha misurato dando 4
   * a questa schermata.
   *
   * Poi la divisione era **per gravità**: i `warning` per esteso, tutto il
   * resto compatto. E per gravità «un tavolo libero e una famiglia che
   * aspetta» — un'occasione che dura cinque minuti e poi non c'è più —
   * finiva in una riga sottile sotto quattro ritardi di mezz'ora che si
   * recuperano con una telefonata.
   *
   * Adesso la divisione è **per quando conta**: sta per esteso quello che si
   * risolve adesso o nei prossimi quindici minuti, qualunque sia la gravità;
   * sta compatto quello che non cambia niente se lo leggi fra un'ora.
   * Nessuna delle quattro parti si perde — problema, motivo, impatto e azione
   * ci sono ancora tutte — ma solo quello che vale ora occupa lo spazio.
   */
  const subito = insights.filter((i) => {
    const l = livelloAvviso(i);
    return l === "adesso" || l === "fra_poco";
  });
  const altri = insights.filter((i) => !subito.includes(i));

  return (
    <div className="space-y-2">
      <ul className={cn("grid gap-2", !compact && subito.length > 1 && "md:grid-cols-2")}>
      {subito.map((i) => {
        const stile = STILE[i.severity];
        const Icona = stile.icona;
        const livello = livelloAvviso(i);
        return (
          <li
            key={i.id}
            className={cn(
              "surface rounded-md border p-2.5 lg:p-3",
              stile.classe,
              stile.fondo,
              BARRA[livello],
            )}
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
                  /*
                    Su quello che si decide adesso l'azione è un bersaglio, non
                    un link: chi legge questa card ha una mano occupata e
                    cinque secondi. Su «fra poco» resta un link — è la stessa
                    azione, ma non è ancora il momento di premerla.
                  */
                  <Link
                    href={i.action.href}
                    className={cn(
                      "tocco-comodo mt-2 inline-flex min-h-[36px] items-center gap-1 text-sm font-medium text-foreground",
                      livello === "adesso"
                        ? "rounded-md border border-current/25 bg-current/[0.06] px-2.5 hover:bg-current/10"
                        : "underline-offset-4 hover:underline",
                    )}
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
            // «Da sapere» non chiede niente: non porta nemmeno il grassetto.
            const soloContesto = livelloAvviso(i) === "sapere";
            return (
              <li key={i.id} className="px-3 py-2">
                <div className="flex items-start gap-2.5">
                  <Icona
                    className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", stile.icona_classe)}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm leading-snug", soloContesto && "text-muted-foreground")}>
                      <span className={soloContesto ? undefined : "font-medium"}>{i.title}</span>{" "}
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
