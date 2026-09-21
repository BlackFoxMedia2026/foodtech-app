import { db } from "@/lib/db";
import { cicloDi } from "@/lib/dem-quota";
import { etichetteDi, type EtichettaStato } from "@/lib/stati-costo";
import type { StatoCosto } from "@/lib/costi-infrastruttura";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { periodoCorrente } from "@/server/dem/consumo";
import { dettaglioPerServizio, spesaGiornaliera, STATI_A_COSTO } from "./ledger";
import { giorniDelCiclo, storicoCicli } from "./periodo";

/**
 * Tutto quello che serve alla pagina di un cliente, letto e non ricalcolato.
 *
 * La regola della fase 3: qui non nasce nessun numero economico nuovo. Il
 * costo, lo stato e la previsione li ha già scritti `ricalcolaPeriodo`; questo
 * modulo li rilegge, li affianca a quello che il Super Admin deve vedere
 * accanto — campagne, avvisi, autorizzazioni — e li consegna alla pagina.
 *
 * L'unica eccezione dichiarata è il **trend**: si calcola qui perché è una
 * lettura del ledger e non una regola economica, e perché si mostra solo se
 * c'è abbastanza storia per non inventarlo.
 */

export type DettaglioCosti = {
  venueId: string;
  locale: string;
  piano: string;
  ciclo: string;
  periodStart: Date;
  periodEnd: Date;
  aggiornatoIl: Date;

  stato: StatoCosto;
  etichette: EtichettaStato[];
  calcolabile: boolean;
  motivoNonCalcolabile: "SENZA_CAMBIO" | "SENZA_LISTINO" | null;

  emailUsati: number;
  emailRiservati: number;
  emailLimite: number;

  /** Il costo, nella valuta del fornitore e nella nostra. */
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number | null;
  exchangeRateAt: Date | null;
  amountCents: number | null;
  reservedCents: number;
  billingCurrency: string;

  /** Budget di piano, aumento autorizzato, budget effettivo. */
  budgetBaseCents: number | null;
  overrideBudgetCents: number;
  budgetCents: number | null;
  residuoCents: number | null;
  percentuale: number | null;

  soglie: { warningPct: number; criticalPct: number; hardLimitPct: number };
  allowOverage: boolean;
  inviiFermi: boolean;
  motivoSospensione: string | null;

  previsioneCents: number | null;
  previsioneAttendibile: boolean;
  mediaGiornalieraCents: number | null;
  giorniTrascorsi: number;
  giorniNelCiclo: number;
  /** In percentuale rispetto alla settimana prima. `null` = storia insufficiente. */
  trendPct: number | null;

  serie: { giorno: string; cumulatoCents: number | null }[];
};

