import { logAttenzione, logErrore, logEvento } from "@/lib/observability";
import type { BackgroundJob, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * La coda dei lavori, su Postgres.
 *
 * Prima ogni invio stava dentro la richiesta HTTP che l'aveva chiesto:
 * l'invio di una campagna sincronizzava i contatti col fornitore email uno per
 * uno, dentro il clic del ristoratore. Con trenta destinatari andava; con
 * trecento la richiesta scadeva a metà e restava una campagna in uno stato che
 * nessuno sapeva leggere — parte dei contatti sincronizzati, nessun invio,
 * nessun errore mostrato.
 *
 * Le regole che rendono questa coda affidabile senza aggiungere servizi:
 *
 * - **Chi chiede non aspetta.** L'API scrive una riga e risponde. Il lavoro lo
 *   fa il cron, ogni minuto.
 * - **Un lavoro non parte due volte.** Si prende in carico con una scrittura
 *   condizionata (`PENDING` → `RUNNING`): se due esecuzioni si sovrappongono,
 *   la seconda trova zero righe aggiornate e passa oltre.
 * - **Un lavoro può cedere il turno.** Un handler che ha ancora da fare
 *   restituisce `{ again: true }` e riprende al giro dopo: così un budget di
 *   pochi secondi per esecuzione basta anche per mille destinatari.
 * - **Niente lavori appesi per sempre.** Se la funzione muore a metà, la riga
 *   resta `RUNNING`: dopo `MINUTI_APPESO` viene rimessa in coda. È il motivo
 *   per cui i tentativi si contano quando il lavoro *parte*, non quando
 *   finisce — altrimenti un lavoro che fa morire il processo ci riproverebbe
 *   all'infinito.
 * - **Un errore definitivo resta visibile.** Tentativi esauriti significa
 *   `FAILED` in tabella, con il motivo: un invio che non è partito e sparisce
 *   è peggio di uno che non è partito e si vede.
 */

/** Quanto attendere prima del tentativo numero N (il primo è 1). */
const ATTESA_MIN = [1, 5, 20, 60];

/** Dopo quanto un lavoro «in corso» si considera morto e torna in coda. */
export const MINUTI_APPESO = 10;

/**
 * Quante volte un lavoro può cedere il turno prima di essere considerato
 * rotto. Un invio a mille destinatari a lotti di venticinque cede quaranta
 * volte: il tetto è alto perché deve fermare solo i cicli infiniti.
 */
const RINVII_MASSIMI = 500;

/** Quanti lavori guardare al massimo in un'esecuzione del cron. */
export const LOTTO_PREDEFINITO = 25;

/**
 * Quanto tempo può durare un'esecuzione. Le funzioni serverless hanno un
 * limite: si smette prima di raggiungerlo e si riprende al giro dopo, invece
 * di essere interrotti nel mezzo di un invio.
 */
export const BUDGET_MS_PREDEFINITO = 25_000;

/* -------------------------------------------------------------------------- */
/*  Priorità e quote                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Quanto conta arrivare prima, per tipo di lavoro.
 *
 * Senza questa tabella la coda era in ordine di orario, e quattrocento email
 * di una campagna messe in coda alle 20:00 stavano davanti alla **conferma di
 * una prenotazione** arrivata alle 20:01. Non è un dettaglio di
 * prestazioni: è un cliente che aspetta la sua email dietro una spedizione
 * pubblicitaria, e che intanto non sa se ha un tavolo.
 *
 * Tre livelli, e il criterio è **chi sta aspettando**:
 *
 * - **10 — qualcuno aspetta adesso.** Un messaggio a un ospite: conferma,
 *   promemoria, «il tavolo è pronto». Se non arriva subito non serve più;
 * - **50 — lavoro del locale.** Le automazioni: capiscono chi tocca oggi e
 *   mettono in coda i messaggi. Vanno fatte oggi, non in questo minuto;
 * - **100 — spedizioni.** Le campagne: partono quando la coda ha spazio, e
 *   nessuno le sta aspettando col telefono in mano.
 */
export const PRIORITA_PER_TIPO: Record<string, number> = {
  "message.send": 10,
  "automation.run": 50,
  "campaign.send": 100,
};

/** La priorità di un lavoro che non è in tabella: in mezzo, mai davanti. */
export const PRIORITA_PREDEFINITA = 100;

export function prioritaDi(kind: string): number {
  return PRIORITA_PER_TIPO[kind] ?? PRIORITA_PREDEFINITA;
}

/**
 * Quanti lavori dello stesso gruppo si possono fare in un giro.
 *
 * Serve a due cose diverse che hanno la stessa soluzione:
 *
 * - **il fornitore ha dei limiti.** Brevo accetta un certo numero di
 *   chiamate al minuto: mandargliene duecento in venticinque secondi
 *   significa farsi rifiutare le ultime, e un rifiuto del fornitore diventa
 *   un tentativo bruciato per un messaggio che non aveva niente di storto;
 * - **una spedizione non deve occupare tutta la coda.** Anche con le
 *   priorità, un lotto pieno di campagne lascerebbe zero spazio a un
 *   messaggio che arriva *durante* il giro. Con la quota, un giro non è mai
 *   tutto di uno stesso gruppo.
 *
 * Il gruppo è il fornitore, non il tipo: `message.send` e `campaign.send`
 * passano dalla stessa porta e vanno contati insieme.
 */
export const GRUPPO_PER_TIPO: Record<string, string> = {
  "message.send": "email",
  "campaign.send": "email",
};

export const QUOTA_PER_GRUPPO: Record<string, number> = {
  // Venti invii per giro, un giro al minuto: 1.200 all'ora, dentro i limiti
  // di qualunque fornitore, e con spazio per tutto il resto.
  email: 20,
};

export function gruppoDi(kind: string): string | null {
  return GRUPPO_PER_TIPO[kind] ?? null;
}

export type JobOutcome =
  /** Finito. */
  | { done: true }
  /** C'è ancora da fare: rimettimi in coda. */
  | { again: true; delayMs?: number };

export type JobRef = Pick<BackgroundJob, "id" | "kind" | "attempts" | "maxAttempts" | "yields" | "venueId">;

export type JobHandler = (payload: unknown, job: JobRef) => Promise<JobOutcome | void>;

/** L'insieme degli handler: lo passa chi esegue, così la coda resta neutra. */
export type JobHandlers = Record<string, JobHandler>;

export type EnqueueInput = {
  kind: string;
  payload: Prisma.InputJsonValue;
  venueId?: string | null;
  /** Due lavori con la stessa chiave non coesistono in coda. */
  dedupeKey?: string | null;
  runAt?: Date;
  maxAttempts?: number;
  /**
   * Quanto conta arrivare prima. Quando non si dice, la decide il tipo
   * (`PRIORITA_PER_TIPO`): chi mette in coda non deve ricordarsela, e due
   * punti del codice che accodano lo stesso tipo non possono dargli due
   * urgenze diverse.
   */
  priority?: number;
};

export type EnqueueResult = {
  jobId: string;
  /** Vero quando esisteva già un lavoro in attesa con la stessa chiave. */
  duplicate: boolean;
};

/**
 * Mette un lavoro in coda.
 *
 * Con una `dedupeKey`: se un lavoro con quella chiave è in attesa o in corso,
 * non se ne crea un altro e si restituisce quello — è il doppio clic sul
 * pulsante «invia» che non fa partire due campagne. Se invece quel lavoro è
 * già concluso (o non è mai riuscito), la riga viene riusata: la chiave
 * identifica il lavoro, non il tentativo.
 */
export async function enqueueJob(input: EnqueueInput): Promise<EnqueueResult> {
  const dati = {
    kind: input.kind,
    payload: input.payload,
    venueId: input.venueId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    runAt: input.runAt ?? new Date(),
    priority: input.priority ?? prioritaDi(input.kind),
    ...(input.maxAttempts !== undefined && { maxAttempts: input.maxAttempts }),
  };

  if (!dati.dedupeKey) {
    const creato = await db.backgroundJob.create({ data: dati });
    return { jobId: creato.id, duplicate: false };
  }

  const esistente = await db.backgroundJob.findUnique({ where: { dedupeKey: dati.dedupeKey } });
  if (esistente) {
    if (esistente.status === "PENDING" || esistente.status === "RUNNING") {
      return { jobId: esistente.id, duplicate: true };
    }
    const riusato = await db.backgroundJob.update({
      where: { id: esistente.id },
      data: {
        ...dati,
        status: "PENDING",
        attempts: 0,
        yields: 0,
        lastError: null,
        startedAt: null,
        finishedAt: null,
      },
    });
    return { jobId: riusato.id, duplicate: false };
  }

  const creato = await db.backgroundJob.create({ data: dati });
  return { jobId: creato.id, duplicate: false };
}

/**
 * Prende in carico un lavoro. La condizione `status: "PENDING"` dentro la
 * `updateMany` è ciò che rende l'operazione atomica: chi vede zero righe
 * aggiornate sa che qualcun altro è arrivato prima.
 */
async function claimJob(id: string, now: Date): Promise<BackgroundJob | null> {
  const { count } = await db.backgroundJob.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: now, attempts: { increment: 1 } },
  });
  if (count === 0) return null;
  return db.backgroundJob.findUnique({ where: { id } });
}

