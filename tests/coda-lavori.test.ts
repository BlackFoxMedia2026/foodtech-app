import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  enqueueJob,
  jobQueueHealth,
  reapStuckJobs,
  retryJob,
  runDueJobs,
  MINUTI_APPESO,
  GIORNI_DI_STORIA,
  PRIORITA_PER_TIPO,
  pulisciLavoriVecchi,
  QUOTA_PER_GRUPPO,
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

/* -------------------------------------------------------------------------- */
/*  Priorità e quote per fornitore                                            */
/* -------------------------------------------------------------------------- */

describe("chi passa prima", () => {
  /** Handler per i tipi veri, che contano l'ordine in cui sono stati chiamati. */
  function registro() {
    const ordine: string[] = [];
    const handlers: JobHandlers = {
      "message.send": async () => {
        ordine.push("messaggio");
      },
      "campaign.send": async () => {
        ordine.push("campagna");
      },
      "automation.run": async () => {
        ordine.push("automazione");
      },
    };
    return { ordine, handlers };
  }

  it("la priorità la decide il tipo, senza doverla ricordare a chi accoda", async () => {
    const messaggio = await enqueueJob({ kind: "message.send", payload: {}, venueId });
    const campagna = await enqueueJob({ kind: "campaign.send", payload: {}, venueId });
    const automazione = await enqueueJob({ kind: "automation.run", payload: {}, venueId });

    const righe = await db.backgroundJob.findMany({
      where: { id: { in: [messaggio.jobId, campagna.jobId, automazione.jobId] } },
      select: { id: true, priority: true },
    });
    const per = new Map(righe.map((r) => [r.id, r.priority]));
    expect(per.get(messaggio.jobId)).toBe(PRIORITA_PER_TIPO["message.send"]);
    expect(per.get(automazione.jobId)).toBe(PRIORITA_PER_TIPO["automation.run"]);
    expect(per.get(campagna.jobId)).toBe(PRIORITA_PER_TIPO["campaign.send"]);
    expect(per.get(messaggio.jobId)!).toBeLessThan(per.get(campagna.jobId)!);
  });

  it("un messaggio a un ospite passa davanti a una campagna messa in coda prima", async () => {
    /**
     * È il difetto per cui esiste la priorità: quattrocento email di una
     * campagna accodate alle 20:00 stavano davanti alla conferma di una
     * prenotazione arrivata alle 20:01, e il cliente aspettava di sapere se
     * aveva un tavolo dietro una spedizione pubblicitaria.
     */
    const prima = new Date(Date.now() - 10 * 60_000);
    for (let i = 0; i < 5; i++) {
      await enqueueJob({ kind: "campaign.send", payload: { i }, venueId, runAt: prima });
    }
    await enqueueJob({ kind: "message.send", payload: { urgente: true }, venueId });

    const { ordine, handlers } = registro();
    await runDueJobs({ handlers });

    expect(ordine[0]).toBe("messaggio");
  });

  it("a parità di priorità vince chi aspetta da più tempo", async () => {
    const vecchio = await enqueueJob({
      kind: "message.send",
      payload: { quale: "vecchio" },
      venueId,
      runAt: new Date(Date.now() - 5 * 60_000),
    });
    await enqueueJob({ kind: "message.send", payload: { quale: "nuovo" }, venueId });

    const ordine: string[] = [];
    const handlers: JobHandlers = {
      "message.send": async (payload) => {
        ordine.push((payload as { quale: string }).quale);
      },
    };
    await runDueJobs({ handlers });
    expect(ordine).toEqual(["vecchio", "nuovo"]);
    expect(vecchio.duplicate).toBe(false);
  });

  it("una priorità dichiarata a mano vince su quella del tipo", async () => {
    const { jobId } = await enqueueJob({ kind: "campaign.send", payload: {}, venueId, priority: 1 });
    const riga = await db.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(riga.priority).toBe(1);
  });
});

