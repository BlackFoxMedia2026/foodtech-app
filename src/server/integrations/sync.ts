import type { IntegrationInstallation, IntegrationSyncTrigger, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { logErrore, logEvento } from "@/lib/observability";
import type { JobOutcome, JobRef } from "@/server/jobs/queue";
import { adattatoreDi } from "./adapters";
import type { OperazioneSync } from "./adapters/tipi";
import { applicaRisultato } from "./mappature";
import { ErroreIntegrazione, normalizzaErrore, nuovoCorrelationId } from "./errori";
import { saluteDi, transizione } from "./stati";
import { accodaSincronizzazione, contestoFresco, fraseDiSalute } from "./installazioni";
import { voceDi } from "./registry";
import type { StatoInstallazione } from "./tipi";

/**
 * **Il motore di sincronizzazione.** Uno per tutti i fornitori.
 *
 * ```
 * «Sincronizza ora» / attivazione / cron / webhook
 *        ↓ accoda (coda dei lavori, `integration.sync`)
 * eseguiSincronizzazione
 *        ↓ lucchetto (ACTIVE → SYNCING)
 *        ↓ credenziali fresche
 *        ↓ adapter.sincronizza()      ← il fornitore
 *        ↓ mappature
 *        ↓ IntegrationSyncLog + stato + salute
 * ```
 *
 * ## Le regole
 *
 * - **Una alla volta per installazione.** Il passaggio `ACTIVE → SYNCING` è
 *   una scrittura condizionata: la seconda sincronizzazione che parte nello
 *   stesso momento trova zero righe e si ferma, senza errore.
 * - **Sempre fuori dalla richiesta HTTP.** Una sincronizzazione di un menu
 *   da quattrocento piatti non sta dentro un clic: passa dalla coda dei
 *   lavori (`server/jobs/queue.ts`), come le campagne.
 * - **Ogni esecuzione lascia una riga**, riuscita o no, con il filo di
 *   correlazione che la lega alle chiamate fatte al fornitore.
 * - **Un errore che si risolve da solo si riprova da solo.** Troppe
 *   richieste, fornitore lento o giù: il lavoro solleva e la coda riprova,
 *   rispettando il `Retry-After` quando c'è. Un accesso scaduto no: lì
 *   riprovare non serve, serve il ristoratore — `REAUTH_REQUIRED`.
 * - **Un lucchetto rimasto chiuso si riapre.** Un processo morto a metà
 *   lascia `SYNCING`: dopo `MINUTI_SYNC_APPESA` la spazzata programmata lo
 *   rimette `ACTIVE`.
 */

export const MINUTI_SYNC_APPESA = 15;

export type EsitoSincronizzazione =
  | { eseguita: false; motivo: "non_trovata" | "non_attiva" | "gia_in_corso" | "nessuna_capacita" }
  | {
      eseguita: true;
      riuscita: boolean;
      logId: string;
      processati: number;
      riusciti: number;
      falliti: number;
      errore?: ErroreIntegrazione;
    };

/**
 * L'indirizzo pubblico di Foodtech **per i fornitori**.
 *
 * Diverso da `origineDa` (lib/origine.ts), che legge la richiesta: qui
 * l'indirizzo si consegna al fornitore — l'indirizzo di ritorno OAuth, quello
 * dei webhook — e il fornitore lo confronta con quello registrato. Uno
 * nato da un'anteprima non corrisponderebbe, o peggio resterebbe registrato
 * su un'anteprima che domani non esiste. Quindi prima la variabile
 * d'ambiente, poi la richiesta, poi il locale di sviluppo.
 */
export function origineDellaPiattaforma(h?: { get(nome: string): string | null }): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (env) return env.replace(/\/$/, "");
  if (h) {
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const protocollo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${protocollo}://${host}`;
    }
  }
  return "http://localhost:3000";
}

