import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { costoDiUnListino } from "@/lib/costi-infrastruttura";
import { logAttenzione } from "@/lib/observability";
import { prezzoDi } from "./listino";

/**
 * Il ledger dei consumi: una riga per ogni utilizzo.
 *
 * `DemUsagePeriod` sa quanti invii restano a un cliente. Non sa **quando** li
 * ha consumati, con quale campagna, a che prezzo — e quindi non basta né per
 * il grafico giornaliero, né per il costo di una singola campagna, né per
 * riconciliare con la fattura di Amazon.
 *
 * ## L'idempotenza non è un dettaglio
 *
 * Questo modulo viene chiamato da un lavoro in coda che può riprendere da
 * metà, e in futuro dagli eventi SES, che Amazon può consegnare più di una
 * volta — è esplicito nella sua documentazione. Senza una chiave unica, un
 * webhook ripetuto raddoppia il costo di un cliente e fa scattare un blocco
 * che non doveva scattare.
 *
 * La chiave la costruisce **chi chiama**, perché solo lì si sa cosa rende un
 * evento «lo stesso evento»: per un invio è la campagna più il lotto, per un
 * evento SES è il suo identificativo di messaggio.
 */

export type UsoDaRegistrare = {
  venueId: string;
  campaignId?: string | null;
  provider: string;
  service: string;
  eventType: string;
  quantity: number;
  /** `2026-09`, il ciclo di consumo a cui questo utilizzo appartiene. */
  yearMonth: string;
  idempotencyKey: string;
  providerEventId?: string | null;
  occurredAt?: Date;
  /**
   * `SENT` per difetto: la stragrande maggioranza delle scritture è un consumo
   * già avvenuto. Gli altri stati servono a chi impegna (`RESERVED`), a chi
   * registra un rifiuto non fatturabile (`FAILED`), a chi libera
   * (`CANCELLED`) e alla riconciliazione (`RECONCILED`).
   */
  status?: StatoUso;
};

export type StatoUso = "RESERVED" | "SENT" | "FAILED" | "CANCELLED" | "RECONCILED";

/** Gli unici due stati che fanno somma quando si chiede «quanto è costato». */
export const STATI_A_COSTO: StatoUso[] = ["SENT", "RECONCILED"];

export type EsitoRegistrazione =
  | { registrato: true; costo: number; currency: string }
  | { registrato: false; motivo: "GIA_REGISTRATO" | "SENZA_PREZZO" | "QUANTITA_NULLA" };

/**
 * Scrive un consumo, una volta sola.
 *
 * Senza un prezzo a listino **non si inventa niente**: si registra l'attenzione
 * nei log e non si scrive la riga. Una riga a costo zero sarebbe peggio di
 * nessuna riga — direbbe «questo consumo non costa», che è una bugia, e la
 * riconciliazione con la fattura non avrebbe modo di accorgersene.
 */
export async function registraUso(uso: UsoDaRegistrare): Promise<EsitoRegistrazione> {
  if (uso.quantity <= 0) return { registrato: false, motivo: "QUANTITA_NULLA" };

  const quando = uso.occurredAt ?? new Date();
  const prezzo = await prezzoDi(uso.provider, uso.service, quando);
  if (!prezzo) {
    logAttenzione("costi.listino_mancante", { provider: uso.provider, service: uso.service });
    return { registrato: false, motivo: "SENZA_PREZZO" };
  }

  const stato: StatoUso = uso.status ?? "SENT";
  /* Un rifiuto prima dell'accettazione non si paga, e un impegno non è ancora
     una spesa: la riga si scrive lo stesso — serve a vedere i rifiuti che
     salgono — ma con costo zero, perché scrivere il prezzo pieno e poi
     escluderlo dalle somme è il modo di ritrovarsi due verità nella stessa
     tabella. */
  const costo = stato === "SENT" || stato === "RECONCILED"
    ? costoDiUnListino(uso.quantity, prezzo.unitPrice, prezzo.unit)
    : 0;

  try {
    await db.usageEvent.create({
      data: {
        venueId: uso.venueId,
        campaignId: uso.campaignId ?? null,
        provider: uso.provider,
        service: uso.service,
        eventType: uso.eventType,
        quantity: uso.quantity,
        unit: prezzo.unit,
        unitPrice: new Prisma.Decimal(prezzo.unitPrice),
        estimatedCost: new Prisma.Decimal(costo.toFixed(6)),
        currency: prezzo.currency,
        yearMonth: uso.yearMonth,
        status: stato,
        idempotencyKey: uso.idempotencyKey.slice(0, 200),
        providerEventId: uso.providerEventId?.slice(0, 250) ?? null,
        occurredAt: quando,
      },
    });
  } catch (err) {
    // Già scritto da un tentativo precedente: è il caso per cui la chiave
    // esiste, e non è un errore da propagare a chi sta inviando una campagna.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { registrato: false, motivo: "GIA_REGISTRATO" };
    }
    throw err;
  }

  return { registrato: true, costo, currency: prezzo.currency };
}

