import { db } from "@/lib/db";
import { cicloDi } from "@/lib/dem-quota";
import { logEvento } from "@/lib/observability";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { assicuraPeriodoCosti } from "./riserva";
import { budgetEffettivo } from "./periodo";

/**
 * I superamenti autorizzati a mano dal Super Admin.
 *
 * ## Temporanei, e solo per il ciclo corrente
 *
 * Un override vale per **un** ciclo e poi sparisce da solo: il mese dopo il
 * cliente torna al budget del suo piano senza che nessuno debba ricordarsi di
 * togliere niente. È la differenza fra «questo mese fategli finire la
 * campagna» e «questo cliente da oggi costa di più», che è una decisione
 * commerciale e si prende cambiando il piano.
 *
 * Quella seconda strada esiste — si modifica `DemPlan` — ma non passa da qui,
 * e non deve: confonderle significa alzare per sempre un tetto che si voleva
 * alzare per una settimana.
 *
 * ## L'autorizzazione è il registro
 *
 * Ogni riga porta chi, quando, da quanto a quanto e perché. Non è un `AuditLog`
 * dell'organizzazione del cliente di proposito: questa è una decisione
 * economica **nostra**, e non deve comparire nel registro che il ristoratore
 * può leggere. Il suo audit racconta cosa succede nel suo locale; questo
 * racconta cosa decidiamo noi sui nostri costi.
 */

export type TipoOverride = "BUDGET" | "EMAILS";

export type EsitoOverride = {
  kind: TipoOverride;
  yearMonth: string;
  precedente: number;
  nuovo: number;
};

/**
 * Autorizza un superamento per il ciclo corrente.
 *
 * `delta` è un aumento: +2000 centesimi, +50.000 invii. Si esprime così e non
 * come valore assoluto perché è la domanda che si fa davvero davanti alla
 * schermata — «quanto gliene do in più» — e perché un valore assoluto scritto
 * male abbassa un tetto invece di alzarlo, fermando una campagna in corso.
 */
export async function autorizzaSuperamento(input: {
  venueId: string;
  kind: TipoOverride;
  delta: number;
  note?: string | null;
  actorEmail: string;
  adesso?: Date;
}): Promise<EsitoOverride> {
  const adesso = input.adesso ?? new Date();
  const sub = await abbonamentoDi(input.venueId, adesso);
  const yearMonth = cicloDi(sub.currentPeriodStart);

  if (!Number.isFinite(input.delta) || input.delta <= 0) {
    throw new Error("override_delta_non_valido");
  }

  if (input.kind === "BUDGET") {
    const { periodo } = await assicuraPeriodoCosti(input.venueId, adesso);
    const precedente = await budgetEffettivo(input.venueId, yearMonth, sub.plan.awsBudgetCents ?? null);

    /* Senza un budget di piano non c'è niente da superare: autorizzare un
       "+20 €" su un cliente senza tetto creerebbe un tetto dove non c'era, e
       da lì in poi quel cliente risulterebbe limitato a 20 €. */
    if (precedente === null) throw new Error("override_senza_budget");

    const nuovo = precedente + input.delta;
    await db.costOverride.create({
      data: {
        venueId: input.venueId,
        yearMonth,
        kind: "BUDGET",
        oldValue: precedente,
        newValue: nuovo,
        note: input.note?.slice(0, 300) ?? null,
        actorEmail: input.actorEmail,
      },
    });
    await db.costPeriod.update({ where: { id: periodo.id }, data: { budgetCents: nuovo } });

    logEvento("costi.override.budget", { venueId: input.venueId, yearMonth, da: precedente, a: nuovo });
    return { kind: "BUDGET", yearMonth, precedente, nuovo };
  }

  /*
    Gli invii: il tetto vero è `DemUsagePeriod.monthlyLimit`, la colonna su cui
    gira la riserva atomica. Alzare quella e basta significa che il freno
    esistente continua a funzionare senza sapere che c'è stato un override — e
    non deve saperlo: deve solo trovare un numero più grande.
  */
  const periodoInvii = await db.demUsagePeriod.findUnique({
    where: { venueId_yearMonth: { venueId: input.venueId, yearMonth } },
  });
  if (!periodoInvii) throw new Error("override_senza_ciclo");

  const nuovo = periodoInvii.monthlyLimit + input.delta;
  await db.costOverride.create({
    data: {
      venueId: input.venueId,
      yearMonth,
      kind: "EMAILS",
      oldValue: periodoInvii.monthlyLimit,
      newValue: nuovo,
      note: input.note?.slice(0, 300) ?? null,
      actorEmail: input.actorEmail,
    },
  });
  await db.demUsagePeriod.update({ where: { id: periodoInvii.id }, data: { monthlyLimit: nuovo } });

  logEvento("costi.override.invii", {
    venueId: input.venueId,
    yearMonth,
    da: periodoInvii.monthlyLimit,
    a: nuovo,
  });
  return { kind: "EMAILS", yearMonth, precedente: periodoInvii.monthlyLimit, nuovo };
}

/** Lo storico delle autorizzazioni di un cliente, dalla più recente. */
export async function storicoOverride(venueId: string, quanti = 50) {
  return db.costOverride.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    take: quanti,
  });
}
