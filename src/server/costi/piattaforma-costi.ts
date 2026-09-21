import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { cicloDi } from "@/lib/dem-quota";
import { etichetteDi, priorita, passaIlFiltro, type DatiStato, type EtichettaStato, type FiltroCosti } from "@/lib/stati-costo";
import type { StatoCosto } from "@/lib/costi-infrastruttura";

/**
 * La vista di piattaforma sui costi: tutti i clienti, in una interrogazione.
 *
 * ## Perché SQL a mano
 *
 * Con l'ORM questa pagina sarebbe una lettura dei clienti più, per ognuno, il
 * suo ciclo di costi, il suo ciclo di invii, il suo piano e i suoi override:
 * con mille clienti sono quattromila interrogazioni per disegnare una tabella.
 * Qui è **una**, con i join dichiarati e l'ordinamento fatto da Postgres, e
 * l'impaginazione in `LIMIT/OFFSET` — cioè il numero di righe trasportate non
 * dipende da quanti clienti abbiamo.
 *
 * ## L'ordinamento sta nel database
 *
 * La priorità è un `CASE` dentro la query e non un `sort` in memoria, perché
 * ordinare in memoria significherebbe prima portarsi via tutte le righe — e a
 * quel punto l'impaginazione non servirebbe più a niente.
 */

export type RigaCosto = {
  venueId: string;
  locale: string;
  piano: string;
  pianoSlug: string;
  emailUsati: number;
  emailRiservati: number;
  emailLimite: number;
  amountCents: number | null;
  reservedCents: number;
  budgetCents: number | null;
  percentuale: number | null;
  forecastCents: number | null;
  stato: StatoCosto;
  etichette: EtichettaStato[];
  calcolabile: boolean;
  overrideAttivo: boolean;
  inviiFermi: boolean;
  aggiornatoIl: Date;
};

type RigaGrezza = {
  venueId: string;
  locale: string;
  piano: string;
  pianoSlug: string;
  emailUsati: number;
  emailRiservati: number;
  emailLimite: number;
  amountCents: number | null;
  reservedCents: number;
  budgetCents: number | null;
  forecastCents: number | null;
  stato: string;
  warningPct: number;
  criticalPct: number;
  hardLimitPct: number;
  allowOverage: boolean;
  sendingPausedAt: Date | null;
  overrides: number;
  originalAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal | null;
  updatedAt: Date;
  totale: number;
};

/** Il ciclo di calendario di oggi, nel formato `2026-09`. */
export function cicloCorrente(adesso = new Date()): string {
  return cicloDi(adesso);
}

function componi(r: RigaGrezza): RigaCosto {
  /*
    «Non calcolabile» è uno stato, non uno zero.

    Succede quando il ciclo ha consumi (importo originale maggiore di zero) ma
    non sappiamo convertirli, o quando l'importo non è mai stato calcolato
    perché mancava il listino. In entrambi i casi mostrare «€0,00» direbbe al
    Super Admin che quel cliente non costa niente, che è la bugia più costosa
    che questa pagina possa raccontare.
  */
  const calcolabile = r.amountCents !== null || Number(r.originalAmount) === 0;

  const percentuale =
    r.budgetCents && r.budgetCents > 0 && r.amountCents !== null
      ? Math.round((r.amountCents / r.budgetCents) * 1000) / 10
      : null;

  const previsioneOltreBudget =
    r.budgetCents !== null && r.forecastCents !== null && r.forecastCents > r.budgetCents;

  const dati: DatiStato = {
    stato: r.stato as StatoCosto,
    /* Bloccato è il cliente sospeso, e quello al tetto che non può sconfinare:
       da lì in poi il freno rifiuta ogni campagna nuova. */
    inviiFermi: r.sendingPausedAt !== null || (r.stato === "LIMITE" && !r.allowOverage),
    previsioneOltreBudget,
    previsioneAttendibile: r.forecastCents !== null,
    overrideAttivo: r.overrides > 0,
    calcolabile,
  };

  return {
    venueId: r.venueId,
    locale: r.locale,
    piano: r.piano,
    pianoSlug: r.pianoSlug,
    emailUsati: r.emailUsati,
    emailRiservati: r.emailRiservati,
    emailLimite: r.emailLimite,
    amountCents: r.amountCents,
    reservedCents: r.reservedCents,
    budgetCents: r.budgetCents,
    percentuale,
    forecastCents: r.forecastCents,
    stato: r.stato as StatoCosto,
    etichette: etichetteDi(dati),
    calcolabile,
    overrideAttivo: dati.overrideAttivo,
    inviiFermi: dati.inviiFermi,
    aggiornatoIl: r.updatedAt,
  };
}

export type ElencoCosti = {
  righe: RigaCosto[];
  totale: number;
  pagina: number;
  perPagina: number;
};

