import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  enqueueJob,
  jobQueueHealth,
  reapStuckJobs,
  retryJob,
  runDueJobs,
  MINUTI_APPESO,
  type EnqueueInput,
  type JobHandlers,
} from "@/server/jobs/queue";

/**
 * La coda dei lavori.
 *
 * Quello che deve reggere, in ordine di gravità:
 *
 * - **un lavoro non parte due volte.** È la ragione per cui la coda esiste:
 *   scrivere due volte a clienti veri non si annulla;
 * - **un lavoro non si perde.** Se il processo muore a metà, la riga torna in
 *   coda; se il fornitore dà errore, si riprova con attese crescenti;
 * - **un lavoro rotto si ferma e si vede.** Tentativi esauriti significa una
 *   riga «non riuscita» con il motivo scritto, non un silenzio.
 */

const db = new PrismaClient();
const PREFISSO = "test-coda-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

/** Un handler che conta le chiamate, per vedere se qualcosa è partito due volte. */
function contatore(esito?: "again" | "boom") {
  const chiamate: string[] = [];
  const handlers: JobHandlers = {
    "prova.lavoro": async (payload) => {
      chiamate.push(JSON.stringify(payload));
      if (esito === "boom") throw new Error("il fornitore ha detto no");
      if (esito === "again") return { again: true };
      return { done: true };
    },
  };
  return { chiamate, handlers };
}

async function accoda(extra: Partial<EnqueueInput> = {}) {
  return enqueueJob({
    kind: "prova.lavoro",
    payload: { n: 1 },
    venueId,
    ...extra,
  });
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
}, 60_000);

afterEach(async () => {
  await db.backgroundJob.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("messa in coda", () => {
  it("un lavoro senza chiave si accoda ogni volta", async () => {
    const a = await accoda();
    const b = await accoda();
    expect(a.jobId).not.toBe(b.jobId);
    expect(b.duplicate).toBe(false);
  });

  it("due volte la stessa chiave, mentre il primo aspetta, è un solo lavoro", async () => {
    const a = await accoda({ dedupeKey: `${PREFISSO}k1` });
    const b = await accoda({ dedupeKey: `${PREFISSO}k1` });
    expect(b.jobId).toBe(a.jobId);
    expect(b.duplicate).toBe(true);
    expect(await db.backgroundJob.count({ where: { dedupeKey: `${PREFISSO}k1` } })).toBe(1);
  });

  it("la stessa chiave dopo la fine riusa la riga e riparte da zero", async () => {
    const { handlers } = contatore();
    const a = await accoda({ dedupeKey: `${PREFISSO}k2` });
    await runDueJobs({ handlers });
    expect((await db.backgroundJob.findUnique({ where: { id: a.jobId } }))?.status).toBe("DONE");

    const b = await accoda({ dedupeKey: `${PREFISSO}k2` });
    expect(b.jobId).toBe(a.jobId);
    expect(b.duplicate).toBe(false);
    const riga = await db.backgroundJob.findUnique({ where: { id: b.jobId } });
    expect(riga?.status).toBe("PENDING");
    expect(riga?.attempts).toBe(0);
  });

  it("un lavoro programmato non parte prima della sua ora", async () => {
    const { chiamate, handlers } = contatore();
    await accoda({ runAt: new Date(Date.now() + 3_600_000) });
    const esito = await runDueJobs({ handlers });
    expect(esito.claimed).toBe(0);
    expect(chiamate).toHaveLength(0);
  });
});

describe("esecuzione", () => {
  it("un lavoro dovuto viene eseguito una volta e chiuso", async () => {
    const { chiamate, handlers } = contatore();
    const { jobId } = await accoda();
    const esito = await runDueJobs({ handlers });

    expect(chiamate).toHaveLength(1);
    expect(esito.done).toBe(1);
    const riga = await db.backgroundJob.findUnique({ where: { id: jobId } });
    expect(riga?.status).toBe("DONE");
    expect(riga?.attempts).toBe(1);
    expect(riga?.finishedAt).not.toBeNull();
  });

  it("il payload arriva al gestore così come è stato messo in coda", async () => {
    const { chiamate, handlers } = contatore();
    await accoda({ payload: { destinatario: "mario@test.local", n: 7 } });
    await runDueJobs({ handlers });
    expect(JSON.parse(chiamate[0])).toEqual({ destinatario: "mario@test.local", n: 7 });
  });

  it("due esecuzioni in parallelo non eseguono lo stesso lavoro due volte", async () => {
    // È la garanzia centrale: due cron sovrapposti non devono scrivere due
    // volte allo stesso ospite.
    const chiamate: string[] = [];
    const handlers: JobHandlers = {
      "prova.lavoro": async (_p, job) => {
        chiamate.push(job.id);
        await new Promise((r) => setTimeout(r, 30));
        return { done: true };
      },
    };
    await accoda();
    await accoda();
    await Promise.all([runDueJobs({ handlers }), runDueJobs({ handlers })]);
    expect(chiamate).toHaveLength(2);
    expect(new Set(chiamate).size).toBe(2);
  });

  it("un lavoro senza gestore non riprova all'infinito: si ferma e dice perché", async () => {
    const { jobId } = await enqueueJob({ kind: "prova.inesistente", payload: {}, venueId });
    const esito = await runDueJobs({ handlers: {} });
    expect(esito.failed).toBe(1);
    const riga = await db.backgroundJob.findUnique({ where: { id: jobId } });
    expect(riga?.status).toBe("FAILED");
    expect(riga?.lastError).toContain("nessun gestore");
  });

  it("finito il tempo si smette di prendere lavori, e i rimasti restano in coda", async () => {
    const { handlers } = contatore();
    await accoda();
    await accoda();
    await accoda();
    // Budget già esaurito al primo controllo.
    const esito = await runDueJobs({ handlers, budgetMs: 0, elapsedMs: () => 1 });
    expect(esito.claimed).toBe(0);
    expect(esito.budgetExhausted).toBe(true);
    expect(await db.backgroundJob.count({ where: { venueId, status: "PENDING" } })).toBe(3);
  });
});

describe("errori e tentativi", () => {
  it("un errore rimanda il lavoro più in là, non lo perde", async () => {
    const { handlers } = contatore("boom");
    const { jobId } = await accoda();
    const esito = await runDueJobs({ handlers });

    expect(esito.retried).toBe(1);
    const riga = await db.backgroundJob.findUnique({ where: { id: jobId } });
    expect(riga?.status).toBe("PENDING");
    expect(riga?.attempts).toBe(1);
    expect(riga?.lastError).toContain("il fornitore ha detto no");
    // L'attesa cresce: non si ritenta al minuto successivo.
    expect(riga!.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
  });

  it("esauriti i tentativi il lavoro si ferma e resta visibile", async () => {
    const { handlers } = contatore("boom");
    const { jobId } = await accoda({ maxAttempts: 2 });

    // Primo tentativo: rimandato.
    await runDueJobs({ handlers });
    await db.backgroundJob.update({ where: { id: jobId }, data: { runAt: new Date() } });
    // Secondo: era l'ultimo.
    const esito = await runDueJobs({ handlers });

    expect(esito.failed).toBe(1);
    const riga = await db.backgroundJob.findUnique({ where: { id: jobId } });
    expect(riga?.status).toBe("FAILED");
    expect(riga?.attempts).toBe(2);
    expect(riga?.finishedAt).not.toBeNull();
  });

  it("chi cede il turno non consuma tentativi", async () => {
    const { handlers } = contatore("again");
    const { jobId } = await accoda({ maxAttempts: 2 });

    await runDueJobs({ handlers });
    await runDueJobs({ handlers });
    await runDueJobs({ handlers });

    const riga = await db.backgroundJob.findUnique({ where: { id: jobId } });
    // Tre giri e il lavoro è ancora in coda: se i rinvii contassero come
    // tentativi, un invio lungo sarebbe già «non riuscito».
    expect(riga?.status).toBe("PENDING");
    expect(riga?.attempts).toBe(0);
    expect(riga?.yields).toBe(3);
  });

  it("un lavoro interrotto a metà torna in coda", async () => {
    const { jobId } = await accoda();
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        startedAt: new Date(Date.now() - (MINUTI_APPESO + 1) * 60_000),
        attempts: 1,
      },
    });

    const ripresi = await reapStuckJobs();
    expect(ripresi).toBeGreaterThanOrEqual(1);
    const riga = await db.backgroundJob.findUnique({ where: { id: jobId } });
    expect(riga?.status).toBe("PENDING");
    // Il tentativo speso resta contato: un lavoro che fa morire il processo
    // non deve poter riprovare per sempre.
    expect(riga?.attempts).toBe(1);
  });

  it("un lavoro in corso da poco non viene toccato", async () => {
    const { jobId } = await accoda();
    await db.backgroundJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date(Date.now() - 60_000) },
    });
    await reapStuckJobs();
    expect((await db.backgroundJob.findUnique({ where: { id: jobId } }))?.status).toBe("RUNNING");
  });
});