describe("la quota del fornitore", () => {
  it("un giro non spedisce più di quanto il fornitore accetti", async () => {
    const quanti = QUOTA_PER_GRUPPO.email + 5;
    for (let i = 0; i < quanti; i++) {
      await enqueueJob({ kind: "campaign.send", payload: { i }, venueId });
    }

    let chiamate = 0;
    const handlers: JobHandlers = {
      "campaign.send": async () => {
        chiamate += 1;
      },
    };
    const esito = await runDueJobs({ handlers });

    expect(chiamate).toBe(QUOTA_PER_GRUPPO.email);
    expect(esito.rinviatiPerQuota).toBe(5);
  });

  it("chi resta fuori per la quota non consuma tentativi: non è successo niente", async () => {
    const quanti = QUOTA_PER_GRUPPO.email + 3;
    for (let i = 0; i < quanti; i++) {
      await enqueueJob({ kind: "campaign.send", payload: { i }, venueId });
    }
    const handlers: JobHandlers = { "campaign.send": async () => {} };
    await runDueJobs({ handlers });

    const rimasti = await db.backgroundJob.findMany({
      where: { venueId, status: "PENDING" },
      select: { attempts: true, lastError: true },
    });
    expect(rimasti).toHaveLength(3);
    for (const r of rimasti) {
      expect(r.attempts).toBe(0);
      expect(r.lastError).toBeNull();
    }
  });

  it("la quota di un gruppo non ferma i lavori di un altro", async () => {
    // È metà del motivo per cui la quota esiste: una spedizione piena non
    // deve occupare tutto il giro.
    for (let i = 0; i < QUOTA_PER_GRUPPO.email + 10; i++) {
      await enqueueJob({ kind: "campaign.send", payload: { i }, venueId });
    }
    await enqueueJob({ kind: "prova.lavoro", payload: { n: 99 }, venueId });

    let campagne = 0;
    const chiamate: string[] = [];
    const handlers: JobHandlers = {
      "campaign.send": async () => {
        campagne += 1;
      },
      "prova.lavoro": async (payload) => {
        chiamate.push(JSON.stringify(payload));
      },
    };
    await runDueJobs({ handlers });

    expect(campagne).toBe(QUOTA_PER_GRUPPO.email);
    // Il lavoro senza gruppo è stato fatto nello stesso giro, nonostante la
    // coda fosse piena di campagne.
    expect(chiamate).toHaveLength(1);
  });

  it("il lotto resta un tetto: la quota non lo allarga", async () => {
    for (let i = 0; i < 10; i++) {
      await enqueueJob({ kind: "prova.lavoro", payload: { i }, venueId });
    }
    const { chiamate, handlers } = contatore();
    const esito = await runDueJobs({ handlers, limit: 4 });
    expect(chiamate).toHaveLength(4);
    expect(esito.claimed).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/*  La storia che si tiene, e quella che non si butta                         */
/* -------------------------------------------------------------------------- */

describe("la pulizia della storia", () => {
  it("i lavori conclusi vecchi si tolgono, quelli recenti restano", async () => {
    const { jobId: vecchio } = await accoda({ payload: { quale: "vecchio" } });
    const { jobId: recente } = await accoda({ payload: { quale: "recente" } });
    await db.backgroundJob.update({
      where: { id: vecchio },
      data: { status: "DONE", finishedAt: new Date(Date.now() - (GIORNI_DI_STORIA + 1) * 86_400_000) },
    });
    await db.backgroundJob.update({
      where: { id: recente },
      data: { status: "DONE", finishedAt: new Date() },
    });

    const quanti = await pulisciLavoriVecchi();
    expect(quanti).toBe(1);
    expect(await db.backgroundJob.findUnique({ where: { id: vecchio } })).toBeNull();
    expect(await db.backgroundJob.findUnique({ where: { id: recente } })).not.toBeNull();
  });

  it("un lavoro NON riuscito non si tocca mai, quanto vecchio sia", async () => {
    /**
     * È la stessa ragione per cui resta in tabella invece di sparire: un
     * invio che non è andato è una cosa che qualcuno deve poter vedere, anche
     * fra sei mesi. Se un giorno saranno troppi, il problema non è la
     * tabella.
     */
    const { jobId } = await accoda();
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(Date.now() - 400 * 86_400_000),
        lastError: "il fornitore ha detto no",
      },
    });

    expect(await pulisciLavoriVecchi()).toBe(0);
    const riga = await db.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(riga.status).toBe("FAILED");
    expect(riga.lastError).toContain("il fornitore");
  });

  it("un lavoro ancora in attesa non si tocca, anche se accodato mesi fa", async () => {
    const { jobId } = await accoda({ runAt: new Date(Date.now() - 200 * 86_400_000) });
    expect(await pulisciLavoriVecchi()).toBe(0);
    expect(await db.backgroundJob.findUnique({ where: { id: jobId } })).not.toBeNull();
  });
});
