import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEBOLE_SOTTO_MEDIA_PCT, giornoDebole, intentiDisponibili } from "@/server/marketing/intenti";
import { GIORNI_MINIMI } from "@/server/forecast";
import type { WeekdayOccupancy } from "@/server/forecast";

/**
 * «Cosa vuoi ottenere» nell'hub del marketing (§38).
 *
 * La cosa che questi test difendono è **il silenzio**: un intento compare solo
 * se il dato che lo giustifica c'è. Un locale appena aperto deve vedere un
 * intento solo — scrivere a mano — e non sei proposte costruite su medie di
 * tre giornate. È la stessa disciplina dei quattro livelli di verità
 * dell'analisi, applicata ai suggerimenti.
 */

const db = new PrismaClient();
const PREFISSO = "test-intenti-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}org-${Date.now()}` },
  });
  orgId = org.id;
  const venue = await db.venue.create({
    data: {
      orgId: org.id,
      name: `${PREFISSO}locale`,
      slug: `${PREFISSO}v${Date.now()}`,
      timezone: "Europe/Rome",
    },
  });
  venueId = venue.id;
});

afterAll(async () => {
  await db.guest.deleteMany({ where: { venueId } });
  await db.experience.deleteMany({ where: { venueId } });
  await db.venue.deleteMany({ where: { orgId } });
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

/* -------------------------------------------------------------------------- */
/*  La regola del giorno debole, senza database                               */
/* -------------------------------------------------------------------------- */

function giorno(weekday: number, occupancyPct: number | null, giorni = GIORNI_MINIMI): WeekdayOccupancy {
  return {
    weekday,
    label: ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"][weekday],
    giorni,
    copertiMedi: 30,
    capacity: 100,
    occupancyPct,
  };
}

describe("il giorno debole", () => {
  it("lo dice quando lo scarto si vede", () => {
    const d = giornoDebole([giorno(2, 30), giorno(5, 80), giorno(6, 85)]);
    expect(d?.giorno.weekday).toBe(2);
    // La media è quella **degli altri**: (80+85)/2, non (30+80+85)/3.
    expect(d?.media).toBe(83);
  });

  it("tace su tre punti di differenza: è la differenza fra due martedì", () => {
    expect(giornoDebole([giorno(1, 27), giorno(2, 29), giorno(3, 31)])).toBeNull();
  });

  it("tace esattamente sotto la soglia, e parla esattamente sopra", () => {
    const sotto = giornoDebole([
      giorno(1, 50),
      giorno(2, 50 + DEBOLE_SOTTO_MEDIA_PCT - 1),
      giorno(3, 50 + DEBOLE_SOTTO_MEDIA_PCT - 1),
    ]);
    expect(sotto).toBeNull();
    const sopra = giornoDebole([
      giorno(1, 50),
      giorno(2, 50 + DEBOLE_SOTTO_MEDIA_PCT),
      giorno(3, 50 + DEBOLE_SOTTO_MEDIA_PCT),
    ]);
    expect(sopra?.giorno.weekday).toBe(1);
  });

  it("non chiama «debole» un giorno di chiusura misurato tre volte", () => {
    // Il lunedì è chiuso: due giornate misurate, sotto la soglia della
    // previsione. Senza il filtro, «il tuo giorno debole è il lunedì» sarebbe
    // la scoperta che il lunedì è chiuso.
    const d = giornoDebole([
      giorno(1, 0, GIORNI_MINIMI - 1),
      giorno(5, 80),
      giorno(6, 85),
    ]);
    expect(d?.giorno.weekday).not.toBe(1);
    // E fra venerdì e sabato non c'è niente da dire.
    expect(d).toBeNull();
  });

  it("con un solo giorno misurato non c'è confronto, quindi non c'è proposta", () => {
    expect(giornoDebole([giorno(6, 20)])).toBeNull();
  });

  it("un giorno senza capienza configurata non entra nel confronto", () => {
    // `occupancyPct` nullo vuol dire «non lo sappiamo»: senza turni non c'è
    // una capienza su cui misurare, e un giorno senza percentuale non può
    // essere il più vuoto.
    expect(giornoDebole([giorno(1, null), giorno(5, 80)])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Gli intenti, sul database                                                 */
/* -------------------------------------------------------------------------- */

async function svuota() {
  await db.guest.deleteMany({ where: { venueId } });
  await db.experience.deleteMany({ where: { venueId } });
}

async function ospite(opts: { inattivoDaGiorni?: number; visite?: number; consenso?: boolean; email?: boolean }) {
  const n = Math.random().toString(36).slice(2, 8);
  return db.guest.create({
    data: {
      venueId,
      firstName: `${PREFISSO}${n}`,
      email: opts.email === false ? null : `${n}@test.local`,
      marketingOptIn: opts.consenso !== false,
      totalVisits: opts.visite ?? 0,
      lastVisitAt:
        opts.inattivoDaGiorni != null
          ? new Date(Date.now() - opts.inattivoDaGiorni * 86_400_000)
          : null,
    },
  });
}

describe("gli intenti", () => {
  it("un locale senza niente vede solo «scrivere a mano»", async () => {
    await svuota();
    const intenti = await intentiDisponibili(venueId);
    expect(intenti.map((i) => i.chiave)).toEqual(["campagna"]);
  });

  it("propone di far tornare gli inattivi, e dice quanti sono davvero scrivibili", async () => {
    await svuota();
    // Quattro inattivi, ma uno senza consenso e uno senza email: scrivibili 2…
    for (let i = 0; i < 2; i++) await ospite({ inattivoDaGiorni: 200, visite: 2 });
    await ospite({ inattivoDaGiorni: 200, visite: 2, consenso: false });
    await ospite({ inattivoDaGiorni: 200, visite: 2, email: false });
    // …che sono sotto il minimo, quindi ancora niente.
    expect((await intentiDisponibili(venueId)).map((i) => i.chiave)).not.toContain("inattivi");

    // Con il terzo scrivibile la proposta compare, e il numero è quello vero.
    await ospite({ inattivoDaGiorni: 200, visite: 2 });
    const intento = (await intentiDisponibili(venueId)).find((i) => i.chiave === "inattivi");
    expect(intento).toBeDefined();
    expect(intento!.perche).toContain("3");
    // E porta il segmento con sé: è la stessa etichetta calcolata delle campagne.
    expect(intento!.href).toContain("segmento=inattivi");
  });

  it("propone di premiare gli abituali quando ce ne sono", async () => {
    await svuota();
    for (let i = 0; i < 3; i++) await ospite({ visite: 10, inattivoDaGiorni: 5 });
    const intento = (await intentiDisponibili(venueId)).find((i) => i.chiave === "migliori");
    expect(intento?.href).toContain("segmento=abituali");
  });

  it("propone di riempire la prossima serata solo se è pubblicata e non è passata", async () => {
    await svuota();
    const fra = (giorni: number) => new Date(Date.now() + giorni * 86_400_000);

    // Una bozza non si annuncia.
    await db.experience.create({
      data: {
        venueId,
        title: "Bozza",
        slug: `${PREFISSO}bozza`,
        startsAt: fra(3),
        endsAt: fra(3),
        capacity: 20,
        priceCents: 5000,
        published: false,
      },
    });
    expect((await intentiDisponibili(venueId)).map((i) => i.chiave)).not.toContain("evento");

    // Una passata nemmeno.
    await db.experience.create({
      data: {
        venueId,
        title: "Passata",
        slug: `${PREFISSO}passata`,
        startsAt: fra(-10),
        endsAt: fra(-10),
        capacity: 20,
        priceCents: 5000,
        published: true,
      },
    });
    expect((await intentiDisponibili(venueId)).map((i) => i.chiave)).not.toContain("evento");

    // Questa sì, e il titolo entra nel nome della campagna.
    await db.experience.create({
      data: {
        venueId,
        title: "Cena col produttore",
        slug: `${PREFISSO}prossima`,
        startsAt: fra(7),
        endsAt: fra(7),
        capacity: 24,
        priceCents: 9000,
        published: true,
      },
    });
    const intento = (await intentiDisponibili(venueId)).find((i) => i.chiave === "evento");
    expect(intento?.titolo).toContain("Cena col produttore");
    expect(intento?.perche).toContain("24 posti");
    expect(intento?.href).toContain(encodeURIComponent("Cena col produttore"));
  });

  it("ogni intento ha un perché e un posto dove andare", async () => {
    await svuota();
    for (let i = 0; i < 3; i++) await ospite({ visite: 10, inattivoDaGiorni: 5 });
    for (const i of await intentiDisponibili(venueId)) {
      expect(i.titolo.length).toBeGreaterThan(0);
      expect(i.perche.length).toBeGreaterThan(0);
      expect(i.href.startsWith("/")).toBe(true);
    }
  });

  it("non mescola i locali", async () => {
    await svuota();
    const altro = await db.venue.create({
      data: {
        orgId,
        name: `${PREFISSO}altro`,
        slug: `${PREFISSO}a${Date.now()}`,
        timezone: "Europe/Rome",
      },
    });
    for (let i = 0; i < 4; i++) {
      await db.guest.create({
        data: {
          venueId: altro.id,
          firstName: `${PREFISSO}altrui`,
          email: `${Math.random().toString(36).slice(2)}@test.local`,
          marketingOptIn: true,
          totalVisits: 10,
          lastVisitAt: new Date(),
        },
      });
    }
    expect((await intentiDisponibili(venueId)).map((i) => i.chiave)).toEqual(["campagna"]);
    await db.guest.deleteMany({ where: { venueId: altro.id } });
    await db.venue.delete({ where: { id: altro.id } });
  });
});