describe("stato e ripresa manuale", () => {
  it("il pannello conta attesa, corso e non riusciti del solo locale", async () => {
    await accoda();
    await enqueueJob({ kind: "prova.lavoro", payload: {}, venueId: altroVenueId });
    const { jobId } = await accoda();
    await db.backgroundJob.update({
      where: { id: jobId },
      data: { status: "FAILED", lastError: "motivo di prova", finishedAt: new Date() },
    });

    const stato = await jobQueueHealth(venueId);
    expect(stato.inAttesa).toBe(1);
    expect(stato.nonRiusciti).toBe(1);
    expect(stato.ultimiErrori[0]?.lastError).toBe("motivo di prova");

    const altro = await jobQueueHealth(altroVenueId);
    expect(altro.inAttesa).toBe(1);
    expect(altro.nonRiusciti).toBe(0);
  });

  it("si riprova solo ciò che non è riuscito", async () => {
    const { jobId } = await accoda();
    await expect(retryJob(venueId, jobId)).rejects.toThrow("conflict");

    await db.backgroundJob.update({
      where: { id: jobId },
      data: { status: "FAILED", attempts: 4, lastError: "boom", finishedAt: new Date() },
    });
    const ripreso = await retryJob(venueId, jobId);
    expect(ripreso.status).toBe("PENDING");
    expect(ripreso.attempts).toBe(0);
    expect(ripreso.lastError).toBeNull();
  });

  it("il lavoro di un altro locale non si tocca", async () => {
    const { jobId } = await enqueueJob({ kind: "prova.lavoro", payload: {}, venueId: altroVenueId });
    await db.backgroundJob.update({ where: { id: jobId }, data: { status: "FAILED" } });
    await expect(retryJob(venueId, jobId)).rejects.toThrow("not_found");
  });
});
