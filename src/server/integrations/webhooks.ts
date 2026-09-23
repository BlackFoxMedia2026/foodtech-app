import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAttenzione, logErrore } from "@/lib/observability";
import { enqueueJob } from "@/server/jobs/queue";
import { adattatoreDi } from "./adapters";
import { leggiSegreti } from "./credenziali";
import { clientPer, vistaPerAdattatore } from "./installazioni";
import { normalizzaErrore, nuovoCorrelationId } from "./errori";
import { redigi } from "./redazione";
import { gestisciEvento } from "./eventi";
import { origineDellaPiattaforma } from "./sync";
import type { EventoNormalizzato } from "./dominio";

/**
 * **La pipeline dei webhook delle integrazioni.**
 *
 * ```
 * POST /api/integrations/webhooks/<fornitore>/<chiave dell'installazione>
 *    ↓ 1. l'installazione, dalla chiave nell'indirizzo          (404 se non c'è)
 *    ↓ 2. la prova che viene dal fornitore (firma, Basic Auth)  (401 se no)
 *    ↓ 3. l'evento letto e tradotto dall'adattatore
 *    ↓ 4. salvato su WebhookEvent, con la chiave di idempotenza (duplicato → 200, fermo)
 *    ↓ 5. lavorato dal gestore (eventi.ts)                      (errore → in coda, riprova)
 * ```
 *
 * La rotta chiama `riceviWebhook` e basta: nessuna regola di dominio sta
 * nella rotta.
 *
 * ## L'idempotenza, perché è la parte che conta
 *
 * I fornitori ritentano: quando non rispondiamo abbastanza in fretta, quando
 * rispondiamo 500, a volte senza motivo. Un ordine lavorato due volte è un
 * ordine doppio — e un ristoratore con due comande uguali in cucina.
 *
 * Quindi l'evento si **scrive prima di lavorarlo**, sotto il vincolo unico
 * `(provider, providerEventId)` di `WebhookEvent` — lo stesso che protegge
 * gli incassi di Stripe. La chiave è `<installazione>:<id evento>`: il
 * database, non un controllo in memoria, decide se è nuovo. Due copie dello
 * stesso evento arrivate nello stesso millisecondo: una entra, l'altra trova
 * il vincolo.
 *
 * E il lavoro si **prende in carico** con una scrittura condizionata
 * (`RECEIVED | FAILED → PROCESSING`): la rotta e la coda che riprova non
 * lavorano mai lo stesso evento insieme.
 */

export const DIMENSIONE_MASSIMA = 256 * 1024;
export const TIPO_LAVORO_WEBHOOK = "integration.webhook";

export type EsitoWebhook =
  | { status: 200; corpo: { ok: true; ripetuto?: boolean; ignorato?: string } }
  | { status: 202; corpo: { ok: true; inCoda: true } }
  | { status: 401 | 404 | 413 | 400; corpo: { error: string } };

