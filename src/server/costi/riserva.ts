import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { convertiInCentesimi, costoDiUnListino } from "@/lib/costi-infrastruttura";
import { cicloDi } from "@/lib/dem-quota";
import { logAttenzione } from "@/lib/observability";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { cambioCorrente } from "./cambio";
import { prezzoDi } from "./listino";
import { budgetEffettivo, PROVIDER_AWS } from "./periodo";

/**
 * Il freno economico: impegnare, liberare, consumare.
 *
 * ## Perché una riserva sui soldi e non solo sugli invii
 *
 * Gli invii sono la promessa fatta al cliente; il costo è un fatto nostro, e
 * i due non si muovono insieme. Un piano da 250.000 invii con un budget da 40
 * euro può finire i soldi prima delle email — o il contrario, se il listino
 * cambia. Servono due contatori e due controlli, e §4 della richiesta chiede
 * proprio di poterli distinguere quando uno dei due blocca.
 *
 * ## L'atomicità
 *
 * Il controllo «ci sta nel budget?» e la sottrazione stanno nella **stessa**
 * istruzione SQL, come già fa `riservaQuota` per gli invii. Leggere il
 * residuo, decidere in JavaScript e poi scrivere lascia in mezzo la finestra
 * in cui due campagne preparate nello stesso istante leggono lo stesso numero
 * e partono entrambe: 8 + 8 su 10 disponibili.
 */

export type StimaCosto =
  | { calcolabile: true; centesimi: number; originale: number; currency: string }
  | { calcolabile: false; motivo: "SENZA_LISTINO" | "SENZA_CAMBIO" };

/**
 * Quanto costerà mandare `destinatari` email, in centesimi della nostra valuta.
 *
 * Non restituisce zero quando non sa: restituisce «non calcolabile». Uno zero
 * passerebbe qualunque controllo di budget, e un listino dimenticato
 * diventerebbe il modo più silenzioso di spegnere la protezione dei costi.
 */
export async function stimaCostoInvio(
  destinatari: number,
  valutaNostra = "EUR",
  quando = new Date(),
): Promise<StimaCosto> {
  const prezzo = await prezzoDi(PROVIDER_AWS, "SES_SEND", quando);
  if (!prezzo) {
    logAttenzione("costi.stima_senza_listino", { servizio: "SES_SEND" });
    return { calcolabile: false, motivo: "SENZA_LISTINO" };
  }

  const originale = costoDiUnListino(destinatari, prezzo.unitPrice, prezzo.unit);
  const cambio = await cambioCorrente(prezzo.currency, valutaNostra);
  const centesimi = convertiInCentesimi(originale, cambio?.tasso ?? null);
  if (centesimi === null) {
    logAttenzione("costi.stima_senza_cambio", { da: prezzo.currency, a: valutaNostra });
    return { calcolabile: false, motivo: "SENZA_CAMBIO" };
  }

  return { calcolabile: true, centesimi, originale, currency: prezzo.currency };
}

/**
 * La riga del ciclo, creandola se è la prima volta.
 *
 * Deve esistere **prima** del controllo, perché il controllo è una `UPDATE` su
 * questa riga: senza, la prima campagna del mese non troverebbe niente da
 * aggiornare e passerebbe senza freno.
 */
export async function assicuraPeriodoCosti(venueId: string, adesso = new Date()) {
  const sub = await abbonamentoDi(venueId, adesso);
  const yearMonth = cicloDi(sub.currentPeriodStart);
  const budgetCents = await budgetEffettivo(venueId, yearMonth, sub.plan.awsBudgetCents ?? null);

  const periodo = await db.costPeriod
    .upsert({
      where: { venueId_yearMonth: { venueId, yearMonth } },
      create: {
        venueId,
        yearMonth,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        originalAmount: new Prisma.Decimal(0),
        budgetCents,
        warningPct: sub.plan.warningPct,
        criticalPct: sub.plan.criticalPct,
        hardLimitPct: sub.plan.hardLimitPct,
        allowOverage: sub.plan.allowOverage,
        billingCurrency: sub.plan.currency ?? "EUR",
      },
      update: {},
    })
    .catch(async (err: unknown) => {
      // Due campagne che aprono il ciclo nello stesso istante: la riga c'è
      // comunque, l'ha scritta l'altra, e rileggerla è la risposta giusta.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return db.costPeriod.findUniqueOrThrow({ where: { venueId_yearMonth: { venueId, yearMonth } } });
      }
      throw err;
    });

  return { periodo, sub, yearMonth };
}

