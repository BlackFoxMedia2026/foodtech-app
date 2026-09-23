import { Prisma as PrismaErrore, type ExternalEntityMapping, type Prisma } from "@prisma/client";
import { aggiornaEsitoMappatura, unisciMetadati } from "./stato-mappature";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAttenzione, logEvento } from "@/lib/observability";
import { enqueueJob, type JobRef } from "@/server/jobs/queue";
import { adattatoreDi } from "./adapters";
import { eAdattatorePos } from "./adapters/tipi";
import type { OrdineDaInviare } from "./dominio";
import { ERRORI_DI_ACCESSO, ErroreIntegrazione, normalizzaErrore, nuovoCorrelationId } from "./errori";
import { contestoFresco, registraErrore } from "./installazioni";
import { origineDellaPiattaforma } from "./sync";

/**
 * **Mandare un ordine a una cassa senza mai mandarlo due volte, e senza
 * fermare la sala quando la cassa non risponde.**
 *
 * ```
 * inviaOrdine(ordine)
 *    ↓ mappatura ORDER (chiave: il riferimento Foodtech)   ← stato: PENDING_SYNC
 *    ↓ presa in carico con lucchetto ottimistico            ← SENDING
 *    ↓ adapter.pos.createOrder()
 *        riuscito            → SYNCED (+ id presso la cassa)
 *        fornitore giù/lento → PENDING_SYNC + lavoro in coda «integration.order»
 *        errore definitivo   → FAILED, con il codice
 * ```
 *
 * ## Tre difese contro il doppione, una dentro l'altra
 *
 * 1. **La mappatura.** Il riferimento è la chiave unica della riga: un
 *    secondo `inviaOrdine` con lo stesso riferimento trova la riga, e se è
 *    `SYNCED` restituisce l'esito senza chiamare nessuno.
 * 2. **Il lucchetto.** La presa in carico scrive `SENDING` solo se la riga è
 *    ancora com'era quando l'ha letta (`updatedAt` nel filtro): due invii
 *    contemporanei, ne parte uno.
 * 3. **La cassa stessa**, quando la offre. Cassa in Cloud ha un vincolo di
 *    unicità su `externalId`: se un processo muore **dopo** aver mandato
 *    l'ordine e prima di scrivere `SYNCED`, il tentativo successivo riceve
 *    `ConflictValue` e l'adattatore ritrova l'ordine esistente.
 *
 * ## Niente coda parallela
 *
 * Le riprove passano dalla coda dei lavori di sempre (`server/jobs/queue.ts`),
 * con la sua attesa crescente (1, 5, 20, 60 minuti). Lo stato dell'invio sta
 * nei metadati della mappatura: si legge nella scheda Mappature, e non serve
 * una tabella nuova.
 *
 * **Oggi non lo chiama nessuna schermata.** Il pulsante «Invia comanda» passa
 * ancora da `fornitorePerLocale`, che risponde sempre con la cucina di
 * Foodtech. Vedi `fornitore-integrazione.ts` per il contratto già pronto.
 */

export const TIPO_LAVORO_ORDINE = "integration.order";

/** Dopo quanto un `SENDING` si considera abbandonato da un processo morto. */
export const MINUTI_INVIO_APPESO = 2;

export type StatoInvio = "PENDING_SYNC" | "SENDING" | "SYNCED" | "FAILED";

type MetadatiOrdine = {
  invio: {
    stato: StatoInvio;
    tentativi: number;
    idEsterno: string | null;
    codiceErrore: string | null;
    aggiornatoIl: string;
  };
  ordine: OrdineDaInviare;
  /**
   * Il riferimento dell'ordine a cui questa comanda si **aggiunge** (stesso
   * conto, stesso tavolo), per i fornitori che lo permettono (Tilby). Assente
   * per un ordine nuovo.
   */
  aggiuntaA?: string;
  [altro: string]: unknown;
};

export type EsitoInvioOrdine =
  | { stato: "SYNCED"; idEsterno: string | null; giaInviato: boolean }
  | { stato: "PENDING_SYNC"; codiceErrore: string | null }
  | { stato: "FAILED"; codiceErrore: string; correlationId?: string };