/**
 * L'elenco dei clienti con i loro costi, filtrato, ordinato e impaginato.
 *
 * I filtri che dipendono da stati composti (previsione, override, bloccati)
 * non si possono esprimere del tutto in SQL senza duplicare qui la logica che
 * sta in `stati-costo.ts` — e due copie della stessa regola divergono. La via
 * di mezzo: SQL filtra e ordina su ciò che sa (stato, sospensione, override,
 * previsione oltre budget), e il filtro fine passa dalla funzione pura.
 */
export async function elencoCosti(opzioni: {
  ciclo?: string;
  filtro?: FiltroCosti;
  ricerca?: string;
  pianoSlug?: string;
  pagina?: number;
  perPagina?: number;
}): Promise<ElencoCosti> {
  const ciclo = opzioni.ciclo ?? cicloCorrente();
  const filtro = opzioni.filtro ?? "tutti";
  const pagina = Math.max(1, opzioni.pagina ?? 1);
  const perPagina = Math.min(100, Math.max(5, opzioni.perPagina ?? 25));
  const ricerca = opzioni.ricerca?.trim() ?? "";

  const condizioni: Prisma.Sql[] = [Prisma.sql`cp."yearMonth" = ${ciclo}`];
  if (ricerca) condizioni.push(Prisma.sql`v."name" ILIKE ${"%" + ricerca + "%"}`);
  if (opzioni.pianoSlug) condizioni.push(Prisma.sql`p."slug" = ${opzioni.pianoSlug}`);

  if (filtro === "bloccati") {
    condizioni.push(Prisma.sql`(s."sendingPausedAt" IS NOT NULL OR (cp."stato" = 'LIMITE' AND cp."allowOverage" = false))`);
  } else if (filtro === "critici") {
    condizioni.push(Prisma.sql`cp."stato" IN ('CRITICO', 'LIMITE')`);
  } else if (filtro === "attenzione") {
    condizioni.push(Prisma.sql`cp."stato" = 'ATTENZIONE'`);
  } else if (filtro === "normali") {
    condizioni.push(Prisma.sql`cp."stato" = 'NORMALE'`);
  } else if (filtro === "previsione") {
    condizioni.push(Prisma.sql`cp."forecastCents" IS NOT NULL AND cp."budgetCents" IS NOT NULL AND cp."forecastCents" > cp."budgetCents"`);
  } else if (filtro === "override") {
    condizioni.push(Prisma.sql`EXISTS (SELECT 1 FROM "CostOverride" o WHERE o."venueId" = cp."venueId" AND o."yearMonth" = cp."yearMonth")`);
  }

  const dove = Prisma.join(condizioni, " AND ");

  const righe = await db.$queryRaw<RigaGrezza[]>`
    SELECT
      cp."venueId",
      v."name"                AS "locale",
      p."name"                AS "piano",
      p."slug"                AS "pianoSlug",
      COALESCE(up."used", 0)          AS "emailUsati",
      COALESCE(up."reserved", 0)      AS "emailRiservati",
      COALESCE(up."monthlyLimit", 0)  AS "emailLimite",
      cp."amountCents",
      cp."reservedCents",
      cp."budgetCents",
      cp."forecastCents",
      cp."stato",
      cp."warningPct",
      cp."criticalPct",
      cp."hardLimitPct",
      cp."allowOverage",
      s."sendingPausedAt",
      cp."originalAmount",
      cp."exchangeRate",
      cp."updatedAt",
      (SELECT COUNT(*)::int FROM "CostOverride" o
        WHERE o."venueId" = cp."venueId" AND o."yearMonth" = cp."yearMonth") AS "overrides",
      COUNT(*) OVER ()::int AS "totale"
    FROM "CostPeriod" cp
    JOIN "Venue" v            ON v."id" = cp."venueId"
    JOIN "DemSubscription" s  ON s."venueId" = cp."venueId"
    JOIN "DemPlan" p          ON p."id" = s."planId"
    LEFT JOIN "DemUsagePeriod" up
           ON up."venueId" = cp."venueId" AND up."yearMonth" = cp."yearMonth"
    WHERE ${dove}
    ORDER BY
      CASE
        WHEN s."sendingPausedAt" IS NOT NULL THEN 60
        WHEN cp."stato" = 'LIMITE'   THEN 50
        WHEN cp."stato" = 'CRITICO'  THEN 40
        WHEN cp."forecastCents" IS NOT NULL AND cp."budgetCents" IS NOT NULL
             AND cp."forecastCents" > cp."budgetCents" THEN 30
        WHEN cp."stato" = 'ATTENZIONE' THEN 20
        WHEN cp."amountCents" IS NULL AND cp."originalAmount" > 0 THEN 10
        ELSE 0
      END DESC,
      CASE WHEN cp."budgetCents" > 0
           THEN COALESCE(cp."amountCents", 0)::float / cp."budgetCents"
           ELSE 0 END DESC,
      v."name" ASC
    LIMIT ${perPagina} OFFSET ${(pagina - 1) * perPagina}
  `;

  const composte = righe.map(componi);
  return {
    righe: composte,
    totale: righe[0]?.totale ?? 0,
    pagina,
    perPagina,
  };
}