export async function eseguiSincronizzazione(input: {
  installationId: string;
  venueId: string;
  operazione: OperazioneSync;
  trigger: IntegrationSyncTrigger;
}): Promise<EsitoSincronizzazione> {
  const i = await db.integrationInstallation.findFirst({
    where: { id: input.installationId, venueId: input.venueId },
  });
  if (!i) return { eseguita: false, motivo: "non_trovata" };
  /* Un'altra sincronizzazione ha già il lucchetto: «già in corso», non «non
     attiva». La differenza conta per la coda — la prima si rimanda, la
     seconda si scarta — e scartarla perderebbe il clic su «Sincronizza ora». */
  if (i.status === "SYNCING") return { eseguita: false, motivo: "gia_in_corso" };
  if (i.status !== "ACTIVE" && i.status !== "ERROR") return { eseguita: false, motivo: "non_attiva" };
  if (i.enabledCapabilities.length === 0) return { eseguita: false, motivo: "nessuna_capacita" };

  const adattatore = adattatoreDi(i.integrationSlug);
  if (!adattatore?.sincronizza) return { eseguita: false, motivo: "nessuna_capacita" };

  /* --- Il lucchetto --- */
  const inCorso = transizione(i.status as StatoInstallazione, { tipo: "sync_inizio" });
  const { count } = await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: i.venueId, status: i.status },
    data: { status: inCorso },
  });
  if (count === 0) return { eseguita: false, motivo: "gia_in_corso" };

  const correlationId = nuovoCorrelationId();
  const log = await db.integrationSyncLog.create({
    data: {
      venueId: i.venueId,
      installationId: i.id,
      provider: i.integrationSlug,
      operation: input.operazione,
      direction: "INBOUND",
      trigger: input.trigger,
      correlationId,
    },
  });

  const bloccata: IntegrationInstallation = { ...i, status: "SYNCING" };
  try {
    const ctx = await contestoFresco(bloccata, origineDellaPiattaforma(), correlationId);
    const risultato = await adattatore.sincronizza(ctx, input.operazione);
    const applicato = await applicaRisultato(i, risultato);

    const falliti = risultato.scartati.length;
    const processati = risultato.entita.length + falliti;
    const adesso = new Date();
    await db.integrationSyncLog.update({
      where: { id: log.id },
      data: {
        status: falliti > 0 ? "PARTIAL" : "SUCCEEDED",
        finishedAt: adesso,
        itemsProcessed: processati,
        itemsSucceeded: risultato.entita.length,
        itemsFailed: falliti,
        metadata: {
          abbinateAutomaticamente: applicato.abbinate,
          daAbbinare: applicato.nonAbbinate,
          scartati: risultato.scartati.slice(0, 20),
        } as Prisma.InputJsonValue,
      },
    });
    await chiudiLucchetto(bloccata, { ok: true }, adesso);
    logEvento("integrazione.sync_riuscita", {
      slug: i.integrationSlug,
      installazione: i.id,
      processati,
      corr: correlationId,
    });
    return { eseguita: true, riuscita: true, logId: log.id, processati, riusciti: risultato.entita.length, falliti };
  } catch (err) {
    const e = normalizzaErrore(err, correlationId);
    await db.integrationSyncLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorCode: e.codice,
        error: e.riassunto(),
        metadata: { riprovabile: e.riprovabile, riprovaTraSecondi: e.dettaglio.riprovaTraSecondi ?? null },
      },
    });
    await chiudiLucchetto(bloccata, { ok: false, errore: e }, new Date());
    logErrore("integrazione.sync_non_riuscita", e, { slug: i.integrationSlug, installazione: i.id, corr: correlationId });
    return { eseguita: true, riuscita: false, logId: log.id, processati: 0, riusciti: 0, falliti: 0, errore: e };
  }
}

