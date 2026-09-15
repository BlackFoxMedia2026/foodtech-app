import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  cancelCampaign,
  previewSegment,
  resolveSegment,
  scheduleCampaign,
  sendCampaignNow,
  sendTestEmail,
} from "@/server/campaigns";
import { periodoCorrente, statoConsumo } from "@/server/dem/consumo";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { assicuraPiani } from "@/server/dem/piani";
import { sopprimi } from "@/server/dem/destinatari";

vi.mock("next/headers", () => ({
  headers: () => new Headers({ host: "prova.tavolo.local", "x-forwarded-proto": "https" }),
}));

/**
 * Il punto in cui il contatore incontra le campagne.
 *
 * I conti della quota sono già verificati altrove; qui si verifica che siano
 * **collegati** — che una campagna troppo grande non parta, che una annullata
 * restituisca quello che aveva impegnato, e che chi non va contattato non
 * venga né contato né contattato.
 */

const db = new PrismaClient();
const PREFISSO = "test-cdem-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";

async function creaOspiti(quanti: number, opts: { consenso?: boolean; email?: (i: number) => string } = {}) {
  for (let i = 0; i < quanti; i++) {
    await db.guest.create({
      data: {
        venueId,
        firstName: `Ospite${i}`,
        email: opts.email ? opts.email(i) : `${PREFISSO}${i}-${Date.now()}-${Math.random()}@test.local`,
        marketingOptIn: opts.consenso ?? true,
      },
    });
  }
}

async function creaCampagna() {
  return db.campaign.create({
    data: {
      venueId,
      name: `${PREFISSO}campagna`,
      subject: "Ci vediamo?",
      body: "<p>Ciao</p>",
      segment: {},
      status: "DRAFT",
    },
  });
}

beforeAll(async () => {
  await assicuraPiani();
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
}, 60_000);

afterEach(async () => {
  await db.campaignRecipient.deleteMany({ where: { venueId } });
  await db.campaign.deleteMany({ where: { venueId } });
  await db.backgroundJob.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.demSuppression.deleteMany({ where: { venueId } });
  await db.demUsagePeriod.deleteMany({ where: { venueId } });
  await db.notification.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.demSubscription.deleteMany({ where: { venueId } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("chi entra nella fotografia dei destinatari", () => {
  it("chi ha segnalato spam esce dal conto e dall'invio", async () => {
    await creaOspiti(3, { email: (i) => `${PREFISSO}sopp${i}@test.local` });
    await sopprimi(venueId, `${PREFISSO}sopp1@test.local`, "COMPLAINT", { source: "prova" });

    const anteprima = await previewSegment(venueId, {});
    expect(anteprima.totalMatchingFilters).toBe(3);
    expect(anteprima.excludedSuppressed).toBe(1);
    expect(anteprima.finalRecipients).toBe(2);

    const destinatari = await resolveSegment(venueId, {});
    expect(destinatari.map((g) => g.email)).not.toContain(`${PREFISSO}sopp1@test.local`);
  });

  it("lo stesso indirizzo su due schede vale un invio solo", async () => {
    await creaOspiti(2, { email: () => `${PREFISSO}doppio@test.local` });

    const anteprima = await previewSegment(venueId, {});
    expect(anteprima.totalMatchingFilters).toBe(2);
    expect(anteprima.duplicatesRemoved).toBe(1);
    expect(anteprima.finalRecipients).toBe(1);
  });

  it("le esclusioni e i destinatari fanno sempre il totale", async () => {
    // Un contatto per ogni motivo: la somma deve tornare, altrimenti il
    // numero grande della colonna smette di essere credibile.
    await creaOspiti(1, { email: (i) => `${PREFISSO}ok${i}@test.local` });
    await creaOspiti(1, { consenso: false, email: () => `${PREFISSO}senza-consenso@test.local` });
    await db.guest.create({ data: { venueId, firstName: "SenzaEmail", marketingOptIn: true } });
    await creaOspiti(1, { email: () => `${PREFISSO}spam@test.local` });
    await sopprimi(venueId, `${PREFISSO}spam@test.local`, "HARD_BOUNCE");

    const a = await previewSegment(venueId, {});
    expect(a.excludedNoEmail + a.excludedNoConsent + a.excludedSuppressed + a.duplicatesRemoved + a.finalRecipients).toBe(
      a.totalMatchingFilters,
    );
    expect(a.finalRecipients).toBe(1);
  });
});

describe("la quota decide se la campagna parte", () => {
  it("una campagna più grande del piano non parte, e dice quanti invii mancano", async () => {
    // Piano compreso: 500. Il segmento ne ha 501 — uno solo di troppo, e
    // basta: la campagna è atomica.
    await creaOspiti(501);
    const campagna = await creaCampagna();

    await expect(sendCampaignNow(venueId, campagna.id)).rejects.toMatchObject({
      code: "dem_quota_insufficient",
      detail: { disponibili: 500, richiesti: 501, mancanti: 1 },
    });

    // Niente riservato, niente in coda, e la campagna è ancora una bozza.
    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(0);
    expect(await db.backgroundJob.count({ where: { venueId } })).toBe(0);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campagna.id } })).status).toBe("DRAFT");
  }, 60_000);

  it("una campagna che ci sta riserva esattamente i suoi invii", async () => {
    await creaOspiti(40);
    const campagna = await creaCampagna();

    const aggiornata = await sendCampaignNow(venueId, campagna.id);
    expect(aggiornata.status).toBe("QUEUED");
    expect(aggiornata.recipientsCount).toBe(40);

    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(40);
    expect(stato.usati).toBe(0);
    expect(stato.disponibili).toBe(460);

    // E la fotografia dei destinatari esiste: da qui in poi la lista è sua.
    expect(await db.campaignRecipient.count({ where: { campaignId: campagna.id } })).toBe(40);
  });

  it("due campagne insieme non possono superare il piano", async () => {
    await creaOspiti(300);
    const prima = await creaCampagna();
    const seconda = await creaCampagna();

    await sendCampaignNow(venueId, prima.id);
    // La seconda vorrebbe gli stessi 300 su 200 rimasti.
    await expect(sendCampaignNow(venueId, seconda.id)).rejects.toMatchObject({
      code: "dem_quota_insufficient",
    });

    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(300);
  }, 60_000);

  it("gli invii sospesi fermano la campagna prima di prepararla", async () => {
    await creaOspiti(5);
    const campagna = await creaCampagna();
    const sub = await abbonamentoDi(venueId);
    await db.demSubscription.update({
      where: { id: sub.id },
      data: { sendingPausedAt: new Date(), sendingPausedReason: "reputazione" },
    });

    await expect(sendCampaignNow(venueId, campagna.id)).rejects.toMatchObject({
      code: "dem_sending_paused",
    });
    expect((await statoConsumo(venueId)).riservati).toBe(0);

    await db.demSubscription.update({ where: { id: sub.id }, data: { sendingPausedAt: null } });
  });
});

