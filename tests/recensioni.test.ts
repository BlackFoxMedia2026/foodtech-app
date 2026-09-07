import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MAX_LINK,
  ensureReviewLinks,
  listReviewLinks,
  recordReviewLinkClick,
  reviewFunnel,
  saveReviewLinks,
} from "@/server/reviews";
import { submitSurveyResponse } from "@/server/surveys";

/**
 * Il ponte verso le recensioni pubbliche.
 *
 * Le cose che devono reggere:
 *
 * - **chi è contento vede i collegamenti, chi non lo è no.** È la stessa
 *   regola delle due strade del sondaggio, e vale anche quando i posti dove
 *   recensire diventano quattro;
 * - **il passaggio si conta una volta per persona.** Chi apre il link tre
 *   volte non diventa tre recensioni;
 * - **togliere un collegamento non cancella la storia.** I clic raccolti
 *   restano, altrimenti i numeri dell'anno scorso cambierebbero da soli;
 * - **il token di un altro locale non attribuisce un clic qui.**
 */

const db = new PrismaClient();
const PREFISSO = "test-rec-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let guestId = "";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: {
        orgId: org.id,
        name: `${PREFISSO}locale`,
        slug: `${PREFISSO}v${Date.now()}`,
        googleBusinessUrl: "https://esempio.test/google",
      },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
  guestId = (await db.guest.create({ data: { venueId, firstName: "Elena" } })).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.reviewLinkClick.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.reviewLink.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.survey.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

async function sondaggio(nome: string, venue = venueId) {
  return db.survey.create({ data: { venueId: venue, guestId: venue === venueId ? guestId : null, token: `${PREFISSO}${nome}` } });
}

describe("i posti dove recensire", () => {
  it("il primo nasce da solo dal profilo Google già in Brand: nessuno perde il bottone", async () => {
    await ensureReviewLinks(venueId);
    const links = await listReviewLinks(venueId);
    expect(links).toHaveLength(1);
    expect(links[0].platform).toBe("GOOGLE");
    expect(links[0].url).toBe("https://esempio.test/google");
  });

  it("un locale senza profilo pubblico non si ritrova un collegamento inventato", async () => {
    await ensureReviewLinks(altroVenueId);
    expect(await listReviewLinks(altroVenueId)).toEqual([]);
  });

  it("il locale ne mette fino a quattro, nell'ordine che ha scelto", async () => {
    await saveReviewLinks(venueId, {
      links: [
        { platform: "TRIPADVISOR", url: "https://esempio.test/ta" },
        { platform: "GOOGLE", url: "https://esempio.test/g" },
      ],
    });
    const links = await listReviewLinks(venueId);
    expect(links.map((l) => l.nome)).toEqual(["TripAdvisor", "Google"]);
  });

  it("oltre quattro non si va: davanti a sei bottoni non si sceglie", async () => {
    const troppi = Array.from({ length: MAX_LINK + 1 }, () => ({
      platform: "OTHER" as const,
      url: "https://esempio.test/x",
    }));
    await expect(saveReviewLinks(venueId, { links: troppi })).rejects.toThrow();
  });

  it("un indirizzo che non è un indirizzo viene rifiutato", async () => {
    await expect(
      saveReviewLinks(venueId, { links: [{ platform: "GOOGLE", url: "scrivimi su google" }] }),
    ).rejects.toThrow();
  });
});

describe("il passaggio si conta", () => {
  it("registra il clic e restituisce dove andare", async () => {
    const [link] = await listReviewLinks(venueId);
    const s = await sondaggio("clic");
    await submitSurveyResponse(s.token, { score: 10 });

    const destinazione = await recordReviewLinkClick(link.id, { surveyToken: s.token });
    expect(destinazione).toBe("https://esempio.test/google");

    const clic = await db.reviewLinkClick.findFirst({ where: { linkId: link.id } });
    expect(clic?.surveyId).toBe(s.id);
    expect(clic?.npsScore).toBe(10);
  });

  it("non registra nulla di chi non era: niente IP, niente browser", async () => {
    const [link] = await listReviewLinks(venueId);
    await recordReviewLinkClick(link.id);
    const clic = await db.reviewLinkClick.findFirst({ where: { linkId: link.id } });
    expect(clic?.ipAddress).toBeNull();
    expect(clic?.userAgent).toBeNull();
  });

  it("il token di un altro locale non attribuisce il clic qui", async () => {
    const [link] = await listReviewLinks(venueId);
    const estraneo = await sondaggio("estraneo", altroVenueId);

    await recordReviewLinkClick(link.id, { surveyToken: estraneo.token });
    const clic = await db.reviewLinkClick.findFirst({ where: { linkId: link.id } });
    expect(clic).toBeDefined();
    expect(clic!.surveyId).toBeNull();
  });

  it("un collegamento spento non manda più da nessuna parte", async () => {
    const [link] = await listReviewLinks(venueId);
    await saveReviewLinks(venueId, { links: [] });
    expect(await recordReviewLinkClick(link.id)).toBeNull();
  });
});

describe("quanti promotori arrivano fino in fondo", () => {
  it("conta persone, non clic: chi torna sul link due volte è sempre uno", async () => {
    const [link] = await listReviewLinks(venueId);
    const s = await sondaggio("due-volte");
    await submitSurveyResponse(s.token, { score: 9 });

    await recordReviewLinkClick(link.id, { surveyToken: s.token });
    await recordReviewLinkClick(link.id, { surveyToken: s.token });

    const f = await reviewFunnel(venueId);
    expect(f.promotori).toBe(1);
    expect(f.arrivati).toBe(1);
    expect(f.clic).toBe(2);
  });

  it("chi è uscito scontento non compare fra i promotori", async () => {
    const s = await sondaggio("detrattore");
    await submitSurveyResponse(s.token, { score: 4, comment: "Attesa lunga" });

    const f = await reviewFunnel(venueId);
    expect(f.promotori).toBe(0);
    expect(f.arrivati).toBe(0);
  });

  it("togliere un collegamento non cancella i passaggi già raccolti", async () => {
    const [link] = await listReviewLinks(venueId);
    await recordReviewLinkClick(link.id);
    await saveReviewLinks(venueId, { links: [] });

    const f = await reviewFunnel(venueId);
    expect(f.clic).toBe(1);
    // Il nome resta leggibile anche se il collegamento non è più in elenco:
    // un numero senza etichetta non è un numero.
    expect(f.perPiattaforma[0].nome).toBe("Google");
  });
});