export type RigaDettaglio = {
  service: string;
  quantita: number;
  unit: string;
  unitPrice: number;
  costo: number;
  currency: string;
};

/**
 * Il dettaglio per servizio di un ciclo: è la tabella «Dettaglio costi».
 *
 * Raggruppa sul ledger invece di ricalcolare dal listino, e la differenza
 * conta: il ledger porta il prezzo **applicato allora**, quindi un listino
 * cambiato a metà mese non riscrive la prima metà.
 */
export async function dettaglioPerServizio(
  venueId: string,
  yearMonth: string,
): Promise<RigaDettaglio[]> {
  const righe = await db.usageEvent.groupBy({
    by: ["service", "unit", "currency", "unitPrice"],
    where: { venueId, yearMonth, status: { in: STATI_A_COSTO } },
    _sum: { quantity: true, estimatedCost: true },
  });

  return righe
    .map((r) => ({
      service: r.service,
      quantita: r._sum.quantity ?? 0,
      unit: r.unit,
      unitPrice: Number(r.unitPrice),
      costo: Number(r._sum.estimatedCost ?? 0),
      currency: r.currency,
    }))
    .filter((r) => r.quantita > 0)
    .sort((a, b) => b.costo - a.costo);
}

/** Il costo di una singola campagna, per §17: visibile solo a noi. */
export async function costoDiUnaCampagna(campaignId: string): Promise<RigaDettaglio[]> {
  const righe = await db.usageEvent.groupBy({
    by: ["service", "unit", "currency", "unitPrice"],
    where: { campaignId, status: { in: STATI_A_COSTO } },
    _sum: { quantity: true, estimatedCost: true },
  });

  return righe.map((r) => ({
    service: r.service,
    quantita: r._sum.quantity ?? 0,
    unit: r.unit,
    unitPrice: Number(r.unitPrice),
    costo: Number(r._sum.estimatedCost ?? 0),
    currency: r.currency,
  }));
}

/**
 * La spesa giorno per giorno di un ciclo: serve al grafico e alla previsione.
 *
 * Una interrogazione sola con il raggruppamento fatto da Postgres. Portare in
 * memoria un milione di righe per sommarle in JavaScript è il modo di avere
 * una pagina che ci mette otto secondi il giorno che un cliente cresce.
 */
export async function spesaGiornaliera(
  venueId: string,
  yearMonth: string,
): Promise<{ giorno: string; costo: number }[]> {
  const righe = await db.$queryRaw<{ giorno: string; costo: Prisma.Decimal }[]>`
    SELECT to_char("occurredAt", 'YYYY-MM-DD') AS giorno,
           SUM("estimatedCost") AS costo
      FROM "UsageEvent"
     WHERE "venueId" = ${venueId} AND "yearMonth" = ${yearMonth}
       AND "status" IN ('SENT', 'RECONCILED')
     GROUP BY 1
     ORDER BY 1
  `;
  return righe.map((r) => ({ giorno: r.giorno, costo: Number(r.costo) }));
}