export type KpiCosti = {
  ciclo: string;
  costoTotaleCents: number;
  budgetTotaleCents: number;
  previsioneTotaleCents: number;
  emailProcessate: number;
  clienti: number;
  regolari: number;
  attenzione: number;
  critici: number;
  bloccati: number;
  /** Clienti con consumi ma senza un costo calcolabile: §21. */
  nonCalcolabili: number;
};

/**
 * I numeri in cima alla pagina, in una interrogazione sola.
 *
 * Somma su `CostPeriod`, che è l'aggregato già scritto dal cron: non tocca il
 * ledger. Sommare un milione di righe di consumo a ogni caricamento sarebbe
 * il modo più diretto di rendere lenta proprio la pagina che deve dire in
 * cinque secondi se c'è un problema.
 */
export async function kpiCosti(ciclo = cicloCorrente()): Promise<KpiCosti> {
  const [riga] = await db.$queryRaw<
    {
      costo: bigint | null;
      budget: bigint | null;
      previsione: bigint | null;
      clienti: number;
      regolari: number;
      attenzione: number;
      critici: number;
      bloccati: number;
      nonCalcolabili: number;
    }[]
  >`
    SELECT
      SUM(cp."amountCents")   AS "costo",
      SUM(cp."budgetCents")   AS "budget",
      SUM(cp."forecastCents") AS "previsione",
      COUNT(*)::int                                                                   AS "clienti",
      COUNT(*) FILTER (WHERE cp."stato" = 'NORMALE' AND s."sendingPausedAt" IS NULL)::int   AS "regolari",
      COUNT(*) FILTER (WHERE cp."stato" = 'ATTENZIONE')::int                              AS "attenzione",
      COUNT(*) FILTER (WHERE cp."stato" = 'CRITICO')::int                                 AS "critici",
      COUNT(*) FILTER (WHERE s."sendingPausedAt" IS NOT NULL
                          OR (cp."stato" = 'LIMITE' AND cp."allowOverage" = false))::int   AS "bloccati",
      COUNT(*) FILTER (WHERE cp."amountCents" IS NULL AND cp."originalAmount" > 0)::int    AS "nonCalcolabili"
    FROM "CostPeriod" cp
    JOIN "DemSubscription" s ON s."venueId" = cp."venueId"
    WHERE cp."yearMonth" = ${ciclo}
  `;

  const [invii] = await db.$queryRaw<{ email: bigint | null }[]>`
    SELECT SUM(up."used") AS "email" FROM "DemUsagePeriod" up WHERE up."yearMonth" = ${ciclo}
  `;

  return {
    ciclo,
    costoTotaleCents: Number(riga?.costo ?? 0),
    budgetTotaleCents: Number(riga?.budget ?? 0),
    previsioneTotaleCents: Number(riga?.previsione ?? 0),
    emailProcessate: Number(invii?.email ?? 0),
    clienti: riga?.clienti ?? 0,
    regolari: riga?.regolari ?? 0,
    attenzione: riga?.attenzione ?? 0,
    critici: riga?.critici ?? 0,
    bloccati: riga?.bloccati ?? 0,
    nonCalcolabili: riga?.nonCalcolabili ?? 0,
  };
}

/** Il filtro fine, per i casi che SQL non distingue da solo. */
export function filtraFine(righe: RigaCosto[], filtro: FiltroCosti): RigaCosto[] {
  return righe.filter((r) =>
    passaIlFiltro(
      {
        stato: r.stato,
        inviiFermi: r.inviiFermi,
        previsioneOltreBudget: r.forecastCents !== null && r.budgetCents !== null && r.forecastCents > r.budgetCents,
        previsioneAttendibile: r.forecastCents !== null,
        overrideAttivo: r.overrideAttivo,
        calcolabile: r.calcolabile,
      },
      filtro,
    ),
  );
}

/** L'ordine di priorità, esposto per i test: è lo stesso `CASE` della query. */
export function prioritaDi(r: RigaCosto): number {
  return priorita({
    stato: r.stato,
    inviiFermi: r.inviiFermi,
    previsioneOltreBudget: r.forecastCents !== null && r.budgetCents !== null && r.forecastCents > r.budgetCents,
    previsioneAttendibile: r.forecastCents !== null,
    overrideAttivo: r.overrideAttivo,
    calcolabile: r.calcolabile,
  });
}