/** Rimette in coda i lavori rimasti «in corso» oltre il ragionevole. */
export async function reapStuckJobs(now: Date = new Date()): Promise<number> {
  const limite = new Date(now.getTime() - MINUTI_APPESO * 60_000);
  const { count } = await db.backgroundJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: limite } },
    data: { status: "PENDING", runAt: now, lastError: "ripreso dopo interruzione" },
  });
  // Uno o due capitano (una funzione interrotta a metà); molti, tutti i
  // minuti, vogliono dire che qualcosa si blocca sempre nello stesso punto.
  if (count > 0) logAttenzione("coda.ripresi_dopo_interruzione", { quanti: count });
  return count;
}

function prossimaAttesaMs(attempts: number): number {
  const minuti = ATTESA_MIN[Math.min(attempts, ATTESA_MIN.length) - 1] ?? 1;
  return minuti * 60_000;
}

export type RunSummary = {
  /** Lavori lasciati in coda perché il gruppo aveva finito la sua quota. */
  rinviatiPerQuota: number;
  claimed: number;
  done: number;
  requeued: number;
  retried: number;
  failed: number;
  recovered: number;
  /** Vero se il budget di tempo è finito prima dei lavori disponibili. */
  budgetExhausted: boolean;
};

export type RunOptions = {
  handlers: JobHandlers;
  now?: Date;
  limit?: number;
  budgetMs?: number;
  /** Solo per i test: sostituisce la misura del tempo trascorso. */
  elapsedMs?: () => number;
};

