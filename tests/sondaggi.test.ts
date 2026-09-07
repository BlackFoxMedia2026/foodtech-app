import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getSurveyStats,
  npsFromCounts,
  readSurveyByToken,
  sendDueSurveyRequests,
  sentimentFromScore,
  submitSurveyResponse,
} from "@/server/surveys";

/**
 * «Com'è andata?» — il meccanismo dopo la visita.
 *
 * Le cose che devono reggere: **una richiesta per prenotazione** (il cron
 * gira ogni giorno), **una risposta per sondaggio** (il link non si riusa),
 * e le **due strade** dopo il punteggio — a chi è contento si propone la
 * recensione pubblica, a chi non lo è si chiede in privato e il locale viene
 * avvisato subito.
 *
 * Quest'ultima è la ragione per cui il meccanismo esiste: intercettare chi è
 * uscito male prima che lo scriva altrove.
 */

const db = new PrismaClient();
const PREFISSO = "test-nps-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";

async function visitaChiusa(oreFa = 12) {
  const startsAt = new Date(Date.now() - (oreFa + 2) * 3_600_000);
  return db.booking.create({
    data: {
      venueId,
      guestId,
      partySize: 2,
      startsAt,
      durationMin: 105,
      status: "COMPLETED",
      source: "PHONE",
      closedAt: new Date(Date.now() - oreFa * 3_600_000),
    },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: {
      orgId: org.id,
      name: `${PREFISSO}locale`,
      slug: `${PREFISSO}v${Date.now()}`,
      googleBusinessUrl: "https://esempio.test/recensione",
    },
  });
  venueId = venue.id;
  guestId = (
    await db.guest.create({
      data: { venueId, firstName: "Rita", lastName: "Sereni", email: `${PREFISSO}rita@test.local` },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function svuota() {
  await db.survey.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.notification.deleteMany({ where: { venueId } });
}

describe("il punteggio e il suo significato", () => {
  it("promotori 9-10, passivi 7-8, detrattori 0-6", () => {
    expect(sentimentFromScore(10)).toBe("PROMOTER");
    expect(sentimentFromScore(9)).toBe("PROMOTER");
    expect(sentimentFromScore(8)).toBe("PASSIVE");
    expect(sentimentFromScore(7)).toBe("PASSIVE");
    expect(sentimentFromScore(6)).toBe("DETRACTOR");
    expect(sentimentFromScore(0)).toBe("DETRACTOR");
  });

  it("l'NPS non è una media: metà entusiasti e metà delusi fa zero", () => {
    expect(npsFromCounts({ promoters: 5, passives: 0, detractors: 5 })).toBe(0);
    expect(npsFromCounts({ promoters: 10, passives: 0, detractors: 0 })).toBe(100);
    expect(npsFromCounts({ promoters: 0, passives: 0, detractors: 10 })).toBe(-100);
    expect(npsFromCounts({ promoters: 0, passives: 10, detractors: 0 })).toBe(0);
  });

  it("senza risposte non c'è punteggio, non c'è uno zero finto", () => {
    expect(npsFromCounts({ promoters: 0, passives: 0, detractors: 0 })).toBeNull();
  });
});

describe("a chi si chiede", () => {
  it("a chi ha chiuso il tavolo qualche ora fa", async () => {
    await svuota();
    const b = await visitaChiusa(12);
    const esiti = await sendDueSurveyRequests();
    expect(esiti.find((e) => e.bookingId === b.id)).toBeDefined();
  });

  it("non a chi è appena uscito", async () => {
    await svuota();
    const b = await visitaChiusa(0.5);
    const esiti = await sendDueSurveyRequests();
    expect(esiti.find((e) => e.bookingId === b.id)).toBeUndefined();
  });

  it("non a chi è venuto la settimana scorsa: la memoria è sbiadita", async () => {
    await svuota();
    const b = await visitaChiusa(24 * 7);
    const esiti = await sendDueSurveyRequests();
    expect(esiti.find((e) => e.bookingId === b.id)).toBeUndefined();
  });

  it("non a chi non si è presentato", async () => {
    await svuota();
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 2,
        startsAt: new Date(Date.now() - 14 * 3_600_000),
        status: "NO_SHOW",
        source: "PHONE",
        closedAt: new Date(Date.now() - 12 * 3_600_000),
      },
    });
    const esiti = await sendDueSurveyRequests();
    expect(esiti.find((e) => e.bookingId === b.id)).toBeUndefined();
  });

  it("una richiesta per prenotazione, anche se il cron gira due volte", async () => {
    await svuota();
    const b = await visitaChiusa(12);

    await sendDueSurveyRequests();
    const dopoIlPrimo = await db.survey.count({ where: { bookingId: b.id } });

    await sendDueSurveyRequests();
    const dopoIlSecondo = await db.survey.count({ where: { bookingId: b.id } });

    expect(dopoIlSecondo).toBe(dopoIlPrimo);
    expect(dopoIlSecondo).toBeLessThanOrEqual(1);
  });

  it("senza contatto lo dice, invece di provare a mandare", async () => {
    await svuota();
    const senzaEmail = await db.guest.create({ data: { venueId, firstName: "Anonimo" } });
    const b = await db.booking.create({
      data: {
        venueId,
        guestId: senzaEmail.id,
        partySize: 2,
        startsAt: new Date(Date.now() - 14 * 3_600_000),
        status: "COMPLETED",
        source: "PHONE",
        closedAt: new Date(Date.now() - 12 * 3_600_000),
      },
    });
    const esiti = await sendDueSurveyRequests();
    expect(esiti.find((e) => e.bookingId === b.id)?.outcome).toBe("no_address");
  });
});

describe("la risposta dell'ospite", () => {
  async function sondaggio(token: string) {
    return db.survey.create({ data: { venueId, guestId, token: `${PREFISSO}${token}` } });
  }

  it("un promotore riceve la strada per la recensione pubblica", async () => {
    await svuota();
    await sondaggio("promo");
    const esito = await submitSurveyResponse(`${PREFISSO}promo`, { score: 10 });
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.sentiment).toBe("PROMOTER");
      expect(esito.publicReviewUrl).toBe("https://esempio.test/recensione");
    }
  });

  it("un detrattore no: quella risposta resta in privato", async () => {
    await svuota();
    await sondaggio("detr");
    const esito = await submitSurveyResponse(`${PREFISSO}detr`, {
      score: 3,
      comment: "Attesa lunga al tavolo",
    });
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.sentiment).toBe("DETRACTOR");
      // È il punto del meccanismo: chi è uscito male non viene spinto a
      // scriverlo in pubblico.
      expect(esito.publicReviewUrl).toBeNull();
    }
  });

  it("e il locale viene avvisato subito, con il commento dentro", async () => {
    await svuota();
    await sondaggio("avviso");
    await submitSurveyResponse(`${PREFISSO}avviso`, { score: 2, comment: "Piatto freddo" });

    const notifica = await db.notification.findFirst({
      where: { venueId, kind: "NPS_DETRACTOR" },
      orderBy: { createdAt: "desc" },
    });
    expect(notifica).not.toBeNull();
    expect(notifica!.body).toContain("Piatto freddo");
    // Titolo neutro: il genere di un ospite non lo sappiamo.
    expect(notifica!.title).toContain("Voto basso");
  });

  it("un passivo non fa scattare nessun avviso", async () => {
    await svuota();
    await sondaggio("passivo");
    await submitSurveyResponse(`${PREFISSO}passivo`, { score: 8 });
    expect(await db.notification.count({ where: { venueId, kind: "NPS_DETRACTOR" } })).toBe(0);
  });

  it("il link vale una volta sola", async () => {
    await svuota();
    await sondaggio("unico");
    await submitSurveyResponse(`${PREFISSO}unico`, { score: 9 });
    const secondo = await submitSurveyResponse(`${PREFISSO}unico`, { score: 2 });
    expect(secondo.ok).toBe(false);
    if (!secondo.ok) expect(secondo.code).toBe("already_answered");
  });

  it("punteggi fuori scala e token inventati non passano", async () => {
    await svuota();
    await sondaggio("scala");
    for (const score of [-1, 11, 99, 1.5]) {
      const esito = await submitSurveyResponse(`${PREFISSO}scala`, { score });
      expect(esito.ok).toBe(false);
      if (!esito.ok) expect(esito.code).toBe("invalid_score");
    }
    const inventato = await submitSurveyResponse("non-esiste", { score: 8 });
    expect(inventato.ok).toBe(false);
    if (!inventato.ok) expect(inventato.code).toBe("invalid_token");
  });

  it("la pagina mostra il locale e se ha già risposto", async () => {
    await svuota();
    await sondaggio("vista");
    const prima = await readSurveyByToken(`${PREFISSO}vista`);
    expect(prima?.venueName).toContain(PREFISSO);
    expect(prima?.guestName).toBe("Rita");
    expect(prima?.alreadyAnswered).toBe(false);

    await submitSurveyResponse(`${PREFISSO}vista`, { score: 7 });
    const dopo = await readSurveyByToken(`${PREFISSO}vista`);
    expect(dopo?.alreadyAnswered).toBe(true);
  });
});

