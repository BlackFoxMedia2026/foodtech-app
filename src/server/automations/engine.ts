import type { AutomationWorkflow, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  alreadySentToGuest,
  channelAvailable,
  enqueueMessage,
  lastMessageToGuest,
  sendMessage,
} from "@/server/messaging/send";
import { enqueueJob } from "@/server/jobs/queue";
import {
  AUTOMATIONS,
  automationKind,
  automationList,
  isAutomationKey,
  SILENZIO_GIORNI,
  TETTO_PER_ESECUZIONE,
  type AutomationActions,
  type AutomationConditions,
  type AutomationDefinition,
  type AutomationKey,
  type AutomationRecipient,
} from "./catalogue";

/**
 * Il motore: prende un'automazione accesa, capisce chi tocca oggi, e mette i
 * messaggi in coda.
 *
 * La domanda vera di un motore di automazioni non è «cosa sa fare», è **come
 * si evita che scriva a tutti tre volte**. Le difese, in ordine di
 * importanza:
 *
 * 1. **La finestra è stretta**, non «tutti quelli che...». Sta nel catalogo,
 *    perché è una proprietà di ogni automazione (`catalogue.ts`).
 * 2. **Un ospite riceve la stessa automazione una volta per periodo**
 *    (`cooldownDays`): gli auguri una volta all'anno, l'invito a tornare una
 *    volta e basta.
 * 3. **Silenzio dopo qualunque nostro messaggio** (`SILENZIO_GIORNI`): chi
 *    ieri ha ricevuto «com'è andata?» oggi non riceve altro.
 * 4. **Un tetto per esecuzione**: il resto slitta al giorno dopo. Un errore
 *    di configurazione fa danni a cinquanta persone, non a mille.
 * 5. **Il numero si vede prima di accendere.** `listAutomations` calcola i
 *    destinatari con *le stesse* regole dell'invio: se l'anteprima dicesse un
 *    numero e l'invio ne facesse un altro, non sarebbe un'anteprima.
 *
 * E una difesa che non è una regola: le automazioni nascono **spente**.
 */

/** Il numero regolabile, con il valore di default se non è stato toccato. */
function giorniDi(def: AutomationDefinition, wf: AutomationWorkflow | null): number {
  const conditions = (wf?.conditions as AutomationConditions | null) ?? null;
  const scelto = conditions?.giorni;
  if (typeof scelto !== "number") return def.knob.default;
  return Math.min(def.knob.max, Math.max(def.knob.min, scelto));
}

function testoDi(def: AutomationDefinition, wf: AutomationWorkflow | null): AutomationActions {
  const actions = (wf?.actions as AutomationActions | null) ?? null;
  return {
    subject: actions?.subject?.trim() || def.defaults.subject,
    intro: actions?.intro?.trim() || def.defaults.intro,
  };
}

/**
 * La riga dell'automazione per questo locale, creata spenta alla prima
 * occasione. Non c'è un momento di «installazione»: la prima volta che
 * qualcuno apre la pagina, o che gira il lavoro pianificato, le righe
 * esistono.
 */
export async function ensureAutomation(venueId: string, key: AutomationKey): Promise<AutomationWorkflow> {
  const def = AUTOMATIONS[key];
  const esistente = await db.automationWorkflow.findUnique({ where: { venueId_key: { venueId, key } } });
  if (esistente) return esistente;
  return db.automationWorkflow.create({
    data: {
      venueId,
      key,
      name: def.name,
      description: def.promise,
      trigger: def.trigger,
      active: false,
      conditions: { giorni: def.knob.default } as Prisma.InputJsonValue,
      actions: def.defaults as unknown as Prisma.InputJsonValue,
    },
  });
}

export type Scarti = {
  /** Ha ricevuto un nostro messaggio troppo di recente. */
  silenzio: number;
  /** Ha già ricevuto questa automazione nel periodo. */
  giaRicevuto: number;
};