function metadati(m: Pick<ExternalEntityMapping, "metadata">): MetadatiOrdine | null {
  const x = m.metadata as MetadatiOrdine | null;
  return x && typeof x === "object" && x.invio ? x : null;
}

/**
 * Manda un ordine alla cassa collegata. `internalId` è l'identificativo
 * Foodtech di ciò che si manda (la comanda); `ordine.riferimento` è la chiave
 * di idempotenza verso la cassa.
 */
export async function inviaOrdine(
  installazione: { id: string; venueId: string },
  internalId: string,
  ordine: OrdineDaInviare,
  opzioni: {
    aggiuntaA?: string;
    /**
     * Il filo della correlazione di chi manda (la console di certificazione):
     * lo portano le richieste al fornitore e resta nella mappatura
     * (`invio.correlationId`). Senza, ne nasce uno per tentativo.
     */
    correlationId?: string;
  } = {},
): Promise<EsitoInvioOrdine> {
  const i = await db.integrationInstallation.findFirst({
    where: { id: installazione.id, venueId: installazione.venueId },
  });
  const adattatore = i ? adattatoreDi(i.integrationSlug) : null;
  if (!i || !adattatore || !eAdattatorePos(adattatore) || !adattatore.pos.createOrder) {
    throw new ErroreIntegrazione("NOT_SUPPORTED", "Questa integrazione non riceve ordini");
  }
  if (i.status !== "ACTIVE" || !i.enabledCapabilities.includes("orders.write")) {
    throw new ErroreIntegrazione("INVALID_CONFIGURATION", "Invio ordini non attivo su questa integrazione");
  }
  if (opzioni.aggiuntaA && !adattatore.pos.updateOrder) {
    throw new ErroreIntegrazione("NOT_SUPPORTED", "Questa cassa non accetta aggiunte a un ordine esistente");
  }

  const adesso = new Date().toISOString();
  const iniziali: MetadatiOrdine = {
    invio: { stato: "PENDING_SYNC", tentativi: 0, idEsterno: null, codiceErrore: null, aggiornatoIl: adesso },
    ordine,
    ...(opzioni.aggiuntaA ? { aggiuntaA: opzioni.aggiuntaA } : {}),
  };
  const chiave = {
    installationId_entityType_externalId: { installationId: i.id, entityType: "ORDER", externalId: ordine.riferimento },
  };
  let riga: ExternalEntityMapping;
  try {
    riga = await db.externalEntityMapping.upsert({
      where: chiave,
      create: {
        venueId: i.venueId,
        installationId: i.id,
        entityType: "ORDER",
        externalId: ordine.riferimento,
        externalLabel: ordine.tavolo ? `Tavolo ${ordine.tavolo}` : ordine.riferimento.slice(0, 200),
        internalId,
        metadata: iniziali as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  } catch (err) {
    /* L'upsert di Prisma non è atomico: due invii nello stesso istante
       vedono entrambi «non c'è» e il secondo inserimento trova il vincolo
       unico. Vuol dire che la riga c'è: si rilegge, e si prosegue con quella.
       Trovato dalla prova con tre invii contemporanei. */
    if (!(err instanceof PrismaErrore.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    riga = await db.externalEntityMapping.findUniqueOrThrow({ where: chiave });
  }

  const m = metadati(riga);
  if (m?.invio.stato === "SYNCED") return { stato: "SYNCED", idEsterno: m.invio.idEsterno, giaInviato: true };

  const esito = await tentaInvio(i.venueId, riga.id, opzioni.correlationId);
  if (esito.stato === "PENDING_SYNC") await accodaRiprova(i.venueId, riga.id);
  return esito;
}

async function accodaRiprova(venueId: string, mappingId: string) {
  try {
    await enqueueJob({
      kind: TIPO_LAVORO_ORDINE,
      venueId,
      payload: { venueId, mappingId },
      dedupeKey: `${TIPO_LAVORO_ORDINE}:${mappingId}`,
      runAt: new Date(Date.now() + 60_000),
      maxAttempts: 8,
    });
  } catch (err) {
    /* Due invii contemporanei della stessa comanda accodano la stessa
       riprova: `enqueueJob` legge e poi scrive, e il secondo trova il vincolo
       unico della chiave. Vuol dire che la riprova è già in coda — che è ciò
       che si voleva. */
    if (!(err instanceof PrismaErrore.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
  }
}

/**
 * Un tentativo. Chiamato da `inviaOrdine` e dalla coda.
 */
export async function tentaInvio(venueId: string, mappingId: string, correlazione?: string): Promise<EsitoInvioOrdine> {
  const riga = await db.externalEntityMapping.findFirst({ where: { id: mappingId, venueId, entityType: "ORDER" } });
  const m = riga ? metadati(riga) : null;
  if (!riga || !m) throw new ErroreIntegrazione("NOT_FOUND", "Ordine da inviare non trovato");

  if (m.invio.stato === "SYNCED") return { stato: "SYNCED", idEsterno: m.invio.idEsterno, giaInviato: true };
  if (m.invio.stato === "FAILED") return { stato: "FAILED", codiceErrore: m.invio.codiceErrore ?? "UNKNOWN" };
  const appeso =
    m.invio.stato === "SENDING" && Date.now() - riga.updatedAt.getTime() > MINUTI_INVIO_APPESO * 60_000;
  if (m.invio.stato === "SENDING" && !appeso) return { stato: "PENDING_SYNC", codiceErrore: null };

  /* Un'aggiunta aspetta che l'ordine a cui si aggiunge sia arrivato alla
     cassa: senza il suo id non c'è un conto a cui accodarla. Non consuma un
     tentativo — non è colpa della cassa. */
  let idOrdineBase: string | null = null;
  if (m.aggiuntaA) {
    const base = await db.externalEntityMapping.findFirst({
      where: { installationId: riga.installationId, venueId, entityType: "ORDER", externalId: m.aggiuntaA },
    });
    const mb = base ? metadati(base) : null;
    if (!mb || mb.invio.stato === "FAILED") {
      return { stato: "FAILED", codiceErrore: "ORDINE_BASE_NON_INVIATO" };
    }
    if (mb.invio.stato !== "SYNCED" || !mb.invio.idEsterno) return { stato: "PENDING_SYNC", codiceErrore: "ORDINE_BASE_IN_ATTESA" };
    idOrdineBase = mb.invio.idEsterno;
  }

  /* Un'integrazione disattivata (o sospesa da Foodtech) non manda niente,
     nemmeno gli ordini rimasti in coda: la comanda resta in attesa, senza
     consumare tentativi e senza chiamare il fornitore. */
  const i = await db.integrationInstallation.findFirstOrThrow({ where: { id: riga.installationId, venueId } });
  if (i.status !== "ACTIVE") return { stato: "PENDING_SYNC", codiceErrore: "INTEGRAZIONE_NON_ATTIVA" };

  /* --- La presa in carico: solo se la riga è ancora quella letta. --- */
  const tentativo = m.invio.tentativi + 1;
  const { count } = await db.externalEntityMapping.updateMany({
    where: { id: riga.id, updatedAt: riga.updatedAt },
    data: {
      metadata: {
        ...m,
        invio: { ...m.invio, stato: "SENDING", tentativi: tentativo, aggiornatoIl: new Date().toISOString() },
      } as unknown as Prisma.InputJsonValue,
    },
  });
  if (count === 0) return { stato: "PENDING_SYNC", codiceErrore: null };

  const adattatore = adattatoreDi(i.integrationSlug);
  const correlationId = correlazione ?? nuovoCorrelationId();
  const inizio = Date.now();

  /* L'esito si UNISCE ai metadati (`stato-mappature.ts`): un webhook arrivato
     durante l'invio (Tilby notifica la vendita appena creata) ha già scritto
     lo stato presso la cassa, e riscrivere tutta la riga lo cancellerebbe.
     Un'aggiunta il cui conto è già chiuso diventa un ordine nuovo (vedi sotto):
     smette di essere un'aggiunta. */
  let diventataNuova = false;
  const scrivi = (invio: Partial<MetadatiOrdine["invio"]>) =>
    unisciMetadati(
      riga.id,
      {
        invio: { ...m.invio, tentativi: tentativo, ...invio, correlationId, aggiornatoIl: new Date().toISOString() },
        ...(diventataNuova ? { contoPrecedenteChiuso: m.aggiuntaA } : {}),
      },
      diventataNuova ? ["aggiuntaA"] : [],
    );

  try {
    if (!adattatore || !eAdattatorePos(adattatore) || !adattatore.pos.createOrder) {
      throw new ErroreIntegrazione("NOT_SUPPORTED", "Questa integrazione non riceve ordini");
    }
    const ctx = await contestoFresco(i, origineDellaPiattaforma(), correlationId);
    let r: { externalId: string | null };
    if (idOrdineBase) {
      if (!adattatore.pos.updateOrder) throw new ErroreIntegrazione("NOT_SUPPORTED", "Questa cassa non accetta aggiunte");
      try {
        await adattatore.pos.updateOrder(ctx, idOrdineBase, m.ordine);
        r = { externalId: idOrdineBase };
      } catch (errAggiunta) {
        /* Il conto è stato chiuso in cassa (pagato) prima che arrivasse
           l'aggiunta: la comanda non si perde e non fallisce, apre un conto
           nuovo. Da qui in poi è lei la base per le aggiunte di quel tavolo,
           e il conto vecchio risulta chiuso. È il «se il tavolo non ha un
           conto aperto, crealo» — deciso qui, non nell'interfaccia. */
        if (!(errAggiunta instanceof ErroreIntegrazione) || !errAggiunta.dettaglio.contoChiuso) throw errAggiunta;
        await aggiornaEsitoMappatura({ id: riga.installationId, venueId }, "ORDER", m.aggiuntaA!, {
          fonte: "ripiego",
          stato: "CLOSED",
          campi: { motivo: "conto chiuso presso la cassa, scoperto aggiungendo una comanda" },
        });
        diventataNuova = true;
        idOrdineBase = null;
        r = await adattatore.pos.createOrder(ctx, m.ordine);
      }
    } else {
      r = await adattatore.pos.createOrder(ctx, m.ordine);
    }
    await scrivi({ stato: "SYNCED", idEsterno: r.externalId, codiceErrore: null });
    logEvento("integrazione.ordine_inviato", {
      slug: i.integrationSlug,
      venue: venueId,
      operazione: idOrdineBase ? "updateOrder" : "createOrder",
      riferimento: m.ordine.riferimento,
      externalId: r.externalId,
      tentativo,
      durataMs: Date.now() - inizio,
      corr: correlationId,
    });
    return { stato: "SYNCED", idEsterno: r.externalId, giaInviato: false };
  } catch (err) {
    const e = normalizzaErrore(err, correlationId);
    const riprova = e.riprovabile;
    await scrivi({ stato: riprova ? "PENDING_SYNC" : "FAILED", codiceErrore: e.codice });
    if (ERRORI_DI_ACCESSO.has(e.codice)) await registraErrore(i, e);
    logAttenzione("integrazione.ordine_non_inviato", {
      slug: i.integrationSlug,
      venue: venueId,
      operazione: idOrdineBase ? "updateOrder" : "createOrder",
      riferimento: m.ordine.riferimento,
      codice: e.codice,
      status: e.dettaglio.status ?? null,
      riprova,
      tentativo,
      durataMs: Date.now() - inizio,
      corr: correlationId,
    });
    return riprova
      ? { stato: "PENDING_SYNC", codiceErrore: e.codice }
      : { stato: "FAILED", codiceErrore: e.codice, correlationId };
  }
}

const PayloadOrdine = z.object({ venueId: z.string(), mappingId: z.string() });

/**
 * Il gestore di `integration.order`. Finché l'ordine resta in attesa,
 * solleva: la coda riprova con la sua attesa crescente.
 */
export async function lavoroOrdine(payload: unknown, job: JobRef) {
  const { venueId, mappingId } = PayloadOrdine.parse(payload);
  const esito = await tentaInvio(venueId, mappingId);
  if (esito.stato === "PENDING_SYNC" && job.attempts < job.maxAttempts) {
    throw new Error(`ordine_in_attesa:${esito.codiceErrore ?? "in_corso"}`);
  }
}

/** Lo stato dell'invio di un ordine, per chi deve mostrarlo. */
export async function statoInvio(installazione: { id: string; venueId: string }, riferimento: string) {
  const riga = await db.externalEntityMapping.findFirst({
    where: { installationId: installazione.id, venueId: installazione.venueId, entityType: "ORDER", externalId: riferimento },
  });
  return riga ? metadati(riga)?.invio ?? null : null;
}
