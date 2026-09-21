import { db } from "@/lib/db";
import { ETICHETTA_STATO, type StatoCosto } from "@/lib/costi-infrastruttura";
import { logEvento } from "@/lib/observability";
import type { StatoCostiCliente } from "./periodo";

/**
 * Gli avvisi che leggiamo noi, non il cliente.
 *
 * ## Uno solo per soglia, per ciclo, per cliente
 *
 * Il cron gira ogni venti minuti. Senza una difesa, un cliente fermo al 92%
 * genererebbe settantadue avvisi al giorno, e il settantaduesimo non lo
 * leggerebbe più nessuno — che è il modo in cui un sistema di allerta smette
 * di funzionare senza rompersi. La difesa è il vincolo unico su (locale,
 * ciclo, tipo): la seconda scrittura semplicemente non avviene.
 *
 * ## Quello che è successo resta successo
 *
 * Se il budget viene alzato e il cliente torna sotto soglia, l'avviso **non**
 * si cancella. Ha raggiunto il 90% con il tetto di allora, e quello è un fatto
 * del mese di settembre: cancellarlo vorrebbe dire che a fine trimestre non
 * sapremmo più quali clienti sono andati vicini al limite, che è esattamente
 * la domanda a cui questo archivio deve rispondere.
 */

export type TipoAvviso = "BUDGET_WARNING" | "BUDGET_CRITICAL" | "BUDGET_LIMIT" | "FORECAST_OVERRUN";

const PER_STATO: Partial<Record<StatoCosto, TipoAvviso>> = {
  ATTENZIONE: "BUDGET_WARNING",
  CRITICO: "BUDGET_CRITICAL",
  LIMITE: "BUDGET_LIMIT",
};

function euro(centesimi: number | null): string {
  if (centesimi === null) return "—";
  return `€${(centesimi / 100).toFixed(2)}`;
}

/**
 * Crea gli avvisi mancanti per lo stato attuale di un cliente.
 *
 * Restituisce quanti ne ha creati davvero: zero è il caso normale, e il
 * numero serve al cron per dire cosa ha fatto senza dover rileggere niente.
 *
 * Le soglie attraversate si annunciano **tutte**, non solo l'ultima: un
 * cliente che passa dal 70% al 95% in una sola campagna ha attraversato anche
 * il 75%, e quell'avviso è quello che qualcuno avrebbe voluto vedere prima.
 */
export async function generaAvvisi(
  stato: StatoCostiCliente,
  nomeLocale: string,
): Promise<number> {
  const daCreare: {
    kind: TipoAvviso;
    level: string;
    title: string;
    body: string;
  }[] = [];

  const soglieAttraversate: { pct: number; kind: TipoAvviso; level: StatoCosto }[] = [
    { pct: stato.soglie.warningPct, kind: "BUDGET_WARNING", level: "ATTENZIONE" },
    { pct: stato.soglie.criticalPct, kind: "BUDGET_CRITICAL", level: "CRITICO" },
    { pct: stato.soglie.hardLimitPct, kind: "BUDGET_LIMIT", level: "LIMITE" },
  ];

  if (stato.percentuale !== null) {
    for (const s of soglieAttraversate) {
      if (stato.percentuale >= s.pct) {
        daCreare.push({
          kind: s.kind,
          level: s.level,
          title: `${nomeLocale} ha raggiunto il ${s.pct}% del budget di infrastruttura.`,
          body: `Speso ${euro(stato.amountCents)} su ${euro(stato.budgetCents)} nel ciclo ${stato.yearMonth}. Stato: ${ETICHETTA_STATO[s.level]}.`,
        });
      }
    }
  }

  /*
    La previsione avvisa e non ferma.

    Si annuncia solo quando lo stato di oggi è ancora tranquillo: dire «potrebbe
    superare il budget» a un cliente che l'ha già superato è rumore, e il posto
    di quell'avviso è già occupato da uno più grave.
  */
  if (stato.previsioneOltreBudget && stato.previsioneAttendibile && stato.stato === "NORMALE") {
    daCreare.push({
      kind: "FORECAST_OVERRUN",
      level: "ATTENZIONE",
      title: `${nomeLocale} potrebbe superare il budget entro fine ciclo.`,
      body: `Al ritmo attuale arriverebbe a ${euro(stato.previsioneCents)} su un budget di ${euro(stato.budgetCents)}. Oggi è a ${euro(stato.amountCents)}.`,
    });
  }

  if (daCreare.length === 0) return 0;

  const esito = await db.platformAlert.createMany({
    data: daCreare.map((a) => ({
      venueId: stato.venueId,
      yearMonth: stato.yearMonth,
      kind: a.kind,
      level: a.level,
      title: a.title.slice(0, 160),
      body: a.body.slice(0, 500),
      meta: {
        amountCents: stato.amountCents,
        budgetCents: stato.budgetCents,
        forecastCents: stato.previsioneCents,
        percentuale: stato.percentuale,
      },
    })),
    // La difesa contro il cron che ripassa fra venti minuti.
    skipDuplicates: true,
  });

  if (esito.count > 0) {
    logEvento("costi.avvisi.creati", {
      venueId: stato.venueId,
      ciclo: stato.yearMonth,
      quanti: esito.count,
    });
  }
  return esito.count;
}

/** Gli avvisi aperti, per il pannello di piattaforma. */
export async function avvisiAperti(quanti = 50) {
  return db.platformAlert.findMany({
    where: { readAt: null },
    orderBy: { createdAt: "desc" },
    take: quanti,
    include: { venue: { select: { name: true } } },
  });
}

export async function segnaLetto(id: string) {
  return db.platformAlert.update({ where: { id }, data: { readAt: new Date() } });
}
