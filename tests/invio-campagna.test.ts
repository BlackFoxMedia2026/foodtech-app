import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getCampaignSendProgress,
  retryCampaignSend,
  runCampaignSendJob,
  scheduleCampaign,
  sendCampaignNow,
} from "@/server/campaigns";
import type { JobRef } from "@/server/jobs/queue";

// `getRequestOrigin` legge gli header della richiesta: qui non c'è una
// richiesta, e l'indirizzo pubblico è proprio la cosa che il lavoro deve
// portarsi dietro invece di ricavarla quando gira, dentro il cron.
vi.mock("next/headers", () => ({
  headers: () => new Headers({ host: "prova.tavolo.local", "x-forwarded-proto": "https" }),
}));

/**
 * L'invio di una campagna, che è la ragione per cui la coda esiste.
 *
 * Prima sincronizzava i contatti col fornitore uno per uno dentro la richiesta
 * del browser: con trecento clienti la richiesta scadeva a metà, e nessuno
 * poteva sapere cosa era partito.
 *
 * Le tre cose che qui non devono rompersi mai:
 *
 * - **un invio non parte due volte**, nemmeno se il lavoro viene interrotto
 *   subito dopo aver dato l'ordine al fornitore;
 * - **il lavoro riprende da dove era**, senza risincronizzare i contatti già
 *   fatti;
 * - **lo stato dice la verità**: «in invio» finché lo è, «inviata» solo dopo.
 *
 * Senza chiave Brevo l'adattatore restituisce riferimenti finti invece di
 * chiamare la rete (vedi server/marketing/brevo-adapter.ts): il flusso si può
 * percorrere tutto, ed è quello che serve verificare.
 */

const db = new PrismaClient();
const PREFISSO = "test-camp-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

/** Il riferimento al lavoro che la coda passa al gestore. */
async function riferimento(campaignId: string): Promise<JobRef> {
  const job = await db.backgroundJob.findUniqueOrThrow({
    where: { dedupeKey: `campaign.send:${campaignId}` },
  });
  return {
    id: job.id,
    kind: job.kind,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    yields: job.yields,
    venueId: job.venueId,
  };
}

async function payloadDelLavoro(campaignId: string) {
  const job = await db.backgroundJob.findUniqueOrThrow({
    where: { dedupeKey: `campaign.send:${campaignId}` },
  });
  return job.payload as Record<string, unknown>;
}

async function creaCampagna(nome = "prova") {
  return db.campaign.create({
    data: {
      venueId,
      name: `${PREFISSO}${nome}`,
      subject: "Ci vediamo?",
      body: "<p>Ciao {{FIRST_NAME}}</p>",
      segment: {},
      status: "DRAFT",
    },
  });
}