export type Destinatari = {
  pronti: AutomationRecipient[];
  scartati: Scarti;
};

/**
 * Chi tocca davvero, applicando tutte le difese. Una sola funzione, usata sia
 * dall'anteprima sia dall'invio: è l'unico modo perché il numero mostrato sia
 * il numero vero.
 */
export async function resolveDestinatari(
  venueId: string,
  key: AutomationKey,
  giorni: number,
  now: Date
): Promise<Destinatari> {
  const def = AUTOMATIONS[key];
  const candidati = await def.audience(venueId, giorni, now);
  const kind = automationKind(key);
  const scartati: Scarti = { silenzio: 0, giaRicevuto: 0 };
  const pronti: AutomationRecipient[] = [];

  for (const c of candidati) {
    if (await alreadySentToGuest(c.guestId, kind, def.cooldownDays)) {
      scartati.giaRicevuto += 1;
      continue;
    }
    const ultimo = await lastMessageToGuest(c.guestId);
    if (ultimo && now.getTime() - ultimo.getTime() < SILENZIO_GIORNI * 86_400_000) {
      scartati.silenzio += 1;
      continue;
    }
    pronti.push(c);
  }

  return { pronti, scartati };
}

/* -------------------------------------------------------------------------- */
/*  Il messaggio                                                              */
/* -------------------------------------------------------------------------- */