/**
 * Esegue i lavori dovuti.
 *
 * Non usa transazioni lunghe né blocchi sul database: un lavoro alla volta,
 * preso in carico e rilasciato. È più lento di una coda dedicata e va bene:
 * il collo di bottiglia è il fornitore email, non il database.
 */
export async function runDueJobs(options: RunOptions): Promise<RunSummary> {
  const now = options.now ?? new Date();
  const budgetMs = options.budgetMs ?? BUDGET_MS_PREDEFINITO;
  const limit = options.limit ?? LOTTO_PREDEFINITO;
  const avvio = Date.now();
  const trascorso = options.elapsedMs ?? (() => Date.now() - avvio);

  const summary: RunSummary = {
    rinviatiPerQuota: 0,
    claimed: 0,
    done: 0,
    requeued: 0,
    retried: 0,
    failed: 0,
    recovered: await reapStuckJobs(now),
    budgetExhausted: false,
  };

  /**
   * Prima la priorità, poi l'orario.
   *
   * Si prende qualche candidato in più del lotto (`limit`) perché le quote
   * per gruppo possono scartarne alcuni: senza margine, un lotto tutto di
   * campagne lascerebbe il giro mezzo vuoto pur avendo altri lavori pronti.
   */
  const candidati = await db.backgroundJob.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: [{ priority: "asc" }, { runAt: "asc" }],
    take: limit * 3,
    select: { id: true, kind: true },
  });

  /** Quanti ne ho già fatti per gruppo in questo giro. */
  const fattiPerGruppo = new Map<string, number>();

  for (const { id, kind } of candidati) {
    if (summary.claimed >= limit) break;
    if (trascorso() >= budgetMs) {
      summary.budgetExhausted = true;
      break;
    }

    // La quota del fornitore: superata, il lavoro resta in coda per il giro
    // dopo. Non è un errore e non consuma tentativi — non è successo niente.
    const gruppo = gruppoDi(kind);
    if (gruppo) {
      const quota = QUOTA_PER_GRUPPO[gruppo];
      const fatti = fattiPerGruppo.get(gruppo) ?? 0;
      if (quota !== undefined && fatti >= quota) {
        summary.rinviatiPerQuota += 1;
        continue;
      }
      fattiPerGruppo.set(gruppo, fatti + 1);
    }

    const job = await claimJob(id, new Date());
    if (!job) continue;
    summary.claimed += 1;

    const handler = options.handlers[job.kind];
    if (!handler) {
      // Un lavoro senza handler non è un errore da riprovare: è un lavoro che
      // questa versione del codice non sa fare.
      await db.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          lastError: `nessun gestore per «${job.kind}»`,
        },
      });
      summary.failed += 1;
      continue;
    }

    try {
      const esito = await handler(job.payload, job);
      if (esito && "again" in esito && esito.again) {
        if (job.yields + 1 >= RINVII_MASSIMI) {
          // Un lavoro che chiede sempre un altro giro non sta avanzando: si
          // ferma qui, con un motivo leggibile, invece di girare per giorni.
          await db.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              finishedAt: new Date(),
              yields: { increment: 1 },
              lastError: `fermato dopo ${RINVII_MASSIMI} rinvii senza concludere`,
            },
          });
          summary.failed += 1;
          continue;
        }
        await db.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            runAt: new Date(Date.now() + (esito.delayMs ?? 0)),
            // Un turno ceduto non è un tentativo andato male: il conteggio
            // torna indietro, altrimenti un invio lungo esaurirebbe i
            // tentativi solo per essere stato lungo. I rinvii si contano a
            // parte, ed è quel contatore a fermare i cicli infiniti.
            attempts: Math.max(0, job.attempts - 1),
            yields: { increment: 1 },
            startedAt: null,
          },
        });
        summary.requeued += 1;
        continue;
      }

      await db.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DONE", finishedAt: new Date(), lastError: null },
      });
      summary.done += 1;
    } catch (err) {
      const motivo = (err instanceof Error ? err.message : "errore sconosciuto").slice(0, 500);
      const esauriti = job.attempts >= job.maxAttempts;
      await db.backgroundJob.update({
        where: { id: job.id },
        data: esauriti
          ? { status: "FAILED", finishedAt: new Date(), lastError: motivo }
          : { status: "PENDING", runAt: new Date(Date.now() + prossimaAttesaMs(job.attempts)), lastError: motivo, startedAt: null },
      });
      if (esauriti) summary.failed += 1;
      else summary.retried += 1;
      // Due eventi diversi, perché richiedono due reazioni diverse: un
      // tentativo che riparte è normale, un lavoro che si arrende no.
      if (esauriti) {
        logErrore("coda.lavoro_arreso", err, {
          lavoro: job.id,
          tipo: job.kind,
          tentativi: job.attempts,
          venue: job.venueId,
        });
      } else {
        logAttenzione("coda.lavoro_riprovato", {
          lavoro: job.id,
          tipo: job.kind,
          tentativo: job.attempts,
          motivo,
        });
      }
    }
  }

  return summary;
}