export type EsitoRiservaCosto =
  | { riservato: true; yearMonth: string; centesimi: number }
  | { riservato: false; motivo: "BUDGET_LIMIT_EXCEEDED"; eccedenza: number };

/**
 * Impegna del budget, o non ne impegna niente.
 *
 * Il confronto è fra colonne e sta dentro la `UPDATE`: è Postgres a decidere,
 * una volta sola, e chi vede zero righe aggiornate sa di aver perso la corsa.
 * `budgetCents IS NULL` significa nessun tetto configurato, e allora si passa
 * sempre — il freno economico interviene solo dove qualcuno ha deciso un
 * limite.
 */
export async function riservaCosto(
  venueId: string,
  centesimi: number,
  adesso = new Date(),
): Promise<EsitoRiservaCosto> {
  const { periodo, yearMonth } = await assicuraPeriodoCosti(venueId, adesso);
  if (centesimi <= 0) return { riservato: true, yearMonth, centesimi: 0 };

  const righe = await db.$executeRaw`
    UPDATE "CostPeriod"
       SET "reservedCents" = "reservedCents" + ${centesimi}::int, "updatedAt" = NOW()
     WHERE id = ${periodo.id}
       AND ("budgetCents" IS NULL
            OR (("budgetCents" * "hardLimitPct") / 100) - COALESCE("amountCents", 0) - "reservedCents" >= ${centesimi}::int)
  `;

  if (righe === 0) {
    const dopo = await db.costPeriod.findUniqueOrThrow({ where: { id: periodo.id } });
    const tetto = Math.round(((dopo.budgetCents ?? 0) * dopo.hardLimitPct) / 100);
    const totale = (dopo.amountCents ?? 0) + dopo.reservedCents + centesimi;
    return { riservato: false, motivo: "BUDGET_LIMIT_EXCEEDED", eccedenza: Math.max(0, totale - tetto) };
  }

  return { riservato: true, yearMonth, centesimi };
}

/**
 * Restituisce budget impegnato e mai speso.
 *
 * `GREATEST(..., 0)`: un rilascio ripetuto — un lavoro che riprova, un
 * annullamento premuto due volte — non deve mandare la colonna sotto zero.
 */
export async function rilasciaCosto(venueId: string, yearMonth: string, centesimi: number): Promise<void> {
  if (centesimi <= 0) return;
  await db.$executeRaw`
    UPDATE "CostPeriod"
       SET "reservedCents" = GREATEST("reservedCents" - ${centesimi}::int, 0), "updatedAt" = NOW()
     WHERE "venueId" = ${venueId} AND "yearMonth" = ${yearMonth}
  `;
}

/**
 * Trasforma budget impegnato in budget speso.
 *
 * Le due colonne si muovono nella stessa istruzione perché sono due facce
 * dello stesso fatto: vederle disallineate anche per un istante significa
 * mostrare un residuo che non esiste, e magari lasciar passare una campagna
 * sul residuo sbagliato.
 */
export async function consumaCosto(venueId: string, yearMonth: string, centesimi: number): Promise<void> {
  if (centesimi <= 0) return;
  await db.$executeRaw`
    UPDATE "CostPeriod"
       SET "amountCents" = COALESCE("amountCents", 0) + ${centesimi}::int,
           "reservedCents" = GREATEST("reservedCents" - ${centesimi}::int, 0),
           "updatedAt" = NOW()
     WHERE "venueId" = ${venueId} AND "yearMonth" = ${yearMonth}
  `;
}