describe("annullare una campagna", () => {
  it("restituisce tutti gli invii riservati e la lascia in elenco", async () => {
    await creaOspiti(50);
    const campagna = await creaCampagna();
    const domani = new Date(Date.now() + 86_400_000);
    await scheduleCampaign(venueId, campagna.id, domani);

    expect((await statoConsumo(venueId)).riservati).toBe(50);

    const annullata = await cancelCampaign(venueId, campagna.id);
    expect(annullata.status).toBe("CANCELLED");
    expect(annullata.cancelledAt).not.toBeNull();

    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(0);
    expect(stato.usati).toBe(0);

    // Non è sparita: una campagna cancellata è una domanda senza risposta.
    expect(await db.campaign.count({ where: { id: campagna.id } })).toBe(1);
    // E il lavoro in coda non si sveglia domani.
    expect(await db.backgroundJob.count({ where: { dedupeKey: `campaign.send:${campagna.id}` } })).toBe(0);
  });

  it("una campagna già consegnata al fornitore non si annulla più", async () => {
    await creaOspiti(5);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);
    await db.campaign.update({ where: { id: campagna.id }, data: { providerId: "brevo-123" } });

    await expect(cancelCampaign(venueId, campagna.id)).rejects.toThrow("conflict");
  });

  it("un locale non può annullare la campagna di un altro", async () => {
    await creaOspiti(3);
    const campagna = await creaCampagna();
    await sendCampaignNow(venueId, campagna.id);

    await expect(cancelCampaign("altro-locale-inesistente", campagna.id)).rejects.toThrow("not_found");
  });
});

describe("gli invii di prova", () => {
  it("scalano dal piano: «Invia test» non è la porta di servizio", async () => {
    const campagna = await creaCampagna();

    await sendTestEmail(venueId, campagna.id, "prova@test.local");

    const stato = await statoConsumo(venueId);
    expect(stato.usati).toBe(1);
    expect(stato.disponibili).toBe(499);

    const dopo = await db.campaign.findUniqueOrThrow({ where: { id: campagna.id } });
    expect(dopo.testSendCount).toBe(1);
  });

  it("hanno un tetto per campagna", async () => {
    const campagna = await creaCampagna();
    await db.campaign.update({ where: { id: campagna.id }, data: { testSendCount: 10 } });

    await expect(sendTestEmail(venueId, campagna.id, "prova@test.local")).rejects.toThrow("dem_test_limit");
    // E non ha consumato niente: il rifiuto arriva prima.
    expect((await statoConsumo(venueId)).usati).toBe(0);
  });

  it("non partono quando il piano è finito", async () => {
    const campagna = await creaCampagna();
    const { periodo } = await periodoCorrente(venueId);
    await db.demUsagePeriod.update({ where: { id: periodo.id }, data: { used: 500 } });

    await expect(sendTestEmail(venueId, campagna.id, "prova@test.local")).rejects.toMatchObject({
      code: "dem_quota_insufficient",
    });
  });
});
