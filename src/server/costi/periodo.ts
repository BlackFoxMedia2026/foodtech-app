import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  previsioneFineCiclo,
  statoDelBudget,
  convertiInCentesimi,
  type Soglie,
  type StatoCosto,
} from "@/lib/costi-infrastruttura";
import { abbonamentoDi, limiteDi } from "@/server/dem/abbonamento";
import { cicloDi } from "@/lib/dem-quota";
import { cambioCorrente } from "./cambio";
import { spesaGiornaliera, STATI_A_COSTO } from "./ledger";

/**
 * L'aggregato per cliente e ciclo: costo maturato, budget, stato, previsione.
 *
 * Esiste per una ragione pratica: una pagina che somma il ledger di un cliente
 * a ogni apertura diventa lenta esattamente quando il cliente diventa
 * importante. Qui il conto si fa una volta, si salva, e la pagina legge una
 * riga.
 *
 * ## Budget e soglie sono copiati, non letti
 *
 * Nascono dal piano e restano congelati nel ciclo. Cambiare il budget di un
 * piano il 20 del mese non deve riscrivere all'indietro lo stato di chi quel
 * budget l'ha quasi finito — e soprattutto non deve far sparire un avviso già
 * mandato, o farne comparire uno per una soglia che allora non esisteva.
 *
 * ## Il caso singolo
 *
 * Un `CostOverride` vince sul piano, per quel cliente e per quel ciclo solo.
 * È la risposta a «questo mese fategli spendere 60 invece di 40»: una riga con
 * un nome e una data accanto, non una colonna cambiata di nascosto.
 */

export const PROVIDER_AWS = "AWS";

export type StatoCostiCliente = {
  venueId: string;
  yearMonth: string;
  periodStart: Date;
  periodEnd: Date;
  /** Il costo nella valuta del fornitore, per non perdere il dato d'origine. */
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number | null;
  exchangeRateAt: Date | null;
  /** Il costo contabilizzato. `null` quando non conosciamo il cambio. */
  amountCents: number | null;
  billingCurrency: string;
  budgetCents: number | null;
  soglie: Soglie;
  allowOverage: boolean;
  percentuale: number | null;
  residuoCents: number | null;
  stato: StatoCosto;
  previsioneCents: number | null;
  previsioneAttendibile: boolean;
  /** La previsione sfora il budget, anche se oggi lo stato è tranquillo? */
  previsioneOltreBudget: boolean;
};

/** Il budget del ciclo: quello del piano, salvo un superamento autorizzato. */
export async function budgetEffettivo(
  venueId: string,
  yearMonth: string,
  budgetDelPiano: number | null,
): Promise<number | null> {
  const override = await db.costOverride.findFirst({
    where: { venueId, yearMonth, kind: "BUDGET" },
    orderBy: { createdAt: "desc" },
  });
  return override ? override.newValue : budgetDelPiano;
}

/**
 * Ricalcola il ciclo corrente di un cliente e lo salva.
 *
 * Si chiama dopo un invio e dal cron. Non è pensata per essere chiamata a ogni
 * caricamento di pagina: la pagina legge, questa scrive.
 */