function corpo(opts: { guestName: string; venueName: string; intro: string; url: string; venuePhone: string | null }) {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #2F1F11; max-width: 520px;">
      <p style="font-size:16px;">Ciao ${opts.guestName},</p>
      <p style="font-size:16px;">${opts.intro}</p>
      <p>
        <a href="${opts.url}"
           style="display:inline-block;background:#0F2920;color:#F2E7D0;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:15px;">
          Prenota un tavolo
        </a>
      </p>
      ${
        opts.venuePhone
          ? `<p style="font-size:13px;color:#6b5a45;">Se preferisci sentirci, siamo allo ${opts.venuePhone}.</p>`
          : ""
      }
      <p style="font-size:13px;color:#6b5a45;">A presto!<br/><strong>${opts.venueName}</strong></p>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Esecuzione                                                                */
/* -------------------------------------------------------------------------- */

export type AutomationRunResult = {
  key: AutomationKey;
  runId: string | null;
  inCoda: number;
  scartati: Scarti;
  /** Destinatari rimasti fuori dal tetto: li prende l'esecuzione di domani. */
  rimandati: number;
  outcome: "queued" | "nothing_to_do" | "inactive" | "no_channel";
};

/**
 * Esegue un'automazione per un locale.
 *
 * Non manda niente da qui: mette in coda. La consegna la fa
 * `/api/cron/jobs`, come per i promemoria — con i tentativi e la visibilità
 * degli errori che ne derivano.
 */
export async function runAutomation(
  venueId: string,
  key: AutomationKey,
  opts: { now?: Date; limit?: number } = {}
): Promise<AutomationRunResult> {
  const now = opts.now ?? new Date();
  const limite = opts.limit ?? TETTO_PER_ESECUZIONE;
  const def = AUTOMATIONS[key];
  const wf = await ensureAutomation(venueId, key);

  if (!wf.active) {
    return { key, runId: null, inCoda: 0, scartati: { silenzio: 0, giaRicevuto: 0 }, rimandati: 0, outcome: "inactive" };
  }
  if (!channelAvailable("EMAIL")) {
    // Senza canale non si scrive niente in tabella: sarebbe una riga al
    // giorno per dire una cosa che riguarda la configurazione.
    return {
      key,
      runId: null,
      inCoda: 0,
      scartati: { silenzio: 0, giaRicevuto: 0 },
      rimandati: 0,
      outcome: "no_channel",
    };
  }

  const giorni = giorniDi(def, wf);
  const { pronti, scartati } = await resolveDestinatari(venueId, key, giorni, now);
  if (pronti.length === 0) {
    return { key, runId: null, inCoda: 0, scartati, rimandati: 0, outcome: "nothing_to_do" };
  }

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { name: true, phone: true },
  });
  const testo = testoDi(def, wf);
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${base}/book?venue=${venueId}`;

  const run = await db.automationRun.create({
    data: {
      workflowId: wf.id,
      venueId,
      trigger: def.trigger,
      status: "RUNNING",
      startedAt: now,
      payload: { key, giorni, candidati: pronti.length } as Prisma.InputJsonValue,
    },
  });

  const daFare = pronti.slice(0, limite);
  let inCoda = 0;
  for (const destinatario of daFare) {
    const esito = await enqueueMessage({
      venueId,
      venueName: venue.name,
      channel: "EMAIL",
      to: destinatario.email,
      guestId: destinatario.guestId,
      workflowRunId: run.id,
      kind: automationKind(key),
      subject: testo.subject,
      body: corpo({
        guestName: destinatario.firstName,
        venueName: venue.name,
        intro: testo.intro,
        url,
        venuePhone: venue.phone,
      }),
      preview: `${def.name} — ${destinatario.reason}`,
    });
    if (esito.queued) inCoda += 1;
  }

  const rimandati = pronti.length - daFare.length;

  await db.automationRun.update({
    where: { id: run.id },
    data: {
      // «Riuscita» solo se non è rimasto niente da fare: se qualcuno è
      // rimasto fuori dal tetto, o un messaggio non è stato accodato,
      // l'esecuzione ha fatto una parte del lavoro e va detto.
      status: inCoda === daFare.length && rimandati === 0 ? "SUCCEEDED" : "PARTIAL",
      finishedAt: new Date(),
      result: { inCoda, scartati, rimandati } as Prisma.InputJsonValue,
    },
  });

  return { key, runId: run.id, inCoda, scartati, rimandati, outcome: "queued" };
}

/**
 * Mette in coda un'esecuzione per ogni automazione accesa, di ogni locale
 * attivo. La chiama il cron una volta al giorno.
 *
 * Anche questo passa dalla coda: se un locale ha trecento clienti da
 * contattare, non deve essere il cron a starci dietro. E la chiave di
 * deduplica contiene il giorno, così due passaggi lo stesso giorno non
 * generano due esecuzioni.
 */
export async function enqueueDueAutomations(now: Date = new Date()): Promise<{ accodate: number }> {
  const attive = await db.automationWorkflow.findMany({
    where: { active: true, key: { not: null }, Venue: { active: true } },
    select: { venueId: true, key: true },
  });

  const giorno = now.toISOString().slice(0, 10);
  let accodate = 0;
  for (const wf of attive) {
    if (!wf.key || !isAutomationKey(wf.key)) continue;
    const { duplicate } = await enqueueJob({
      kind: "automation.run",
      venueId: wf.venueId,
      payload: { venueId: wf.venueId, key: wf.key },
      dedupeKey: `automation.run:${wf.venueId}:${wf.key}:${giorno}`,
      maxAttempts: 3,
    });
    if (!duplicate) accodate += 1;
  }
  return { accodate };
}

/* -------------------------------------------------------------------------- */
/*  Lettura e modifica                                                        */
/* -------------------------------------------------------------------------- */

export type AutomationView = {
  key: AutomationKey;
  name: string;
  promise: string;
  why: string;
  knob: AutomationDefinition["knob"];
  active: boolean;
  giorni: number;
  subject: string;
  intro: string;
  /** Quante persone toccherebbe oggi, con tutte le difese già applicate. */
  toccherebbeOggi: number;
  /** Fino a tre esempi, col motivo: rende il numero controllabile. */
  esempi: { nome: string; reason: string }[];
  scartati: Scarti;
  ultimaEsecuzione: { quando: Date; inCoda: number } | null;
  inviatiUltimi30: number;
};

export async function listAutomations(venueId: string, now: Date = new Date()): Promise<AutomationView[]> {
  const viste: AutomationView[] = [];
  const trentaGiorni = new Date(now.getTime() - 30 * 86_400_000);

  for (const def of automationList()) {
    const wf = await ensureAutomation(venueId, def.key);
    const giorni = giorniDi(def, wf);
    const testo = testoDi(def, wf);
    const { pronti, scartati } = await resolveDestinatari(venueId, def.key, giorni, now);

    const [ultima, inviatiUltimi30] = await Promise.all([
      db.automationRun.findFirst({
        where: { workflowId: wf.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, result: true },
      }),
      db.messageLog.count({
        where: {
          venueId,
          kind: automationKind(def.key),
          createdAt: { gte: trentaGiorni },
          status: { in: ["QUEUED", "SENT", "DELIVERED"] },
        },
      }),
    ]);

    viste.push({
      key: def.key,
      name: def.name,
      promise: def.promise,
      why: def.why,
      knob: def.knob,
      active: wf.active,
      giorni,
      subject: testo.subject,
      intro: testo.intro,
      toccherebbeOggi: pronti.length,
      esempi: pronti.slice(0, 3).map((p) => ({ nome: p.firstName, reason: p.reason })),
      scartati,
      ultimaEsecuzione: ultima
        ? { quando: ultima.createdAt, inCoda: (ultima.result as { inCoda?: number } | null)?.inCoda ?? 0 }
        : null,
      inviatiUltimi30,
    });
  }

  return viste;
}

/**
 * Manda il messaggio dell'automazione a un indirizzo di prova.
 *
 * Serve prima di accendere: il testo si legge meglio nella casella di posta
 * che in un riquadro d'anteprima. Consegna immediata e non in coda, perché
 * chi ha premuto «mandami una prova» sta guardando lo schermo adesso; e non
 * finisce fra i messaggi dell'ospite, perché non è andato a un ospite.
 */
export async function sendAutomationTest(venueId: string, key: AutomationKey, to: string) {
  const def = AUTOMATIONS[key];
  const wf = await ensureAutomation(venueId, key);
  const testo = testoDi(def, wf);
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { name: true, phone: true } });
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const esito = await sendMessage({
    venueId,
    venueName: venue.name,
    channel: "EMAIL",
    to,
    kind: `${automationKind(key)}.test`,
    subject: `[prova] ${testo.subject}`,
    body: corpo({
      guestName: "Mario",
      venueName: venue.name,
      intro: testo.intro,
      url: `${base}/book?venue=${venueId}`,
      venuePhone: venue.phone,
    }),
    preview: `Prova di «${def.name}»`,
  });

  if (!esito.sent) {
    if (esito.reason === "no_channel") throw new Error("no_channel");
    throw new Error("send_failed");
  }
  return { sent: true as const };
}

export type AutomationUpdate = {
  active?: boolean;
  giorni?: number;
  subject?: string;
  intro?: string;
};

export async function updateAutomation(venueId: string, key: AutomationKey, input: AutomationUpdate) {
  const def = AUTOMATIONS[key];
  const wf = await ensureAutomation(venueId, key);
  const giorniAttuali = giorniDi(def, wf);
  const testoAttuale = testoDi(def, wf);

  const giorni =
    input.giorni === undefined
      ? giorniAttuali
      : Math.min(def.knob.max, Math.max(def.knob.min, Math.round(input.giorni)));

  return db.automationWorkflow.update({
    where: { id: wf.id },
    data: {
      ...(input.active !== undefined && { active: input.active }),
      conditions: { giorni } as Prisma.InputJsonValue,
      actions: {
        subject: input.subject?.trim() || testoAttuale.subject,
        intro: input.intro?.trim() || testoAttuale.intro,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