async function chiudiLucchetto(
  i: IntegrationInstallation,
  esito: { ok: true } | { ok: false; errore: ErroreIntegrazione },
  adesso: Date,
) {
  const voce = voceDi(i.integrationSlug);
  const nuovo = esito.ok
    ? transizione("SYNCING", { tipo: "sync_riuscita" })
    : transizione("SYNCING", { tipo: "sync_fallita", codice: esito.errore.codice });

  const campi = esito.ok
    ? { lastSyncAt: adesso, lastSuccessfulSyncAt: adesso }
    : {
        lastSyncAt: adesso,
        lastErrorAt: adesso,
        lastErrorCode: esito.errore.codice,
        lastError: esito.errore.riassunto(),
      };
  const salute = saluteDi({ ...i, ...campi, status: nuovo }, adesso);

  /* Condizionata a SYNCING: se nel frattempo qualcuno ha disattivato o
     disinstallato, la fine di una sincronizzazione non riaccende niente. */
  await db.integrationInstallation.updateMany({
    where: { id: i.id, venueId: i.venueId, status: "SYNCING" },
    data: {
      ...campi,
      status: nuovo,
      healthStatus: salute,
      healthMessage: fraseDiSalute(salute, esito.ok ? null : esito.errore.codice, voce?.nome ?? i.integrationSlug, voce?.messaggi),
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Il lavoro in coda                                                         */
/* -------------------------------------------------------------------------- */

const PayloadSync = z.object({
  installationId: z.string(),
  venueId: z.string(),
  operazione: z.enum(["full", "tables", "menu", "tax_rates", "payment_methods"]).default("full"),
  trigger: z.enum(["MANUAL", "WEBHOOK", "SCHEDULED", "INITIAL_IMPORT", "RETRY"]),
});

/**
 * Il gestore di `integration.sync`. Un errore riprovabile **solleva**: è
 * così che la coda sa di dover riprovare, con la sua attesa crescente. Il
 * tentativo dopo il primo si registra come `RETRY`, e nel registro si legge
 * «riprovata» invece di due sincronizzazioni manuali uguali.
 */
export async function lavoroSincronizzazione(payload: unknown, job: JobRef): Promise<JobOutcome | void> {
  const p = PayloadSync.parse(payload);
  const esito = await eseguiSincronizzazione({
    ...p,
    trigger: job.attempts > 1 ? "RETRY" : p.trigger,
  });

  if (esito.eseguita && !esito.riuscita && esito.errore?.riprovabile && job.attempts < job.maxAttempts) {
    const attesa = esito.errore.dettaglio.riprovaTraSecondi;
    if (attesa && attesa > 0) return { again: true, delayMs: attesa * 1000 };
    throw esito.errore;
  }
  /* Un'altra sincronizzazione in corso: si rimanda di un minuto invece di
     perdere la richiesta. */
  if (!esito.eseguita && esito.motivo === "gia_in_corso") return { again: true, delayMs: 60_000 };
  return { done: true };
}

/* -------------------------------------------------------------------------- */
/*  La spazzata programmata                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Chiamata dal cron dei lavori, ogni minuto. Fa due cose leggere:
 *
 * 1. riapre i lucchetti rimasti chiusi da un processo morto;
 * 2. accoda le sincronizzazioni programmate dovute, secondo l'intervallo che
 *    ogni adattatore dichiara (`minutiSyncProgrammata`). La chiave di
 *    deduplicazione della coda impedisce di accodarne due per la stessa
 *    installazione.
 */
export async function spazzataIntegrazioni(adesso = new Date()) {
  const appese = await db.integrationInstallation.updateMany({
    where: { status: "SYNCING", updatedAt: { lt: new Date(adesso.getTime() - MINUTI_SYNC_APPESA * 60_000) } },
    data: { status: "ACTIVE" },
  });

  const attive = await db.integrationInstallation.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, venueId: true, integrationSlug: true, lastSyncAt: true },
    take: 200,
  });

  let accodate = 0;
  for (const i of attive) {
    const minuti = adattatoreDi(i.integrationSlug)?.minutiSyncProgrammata;
    if (!minuti) continue;
    if (i.lastSyncAt && adesso.getTime() - i.lastSyncAt.getTime() < minuti * 60_000) continue;
    const r = await accodaSincronizzazione(i, "SCHEDULED");
    if (!r.duplicate) accodate++;
  }
  return { lucchettiRiaperti: appese.count, syncAccodate: accodate };
}