/** Clienti raggiungibili: email valida e consenso. */
async function creaOspiti(quanti: number) {
  for (let i = 0; i < quanti; i++) {
    await db.guest.create({
      data: {
        venueId,
        firstName: `Ospite${i}`,
        email: `${PREFISSO}${i}-${Date.now()}@test.local`,
        marketingOptIn: true,
      },
    });
  }
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
  await db.messageLog.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.campaign.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guestProviderLink.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("il clic mette in coda", () => {
  it("la campagna passa in «in invio», non in «inviata»", async () => {
    await creaOspiti(3);
    const campagna = await creaCampagna();

    const aggiornata = await sendCampaignNow(venueId, campagna.id);

    // «Inviata» a questo punto sarebbe una bugia: non è partito niente
    // ancora, e il ristoratore ha diritto a saperlo.
    expect(aggiornata.status).toBe("SENDING");
    expect(await db.backgroundJob.count({ where: { dedupeKey: `campaign.send:${campagna.id}` } })).toBe(1);
  });

  it("l'indirizzo pubblico viene catturato subito, non quando il lavoro gira", async () => {
    await creaOspiti(1);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    // Dentro il cron l'host della richiesta è quello di Vercel, non quello da
    // cui il ristoratore ha cliccato: i link nell'email userebbero l'indirizzo
    // sbagliato.
    expect(await payloadDelLavoro(campagna.id)).toMatchObject({ origin: "https://prova.tavolo.local" });
  });

  it("una campagna già partita non si invia una seconda volta", async () => {
    await creaOspiti(2);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    await expect(sendCampaignNow(venueId, campagna.id)).rejects.toThrow("campaign_already_sent");
  });

  it("senza destinatari non si accoda niente e la bozza resta bozza", async () => {
    // Un cliente senza consenso non è un destinatario.
    await db.guest.create({
      data: { venueId, firstName: "SenzaConsenso", email: `${PREFISSO}nc@test.local`, marketingOptIn: false },
    });
    const campagna = await creaCampagna();

    await expect(sendCampaignNow(venueId, campagna.id)).rejects.toThrow("no_recipients");
    expect((await db.campaign.findUnique({ where: { id: campagna.id } }))?.status).toBe("DRAFT");
    expect(await db.backgroundJob.count({ where: { venueId } })).toBe(0);
  });

  it("programmare mette la data e lascia lo stato «programmata»", async () => {
    await creaOspiti(2);
    const campagna = await creaCampagna();
    const quando = new Date(Date.now() + 3 * 3_600_000);

    const aggiornata = await scheduleCampaign(venueId, campagna.id, quando);
    expect(aggiornata.status).toBe("SCHEDULED");
    expect(aggiornata.scheduledAt?.getTime()).toBe(quando.getTime());
    expect(await payloadDelLavoro(campagna.id)).toMatchObject({ at: quando.toISOString() });
  });
});

describe("il lavoro, a lotti", () => {
  it("con più di un lotto di destinatari cede il turno e riprende", async () => {
    // Ventisei destinatari: il primo giro ne prepara venticinque.
    await creaOspiti(26);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);

    const primo = await runCampaignSendJob(await payloadDelLavoro(campagna.id), await riferimento(campagna.id));
    expect(primo).toEqual({ again: true });
    expect(await db.guestProviderLink.count({ where: { venueId } })).toBe(25);
    // A metà lavoro la campagna non è ancora partita.
    expect((await db.campaign.findUnique({ where: { id: campagna.id } }))?.status).toBe("SENDING");

    const secondo = await runCampaignSendJob(await payloadDelLavoro(campagna.id), await riferimento(campagna.id));
    expect(secondo).toEqual({ done: true });
    expect(await db.guestProviderLink.count({ where: { venueId } })).toBe(26);

    const finita = await db.campaign.findUnique({ where: { id: campagna.id } });
    expect(finita?.status).toBe("SENT");
    expect(finita?.sentCount).toBe(26);
    expect(finita?.providerId).not.toBeNull();
  });

  it("il secondo giro non risincronizza chi era già stato preparato", async () => {
    await creaOspiti(26);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);

    await runCampaignSendJob(await payloadDelLavoro(campagna.id), await riferimento(campagna.id));
    const dopoIlPrimo = await db.guestProviderLink.findMany({ select: { guestId: true, syncedAt: true } });

    await runCampaignSendJob(await payloadDelLavoro(campagna.id), await riferimento(campagna.id));
    const dopoIlSecondo = await db.guestProviderLink.findMany({ select: { guestId: true, syncedAt: true } });

    // Le righe del primo giro sono rimaste identiche: non sono state riscritte.
    for (const prima of dopoIlPrimo) {
      const dopo = dopoIlSecondo.find((l) => l.guestId === prima.guestId);
      expect(dopo?.syncedAt.getTime()).toBe(prima.syncedAt.getTime());
    }
  });

  it("una riga di registro per destinatario, così si sa a chi è andata", async () => {
    await creaOspiti(4);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    await runCampaignSendJob(await payloadDelLavoro(campagna.id), await riferimento(campagna.id));

    const righe = await db.messageLog.findMany({ where: { campaignId: campagna.id } });
    expect(righe).toHaveLength(4);
    expect(righe.every((r) => r.status === "QUEUED" && r.channel === "EMAIL")).toBe(true);
  });

  it("l'avanzamento è contato sui contatti veri, non su una percentuale finta", async () => {
    await creaOspiti(26);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    await runCampaignSendJob(await payloadDelLavoro(campagna.id), await riferimento(campagna.id));

    const avanzamento = await getCampaignSendProgress(venueId, campagna.id);
    expect(avanzamento).toMatchObject({ preparati: 25, totale: 26 });
  });
});