/** Stato della coda per un locale: quello che l'interfaccia deve poter dire. */
export async function jobQueueHealth(venueId: string) {
  const [inAttesa, inCorso, nonRiusciti, ultimiErrori] = await Promise.all([
    db.backgroundJob.count({ where: { venueId, status: "PENDING" } }),
    db.backgroundJob.count({ where: { venueId, status: "RUNNING" } }),
    db.backgroundJob.count({ where: { venueId, status: "FAILED" } }),
    db.backgroundJob.findMany({
      where: { venueId, status: "FAILED" },
      orderBy: { finishedAt: "desc" },
      take: 5,
      select: { id: true, kind: true, lastError: true, finishedAt: true, attempts: true },
    }),
  ]);
  return { inAttesa, inCorso, nonRiusciti, ultimiErrori };
}

/**
 * Quanti giorni si tengono i lavori conclusi.
 *
 * Due settimane: abbastanza per rispondere a «è partito quel promemoria?»
 * guardando la coda, e poco perché la tabella non cresca per sempre. Ogni
 * messaggio a un ospite è una riga: un locale che manda cento messaggi al
 * giorno ne accumula trentaseimila in un anno, e la coda si legge a ogni
 * minuto.
 */
export const GIORNI_DI_STORIA = 14;

/**
 * Toglie dalla coda i lavori **conclusi** più vecchi della storia che
 * teniamo.
 *
 * I lavori **non riusciti non si toccano mai**, per la stessa ragione per cui
 * restano in tabella invece di sparire: un invio che non è andato è una cosa
 * che qualcuno deve poter vedere, anche fra sei mesi. Se un giorno saranno
 * troppi, il problema non è la tabella.
 *
 * Non è una pulizia cosmetica: è ciò che rende sostenibile una coda su
 * Postgres letta ogni minuto. E resta il posto dove `MessageLog` continua a
 * raccontare cosa è stato inviato — la storia dei messaggi non sta qui.
 */
export async function pulisciLavoriVecchi(
  opts: { now?: Date; giorni?: number } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const limite = new Date(now.getTime() - (opts.giorni ?? GIORNI_DI_STORIA) * 86_400_000);

  const { count } = await db.backgroundJob.deleteMany({
    where: { status: "DONE", finishedAt: { lt: limite } },
  });

  if (count > 0) logEvento("coda.storia_ripulita", { quanti: count, giorni: opts.giorni ?? GIORNI_DI_STORIA });
  return count;
}

/** Rimette in coda un lavoro non riuscito, azzerando i tentativi. */
export async function retryJob(venueId: string, jobId: string) {
  const job = await db.backgroundJob.findFirst({ where: { id: jobId, venueId } });
  if (!job) throw new Error("not_found");
  if (job.status !== "FAILED") throw new Error("conflict");
  return db.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      runAt: new Date(),
      attempts: 0,
      yields: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
    },
  });
}