describe("i numeri per il locale", () => {
  it("conta le risposte, non le richieste, e dice quante ne sono arrivate", async () => {
    await svuota();
    for (const [token, score] of [
      ["a", 10],
      ["b", 9],
      ["c", 8],
      ["d", 3],
    ] as [string, number][]) {
      await db.survey.create({ data: { venueId, guestId, token: `${PREFISSO}s-${token}` } });
      await submitSurveyResponse(`${PREFISSO}s-${token}`, { score });
    }
    // Una richiesta senza risposta: entra nel tasso, non nel punteggio.
    await db.survey.create({ data: { venueId, guestId, token: `${PREFISSO}s-muta` } });

    const stats = await getSurveyStats(venueId);
    expect(stats.sent).toBe(5);
    expect(stats.responses).toBe(4);
    expect(stats.promoters).toBe(2);
    expect(stats.passives).toBe(1);
    expect(stats.detractors).toBe(1);
    // 50% promotori - 25% detrattori = +25
    expect(stats.nps).toBe(25);
    expect(stats.responseRate).toBeCloseTo(0.8, 2);
    expect(stats.averageScore).toBe(7.5);
  });

  it("senza risposte il punteggio è assente, non zero", async () => {
    await svuota();
    await db.survey.create({ data: { venueId, guestId, token: `${PREFISSO}s-sola` } });
    const stats = await getSurveyStats(venueId);
    expect(stats.responses).toBe(0);
    expect(stats.nps).toBeNull();
    expect(stats.averageScore).toBeNull();
  });

  it("non mescola i ristoranti", async () => {
    await svuota();
    const org = await db.organization.create({
      data: { name: `${PREFISSO}altro`, slug: `${PREFISSO}altro-${Date.now()}` },
    });
    const altro = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    await db.survey.create({ data: { venueId: altro.id, token: `${PREFISSO}s-altrui` } });
    await submitSurveyResponse(`${PREFISSO}s-altrui`, { score: 10 });

    const stats = await getSurveyStats(venueId);
    expect(stats.sent).toBe(0);
    expect(stats.nps).toBeNull();
  });
});