describe("interruzioni", () => {
  it("interrotto DOPO l'ordine al fornitore, non reinvia: si ferma e dice perché", async () => {
    await creaOspiti(2);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);

    // Il lavoro è morto fra «invia» e la scrittura dell'esito: al giro dopo
    // ritrova il segnaposto.
    const job = await db.backgroundJob.findUniqueOrThrow({
      where: { dedupeKey: `campaign.send:${campagna.id}` },
    });
    const payload = { ...(job.payload as Record<string, unknown>), step: "handoff" };
    await db.backgroundJob.update({ where: { id: job.id }, data: { payload } });

    const esito = await runCampaignSendJob(payload, await riferimento(campagna.id));
    expect(esito).toEqual({ done: true });

    const finita = await db.campaign.findUnique({ where: { id: campagna.id } });
    expect(finita?.status).toBe("FAILED");
    // Nessuna riga di registro: non abbiamo finto un invio che non sappiamo
    // com'è andato.
    expect(await db.messageLog.count({ where: { campaignId: campagna.id } })).toBe(0);

    // E il locale lo viene a sapere.
    const avviso = await db.notification.findFirst({
      where: { venueId, kind: "AUTOMATION_FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(avviso?.title).toContain(campagna.name);
    await db.notification.deleteMany({ where: { venueId } });
  });

  it("una campagna già consegnata al fornitore non si riprova", async () => {
    await creaOspiti(2);
    const campagna = await creaCampagna();
    await db.campaign.update({
      where: { id: campagna.id },
      data: { status: "FAILED", providerId: "brevo-123" },
    });
    await expect(retryCampaignSend(venueId, campagna.id)).rejects.toThrow("campaign_already_handed_over");
  });

  it("una campagna non riuscita prima della consegna si riprova da zero", async () => {
    await creaOspiti(2);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    await db.campaign.update({ where: { id: campagna.id }, data: { status: "FAILED" } });
    await db.backgroundJob.update({
      where: { dedupeKey: `campaign.send:${campagna.id}` },
      data: { status: "FAILED", attempts: 3, lastError: "boom" },
    });

    const ripresa = await retryCampaignSend(venueId, campagna.id);
    expect(ripresa.status).toBe("SENDING");
    const job = await db.backgroundJob.findUniqueOrThrow({
      where: { dedupeKey: `campaign.send:${campagna.id}` },
    });
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(0);
  });

  it("il lavoro non tocca le campagne di un altro locale", async () => {
    const altrui = await db.campaign.create({
      data: { venueId: altroVenueId, name: `${PREFISSO}altrui`, segment: {}, status: "SENDING" },
    });
    const esito = await runCampaignSendJob(
      {
        venueId,
        campaignId: altrui.id,
        origin: "https://prova.tavolo.local",
        enqueuedAt: new Date().toISOString(),
        step: "sync",
      },
      { id: "finto", kind: "campaign.send", attempts: 1, maxAttempts: 3, yields: 0, venueId }
    );
    expect(esito).toEqual({ done: true });
    // Rimasta com'era: nessuno l'ha fatta partire da fuori.
    expect((await db.campaign.findUnique({ where: { id: altrui.id } }))?.status).toBe("SENDING");
  });

  it("una campagna già conclusa non riparte se il lavoro torna", async () => {
    await creaOspiti(2);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    const payload = await payloadDelLavoro(campagna.id);
    await runCampaignSendJob(payload, await riferimento(campagna.id));

    // Lo stesso lavoro rieseguito: non deve rifare niente.
    const esito = await runCampaignSendJob(payload, await riferimento(campagna.id));
    expect(esito).toEqual({ done: true });
    expect(await db.messageLog.count({ where: { campaignId: campagna.id } })).toBe(2);
  });
});