export async function riceviWebhook(input: {
  slug: string;
  chiave: string;
  corpo: string;
  intestazioni: Headers;
}): Promise<EsitoWebhook> {
  if (input.corpo.length > DIMENSIONE_MASSIMA) return { status: 413, corpo: { error: "troppo_grande" } };

  /* 1. L'installazione. Chiave e fornitore insieme: la chiave di Lightspeed
        mandata all'indirizzo di un altro fornitore non trova niente. */
  const i = await db.integrationInstallation.findFirst({
    where: { webhookKey: input.chiave, integrationSlug: input.slug, NOT: { status: "NOT_INSTALLED" } },
  });
  const adattatore = adattatoreDi(input.slug);
  if (!i || !adattatore?.verificaWebhook || !adattatore.riceviWebhook) {
    return { status: 404, corpo: { error: "non_trovato" } };
  }

  /* 2. La prova che viene dal fornitore, con i segreti di **questa**
        installazione. */
  const lette = await leggiSegreti(i).catch(() => null);
  const correlationId = nuovoCorrelationId();
  const ctx = {
    installazione: vistaPerAdattatore(i),
    segreti: lette?.segreti ?? {},
    http: clientPer(input.slug, correlationId),
    correlationId,
    origine: origineDellaPiattaforma(),
  };
  const w = { corpo: input.corpo, intestazioni: input.intestazioni };
  if (!lette || !adattatore.verificaWebhook(ctx, w)) {
    // Il corpo non si registra: potrebbe contenere dati di clienti, e chi
    // non è il fornitore non ci deve scrivere niente, nemmeno nei log.
    logAttenzione("integrazione.webhook_non_autenticato", { slug: input.slug, installazione: i.id });
    return { status: 401, corpo: { error: "non_autorizzato" } };
  }

  /* 3. Letto e tradotto. */
  let letto;
  try {
    letto = adattatore.riceviWebhook(ctx, w);
  } catch (err) {
    logErrore("integrazione.webhook_illeggibile", normalizzaErrore(err), { slug: input.slug, installazione: i.id });
    return { status: 400, corpo: { error: "illeggibile" } };
  }

  let payload: unknown;
  try {
    payload = redigi(JSON.parse(input.corpo));
  } catch {
    payload = { corpo: "[non JSON]" };
  }

  /* Un evento di un'altra sede arrivato a questo indirizzo non si lavora:
     si conserva, per capire come ci è arrivato. */
  const sedeDiversa =
    !!letto.sedeExternalId && !!i.externalLocationId && letto.sedeExternalId !== i.externalLocationId;
  const ignorato = sedeDiversa ? "sede_diversa" : i.status === "DISABLED" ? "integrazione_disattivata" : null;

  /* 4. Scritto prima di lavorarlo. */
  let eventoId: string;
  try {
    const riga = await db.webhookEvent.create({
      data: {
        provider: `integration:${input.slug}`,
        providerEventId: `${i.id}:${letto.idEvento}`,
        eventType: letto.tipo.slice(0, 100),
        payload: payload as Prisma.InputJsonValue,
        normalized: letto.evento as unknown as Prisma.InputJsonValue,
        installationId: i.id,
        venueId: i.venueId,
        status: ignorato ? "IGNORED" : "RECEIVED",
        error: ignorato,
        ...(ignorato ? { processedAt: new Date() } : {}),
      },
    });
    eventoId = riga.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: 200, corpo: { ok: true, ripetuto: true } };
    }
    throw err;
  }

  if (ignorato) return { status: 200, corpo: { ok: true, ignorato } };

  /* 5. Lavorato subito; se non riesce, la coda riprova. Al fornitore si
        risponde comunque «ricevuto»: l'evento è al sicuro da noi, e un suo
        ritentativo finirebbe comunque fermo al vincolo. */
  const esito = await lavoraEventoWebhook(eventoId);
  if (esito === "FAILED") {
    await enqueueJob({
      kind: TIPO_LAVORO_WEBHOOK,
      venueId: i.venueId,
      payload: { eventoId },
      dedupeKey: `${TIPO_LAVORO_WEBHOOK}:${eventoId}`,
      maxAttempts: 5,
      runAt: new Date(Date.now() + 60_000),
    });
    return { status: 202, corpo: { ok: true, inCoda: true } };
  }
  return { status: 200, corpo: { ok: true } };
}

/**
 * Lavora un evento salvato. Chiamata dalla rotta e dalla coda: la presa in
 * carico condizionata garantisce che non lo facciano insieme.
 */
export async function lavoraEventoWebhook(eventoId: string): Promise<"PROCESSED" | "IGNORED" | "FAILED" | "GIA_PRESO"> {
  const { count } = await db.webhookEvent.updateMany({
    where: { id: eventoId, status: { in: ["RECEIVED", "FAILED"] } },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  if (count === 0) return "GIA_PRESO";

  const e = await db.webhookEvent.findUniqueOrThrow({ where: { id: eventoId } });
  if (!e.installationId || !e.venueId || !e.normalized) {
    await db.webhookEvent.update({ where: { id: eventoId }, data: { status: "IGNORED", processedAt: new Date() } });
    return "IGNORED";
  }

  try {
    const esito = await gestisciEvento(
      { id: e.installationId, venueId: e.venueId },
      e.normalized as unknown as EventoNormalizzato,
      // L'id della riga: la mappatura aggiornata ricorda quale evento l'ha cambiata.
      { eventoId: e.id },
    );
    await db.webhookEvent.update({
      where: { id: eventoId },
      data: { status: esito, processedAt: new Date(), error: null },
    });
    return esito;
  } catch (err) {
    const n = normalizzaErrore(err);
    await db.webhookEvent.update({ where: { id: eventoId }, data: { status: "FAILED", error: n.riassunto() } });
    logErrore("integrazione.webhook_non_lavorato", n, { evento: eventoId });
    return "FAILED";
  }
}

const PayloadWebhook = z.object({ eventoId: z.string() });

/** Il gestore della coda per `integration.webhook`: riprova finché ha tentativi. */
export async function lavoroWebhook(payload: unknown) {
  const { eventoId } = PayloadWebhook.parse(payload);
  const esito = await lavoraEventoWebhook(eventoId);
  if (esito === "FAILED") throw new Error("evento_non_lavorato");
}