export async function dettaglioCosti(venueId: string, adesso = new Date()): Promise<DettaglioCosti | null> {
  const sub = await abbonamentoDi(venueId, adesso);
  const ciclo = cicloDi(sub.currentPeriodStart);

  const [periodo, invii, venue, overrides] = await Promise.all([
    db.costPeriod.findUnique({ where: { venueId_yearMonth: { venueId, yearMonth: ciclo } } }),
    periodoCorrente(venueId, adesso),
    db.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
    db.costOverride.findMany({ where: { venueId, yearMonth: ciclo, kind: "BUDGET" } }),
  ]);
  if (!venue) return null;

  const amountCents = periodo?.amountCents ?? null;
  const originalAmount = Number(periodo?.originalAmount ?? 0);
  const cambio = periodo?.exchangeRate ? Number(periodo.exchangeRate) : null;

  /*
    Perché il costo non si sa calcolare, quando non si sa.

    La distinzione serve a chi deve rimediare: «manca il cambio» si risolve
    registrando un tasso, «manca il listino» aggiungendo un prezzo. Un unico
    «configurazione incompleta» manderebbe a cercare in due posti.
  */
  const calcolabile = amountCents !== null || originalAmount === 0;
  const motivoNonCalcolabile = calcolabile ? null : cambio === null ? "SENZA_CAMBIO" : "SENZA_LISTINO";

  const budgetCents = periodo?.budgetCents ?? null;
  const overrideBudgetCents = overrides.reduce((s, o) => s + Math.max(0, o.newValue - o.oldValue), 0);
  const budgetBaseCents = budgetCents === null ? null : budgetCents - overrideBudgetCents;

  const percentuale =
    budgetCents && budgetCents > 0 && amountCents !== null
      ? Math.round((amountCents / budgetCents) * 1000) / 10
      : null;

  const giorni = giorniDelCiclo(sub.currentPeriodStart, sub.currentPeriodEnd, adesso);
  const perGiorno = await spesaGiornaliera(venueId, ciclo);

  /* Il cumulativo per il grafico: in centesimi, e `null` dove non sappiamo
     convertire — una linea che scende a zero direbbe che quel giorno non è
     costato niente. */
  let cumulato = 0;
  const serie = perGiorno.map((g) => {
    cumulato += g.costo;
    return {
      giorno: g.giorno,
      cumulatoCents: cambio === null ? null : Math.round(cumulato * cambio * 100),
    };
  });

  const previsioneOltreBudget =
    budgetCents !== null && periodo?.forecastCents != null && periodo.forecastCents > budgetCents;

  const inviiFermi = sub.sendingPausedAt !== null || (periodo?.stato === "LIMITE" && !(periodo?.allowOverage ?? false));

  return {
    venueId,
    locale: venue.name,
    piano: sub.plan.name,
    ciclo,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    aggiornatoIl: periodo?.updatedAt ?? new Date(0),

    stato: (periodo?.stato ?? "NORMALE") as StatoCosto,
    etichette: etichetteDi({
      stato: (periodo?.stato ?? "NORMALE") as StatoCosto,
      inviiFermi,
      previsioneOltreBudget: !!previsioneOltreBudget,
      previsioneAttendibile: periodo?.forecastCents != null,
      overrideAttivo: overrides.length > 0,
      calcolabile,
    }),
    calcolabile,
    motivoNonCalcolabile,

    emailUsati: invii.periodo.used,
    emailRiservati: invii.periodo.reserved,
    emailLimite: invii.limite,

    originalAmount,
    originalCurrency: periodo?.originalCurrency ?? "USD",
    exchangeRate: cambio,
    exchangeRateAt: periodo?.exchangeRateAt ?? null,
    amountCents,
    reservedCents: periodo?.reservedCents ?? 0,
    billingCurrency: periodo?.billingCurrency ?? "EUR",

    budgetBaseCents,
    overrideBudgetCents,
    budgetCents,
    residuoCents: budgetCents !== null && amountCents !== null ? budgetCents - amountCents : null,
    percentuale,

    soglie: {
      warningPct: periodo?.warningPct ?? 75,
      criticalPct: periodo?.criticalPct ?? 90,
      hardLimitPct: periodo?.hardLimitPct ?? 100,
    },
    allowOverage: periodo?.allowOverage ?? false,
    inviiFermi,
    motivoSospensione: sub.sendingPausedReason,

    previsioneCents: periodo?.forecastCents ?? null,
    previsioneAttendibile: giorni.trascorsi >= 3,
    mediaGiornalieraCents: amountCents !== null ? Math.round(amountCents / giorni.trascorsi) : null,
    giorniTrascorsi: giorni.trascorsi,
    giorniNelCiclo: giorni.totali,
    trendPct: trend(perGiorno, cambio),
    serie,
  };
}

/**
 * Quanto sta accelerando la spesa, rispetto alla settimana prima.
 *
 * `null` quando non c'è abbastanza storia — meno di due settimane di consumi —
 * o quando la settimana precedente è a zero: «+∞%» non è un'informazione. È la
 * richiesta di §11: se il trend non si può calcolare **non si inventa**, e la
 * riga semplicemente non compare.
 */
function trend(perGiorno: { giorno: string; costo: number }[], cambio: number | null): number | null {
  if (cambio === null || perGiorno.length < 14) return null;
  const ultimi = perGiorno.slice(-7).reduce((s, g) => s + g.costo, 0);
  const precedenti = perGiorno.slice(-14, -7).reduce((s, g) => s + g.costo, 0);
  if (precedenti <= 0) return null;
  return Math.round(((ultimi - precedenti) / precedenti) * 100);
}

export type RigaServizio = {
  service: string;
  quantita: number;
  unit: string;
  stimatoCents: number | null;
  realeCents: number | null;
  riconciliato: boolean;
};

/**
 * Il dettaglio per servizio, con stimato e reale affiancati.
 *
 * Il costo reale resta vuoto finché la riconciliazione non esiste (è fase 4):
 * la colonna c'è già perché il giorno che arriverà non dovrà cambiare né la
 * pagina né la forma dei dati, e perché una colonna «stimato» senza il suo
 * contraltare fa dimenticare che è una stima.
 */