export async function ricalcolaPeriodo(
  venueId: string,
  adesso = new Date(),
): Promise<StatoCostiCliente> {
  const sub = await abbonamentoDi(venueId, adesso);
  const yearMonth = cicloDi(sub.currentPeriodStart);

  /* Solo gli stati che fanno somma: un impegno non è una spesa, e un rifiuto
     non fatturato nemmeno. Senza questo filtro una campagna programmata e mai
     partita comparirebbe come costo. */
  const somma = await db.usageEvent.aggregate({
    where: { venueId, yearMonth, status: { in: STATI_A_COSTO } },
    _sum: { estimatedCost: true },
  });
  const originalAmount = Number(somma._sum.estimatedCost ?? 0);

  /* La valuta d'origine la dice il ledger, non una costante: il giorno che un
     fornitore fattura in euro, qui non cambia niente. */
  const primo = await db.usageEvent.findFirst({
    where: { venueId, yearMonth, status: { in: STATI_A_COSTO } },
    select: { currency: true },
  });
  const originalCurrency = primo?.currency ?? "USD";
  const billingCurrency = sub.plan.currency ?? "EUR";

  const cambio = await cambioCorrente(originalCurrency, billingCurrency);
  const amountCents = convertiInCentesimi(originalAmount, cambio?.tasso ?? null);

  const soglie: Soglie = {
    warningPct: sub.plan.warningPct,
    criticalPct: sub.plan.criticalPct,
    hardLimitPct: sub.plan.hardLimitPct,
  };
  const budgetCents = await budgetEffettivo(venueId, yearMonth, sub.plan.awsBudgetCents ?? null);

  const { stato, percentuale, residuoCents } = statoDelBudget(amountCents ?? 0, budgetCents, soglie);

  /* La previsione si fa sui centesimi contabilizzati: senza cambio non c'è
     previsione, perché una previsione in dollari confrontata con un budget in
     euro è il tipo di confronto che fa scattare un blocco sbagliato. */
  const giorni = giorniDelCiclo(sub.currentPeriodStart, sub.currentPeriodEnd, adesso);
  let previsioneCents: number | null = null;
  let previsioneAttendibile = false;

  if (amountCents !== null) {
    const perGiorno = await spesaGiornaliera(venueId, yearMonth);
    const ultimi = perGiorno
      .slice(-7)
      .map((g) => convertiInCentesimi(g.costo, cambio?.tasso ?? null) ?? 0);
    const p = previsioneFineCiclo({
      spesoCents: amountCents,
      giorniTrascorsi: giorni.trascorsi,
      giorniNelCiclo: giorni.totali,
      ultimiGiorniCents: ultimi,
    });
    previsioneCents = p.previsioneCents;
    previsioneAttendibile = p.attendibile;
  }

  const previsioneOltreBudget =
    budgetCents !== null && previsioneCents !== null && previsioneCents > budgetCents;

  await db.costPeriod.upsert({
    where: { venueId_yearMonth: { venueId, yearMonth } },
    create: {
      venueId,
      yearMonth,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      originalAmount: new Prisma.Decimal(originalAmount.toFixed(6)),
      originalCurrency,
      exchangeRate: cambio ? new Prisma.Decimal(cambio.tasso) : null,
      exchangeRateAt: cambio?.letoIl ?? null,
      amountCents,
      billingCurrency,
      budgetCents,
      warningPct: soglie.warningPct,
      criticalPct: soglie.criticalPct,
      hardLimitPct: soglie.hardLimitPct,
      allowOverage: sub.plan.allowOverage,
      forecastCents: previsioneCents,
      stato,
    },
    update: {
      originalAmount: new Prisma.Decimal(originalAmount.toFixed(6)),
      originalCurrency,
      exchangeRate: cambio ? new Prisma.Decimal(cambio.tasso) : null,
      exchangeRateAt: cambio?.letoIl ?? null,
      amountCents,
      budgetCents,
      forecastCents: previsioneCents,
      stato,
      periodEnd: sub.currentPeriodEnd,
    },
  });

  return {
    venueId,
    yearMonth,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    originalAmount,
    originalCurrency,
    exchangeRate: cambio?.tasso ?? null,
    exchangeRateAt: cambio?.letoIl ?? null,
    amountCents,
    billingCurrency,
    budgetCents,
    soglie,
    allowOverage: sub.plan.allowOverage,
    percentuale,
    residuoCents,
    stato,
    previsioneCents,
    previsioneAttendibile,
    previsioneOltreBudget,
  };
}

/**
 * I giorni del ciclo: quanti ne sono passati e quanti sono in tutto.
 *
 * Sul ciclo dell'abbonamento e non sul mese di calendario, perché
 * `currentPeriodStart` può già oggi non essere il primo del mese — e il giorno
 * che avremo cicli personalizzati (§23) qui non cambia niente.
 */
export function giorniDelCiclo(
  inizio: Date,
  fine: Date,
  adesso: Date,
): { trascorsi: number; totali: number } {
  const giorno = 86_400_000;
  const totali = Math.max(1, Math.round((fine.getTime() - inizio.getTime()) / giorno));
  const passati = Math.floor((adesso.getTime() - inizio.getTime()) / giorno) + 1;
  return { trascorsi: Math.min(Math.max(1, passati), totali), totali };
}

/** Lo stato salvato, senza ricalcolare: è quello che leggono le pagine. */
export async function statoSalvato(venueId: string, yearMonth: string) {
  return db.costPeriod.findUnique({ where: { venueId_yearMonth: { venueId, yearMonth } } });
}

/** Lo storico dei cicli, per la tabella mensile di §18. */
export async function storicoCicli(venueId: string, quanti = 12) {
  return db.costPeriod.findMany({
    where: { venueId },
    orderBy: { periodStart: "desc" },
    take: quanti,
  });
}