export async function serviziDelCiclo(
  venueId: string,
  ciclo: string,
  cambio: number | null,
): Promise<RigaServizio[]> {
  const righe = await dettaglioPerServizio(venueId, ciclo);
  const reali = await db.usageEvent.groupBy({
    by: ["service"],
    where: { venueId, yearMonth: ciclo, status: { in: STATI_A_COSTO }, actualCost: { not: null } },
    _sum: { actualCost: true },
  });
  const perServizio = new Map(reali.map((r) => [r.service, Number(r._sum.actualCost ?? 0)]));

  return righe.map((r) => {
    const reale = perServizio.get(r.service) ?? null;
    return {
      service: r.service,
      quantita: r.quantita,
      unit: r.unit,
      stimatoCents: cambio === null ? null : Math.round(r.costo * cambio * 100),
      realeCents: reale === null || cambio === null ? null : Math.round(reale * cambio * 100),
      riconciliato: reale !== null,
    };
  });
}

export type CampagnaCosto = {
  id: string;
  nome: string;
  stato: string;
  destinatari: number;
  inviate: number;
  riservatoCents: number;
  costoCents: number | null;
  quando: Date | null;
};

/**
 * Le campagne che hanno consumato — o stanno impegnando — budget in un ciclo.
 *
 * Due interrogazioni e non una per campagna: le campagne del ciclo, e i loro
 * costi raggruppati in un colpo solo.
 */
export async function campagneDelCiclo(
  venueId: string,
  ciclo: string,
  cambio: number | null,
): Promise<CampagnaCosto[]> {
  const campagne = await db.campaign.findMany({
    where: { venueId, OR: [{ usagePeriod: ciclo }, { usageEvents: { some: { yearMonth: ciclo } } }] },
    select: {
      id: true,
      name: true,
      status: true,
      recipientsCount: true,
      sentCount: true,
      reservedCostCents: true,
      sentAt: true,
      scheduledAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  if (campagne.length === 0) return [];

  const costi = await db.usageEvent.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: campagne.map((c) => c.id) }, status: { in: STATI_A_COSTO } },
    _sum: { estimatedCost: true },
  });
  const perCampagna = new Map(costi.map((c) => [c.campaignId, Number(c._sum.estimatedCost ?? 0)]));

  return campagne.map((c) => {
    const costo = perCampagna.get(c.id) ?? 0;
    return {
      id: c.id,
      nome: c.name,
      stato: c.status,
      destinatari: c.recipientsCount ?? 0,
      inviate: c.sentCount ?? 0,
      riservatoCents: c.reservedCostCents,
      costoCents: cambio === null ? null : Math.round(costo * cambio * 100),
      quando: c.sentAt ?? c.scheduledAt ?? c.createdAt,
    };
  });
}

/** Gli avvisi di questo cliente, dal più recente. */
export async function avvisiDelCliente(venueId: string, quanti = 20) {
  return db.platformAlert.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    take: quanti,
  });
}

/** Lo storico mensile, per la linguetta «Storico». */
export async function storicoDelCliente(venueId: string) {
  const cicli = await storicoCicli(venueId, 12);
  const invii = await db.demUsagePeriod.findMany({
    where: { venueId, yearMonth: { in: cicli.map((c) => c.yearMonth) } },
    select: { yearMonth: true, used: true },
  });
  const override = await db.costOverride.groupBy({
    by: ["yearMonth"],
    where: { venueId, kind: "BUDGET" },
    _sum: { oldValue: true, newValue: true },
  });

  const perInvii = new Map(invii.map((i) => [i.yearMonth, i.used]));
  const perOverride = new Map(
    override.map((o) => [o.yearMonth, Number(o._sum.newValue ?? 0) - Number(o._sum.oldValue ?? 0)]),
  );

  return cicli.map((c) => ({
    ciclo: c.yearMonth,
    email: perInvii.get(c.yearMonth) ?? 0,
    costoCents: c.amountCents,
    budgetCents: c.budgetCents,
    previsioneCents: c.forecastCents,
    overrideCents: perOverride.get(c.yearMonth) ?? 0,
    stato: c.stato,
    inCorso: c.periodEnd.getTime() > Date.now(),
  }));
}
