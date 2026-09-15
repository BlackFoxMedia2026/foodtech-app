import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { abbonamentoDi, limiteDi, rinnovaSeScaduto, sospendiInvii } from "@/server/dem/abbonamento";
import {
  consumaQuota,
  consumaSubito,
  periodoCorrente,
  quotaSufficiente,
  rilasciaQuota,
  riservaQuota,
  statoConsumo,
  storicoConsumo,
} from "@/server/dem/consumo";
import { assicuraPiani, pianoPerSlug } from "@/server/dem/piani";
import { cicloDi } from "@/lib/dem-quota";

/**
 * Il contatore degli invii DEM, contro il database vero.
 *
 * Qui si verifica quello che i test puri non possono: che due richieste
 * simultanee non riescano a riservare gli stessi invii, che un upgrade non
 * azzeri il consumo già fatto, e che un downgrade entri in vigore al rinnovo e
 * non il giorno del clic. Sono le tre cose che, sbagliate, non danno errore —
 * danno una fattura sbagliata o una campagna spedita a metà.
 */

const db = new PrismaClient();
const PREFISSO = "test-dem-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";

async function creaLocale() {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}org-${Date.now()}-${Math.random()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v-${Date.now()}-${Math.random()}` },
  });
  return { orgId: org.id, venueId: venue.id };
}

async function pulisci() {
  await db.demUsagePeriod.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.demSubscription.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.notification.deleteMany({ where: { Venue: { name: { startsWith: PREFISSO } } } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

beforeEach(async () => {
  await pulisci();
  await assicuraPiani();
  ({ venueId, orgId } = await creaLocale());
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

describe("il piano di partenza", () => {
  it("un locale nuovo ha il piano compreso, senza che nessuno lo attivi", async () => {
    const sub = await abbonamentoDi(venueId);
    expect(sub.plan.slug).toBe("incluso");
    expect(limiteDi(sub)).toBe(500);
  });

  it("la quota concordata col singolo cliente vince sul piano", async () => {
    const sub = await abbonamentoDi(venueId);
    await db.demSubscription.update({ where: { id: sub.id }, data: { customMonthlyLimit: 150_000 } });
    const stato = await statoConsumo(venueId);
    expect(stato.limite).toBe(150_000);
  });
});

describe("riserva", () => {
  it("impegna gli invii e li toglie dai disponibili", async () => {
    const esito = await riservaQuota(venueId, 300);
    expect(esito.riservata).toBe(true);
    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(300);
    expect(stato.disponibili).toBe(200);
  });

  it("non riserva niente quando non ce n'è abbastanza, e dice quanti ne mancano", async () => {
    const esito = await riservaQuota(venueId, 900);
    expect(esito).toMatchObject({ riservata: false, disponibili: 500, richiesti: 900, mancanti: 400 });
    const stato = await statoConsumo(venueId);
    // Il punto: zero riservati. Una riserva parziale sarebbe una campagna
    // spedita a metà dei destinatari, scelti dal caso.
    expect(stato.riservati).toBe(0);
  });

  it("due riserve simultanee non si prendono gli stessi invii", async () => {
    // Lo scenario di §19: due schede aperte, due campagne da 300 su 500.
    const [a, b] = await Promise.all([riservaQuota(venueId, 300), riservaQuota(venueId, 300)]);
    const riuscite = [a, b].filter((e) => e.riservata).length;
    expect(riuscite).toBe(1);

    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(300);
    expect(stato.disponibili).toBe(200);
  });

  it("dieci richieste in parallelo non sfondano il tetto", async () => {
    const esiti = await Promise.all(Array.from({ length: 10 }, () => riservaQuota(venueId, 100)));
    expect(esiti.filter((e) => e.riservata).length).toBe(5);
    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(500);
    expect(stato.disponibili).toBe(0);
  });
});

describe("rilascio e consumo", () => {
  it("una campagna annullata restituisce tutti gli invii", async () => {
    const esito = await riservaQuota(venueId, 400);
    expect(esito.riservata).toBe(true);
    if (!esito.riservata) return;

    await rilasciaQuota(venueId, esito.ciclo, 400);
    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(0);
    expect(stato.usati).toBe(0);
    expect(stato.disponibili).toBe(500);
  });

  it("il rilascio ripetuto non manda il contatore sotto zero", async () => {
    const ciclo = cicloDi((await abbonamentoDi(venueId)).currentPeriodStart);
    await riservaQuota(venueId, 100);
    await rilasciaQuota(venueId, ciclo, 100);
    await rilasciaQuota(venueId, ciclo, 100);
    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(0);
  });

  it("consumare sposta dagli impegnati agli usati, non li somma", async () => {
    const esito = await riservaQuota(venueId, 200);
    if (!esito.riservata) throw new Error("riserva non riuscita");
    await consumaQuota(venueId, esito.ciclo, 50);

    const stato = await statoConsumo(venueId);
    expect(stato.usati).toBe(50);
    expect(stato.riservati).toBe(150);
    expect(stato.disponibili).toBe(300);
  });

  it("l'invio di prova consuma subito, e si ferma quando non c'è più spazio", async () => {
    expect(await consumaSubito(venueId, 499)).toBe(true);
    expect(await consumaSubito(venueId, 1)).toBe(true);
    // Il 501° non parte: «Invia test» non è la porta di servizio del piano.
    expect(await consumaSubito(venueId, 1)).toBe(false);
  });
});

describe("cambio di piano", () => {
  it("l'upgrade alza il tetto e non azzera quello che è già stato speso", async () => {
    // §9: Start 17.000/20.000 → Business 17.000/100.000, non 0/100.000.
    const start = await pianoPerSlug("start");
    const business = await pianoPerSlug("business");
    const sub = await abbonamentoDi(venueId);
    await db.demSubscription.update({ where: { id: sub.id }, data: { planId: start!.id } });

    const { periodo } = await periodoCorrente(venueId);
    await db.demUsagePeriod.update({ where: { id: periodo.id }, data: { used: 17_000 } });

    await db.demSubscription.update({ where: { id: sub.id }, data: { planId: business!.id } });
    const stato = await statoConsumo(venueId);

    expect(stato.limite).toBe(100_000);
    expect(stato.usati).toBe(17_000);
    expect(stato.disponibili).toBe(83_000);
  });

  it("il downgrade entra in vigore al rinnovo, non il giorno del clic", async () => {
    const business = await pianoPerSlug("business");
    const start = await pianoPerSlug("start");
    const sub = await abbonamentoDi(venueId);
    await db.demSubscription.update({
      where: { id: sub.id },
      data: { planId: business!.id, scheduledPlanId: start!.id, scheduledChangeAt: sub.currentPeriodEnd },
    });

    // Prima della scadenza: Business, come è stato pagato.
    const prima = await statoConsumo(venueId);
    expect(prima.limite).toBe(100_000);
    expect(prima.pianoProgrammato).toBe("Start");

    // Dopo: Start, e il ciclo nuovo nasce con il tetto nuovo.
    const dopoIlRinnovo = new Date(sub.currentPeriodEnd.getTime() + 60_000);
    const dopo = await statoConsumo(venueId, dopoIlRinnovo);
    expect(dopo.limite).toBe(20_000);
    expect(dopo.pianoProgrammato).toBeNull();
  });
});

describe("cicli e storico", () => {
  it("il rinnovo apre una riga nuova e non cancella quella vecchia", async () => {
    await riservaQuota(venueId, 100);
    const sub = await abbonamentoDi(venueId);
    const esito = await riservaQuota(venueId, 0);
    if (!esito.riservata) throw new Error("impossibile");
    await consumaQuota(venueId, esito.ciclo, 100);

    const dopo = new Date(sub.currentPeriodEnd.getTime() + 60_000);
    await statoConsumo(venueId, dopo);

    const storico = await storicoConsumo(venueId, 12);
    expect(storico.length).toBe(2);
    // Il mese vecchio conserva il suo consumo: è la risposta a «quanto ho
    // speso ad agosto».
    expect(storico.some((p) => p.used === 100)).toBe(true);
    expect(storico[0].used).toBe(0);
  });

  it("un abbonamento fermo da mesi arriva al ciclo di oggi passando dai mesi in mezzo", async () => {
    const sub = await abbonamentoDi(venueId);
    const treMesiDopo = new Date(sub.currentPeriodStart);
    treMesiDopo.setUTCMonth(treMesiDopo.getUTCMonth() + 3);
    treMesiDopo.setUTCDate(15);

    const rinnovato = await rinnovaSeScaduto(sub, treMesiDopo);
    expect(rinnovato.currentPeriodStart.getTime()).toBeGreaterThan(sub.currentPeriodStart.getTime());
    expect(rinnovato.currentPeriodEnd.getTime()).toBeGreaterThan(treMesiDopo.getTime());
  });
});

describe("controlli senza scrittura", () => {
  it("chiedere se la quota basta non consuma niente", async () => {
    const esito = await quotaSufficiente(venueId, 400);
    expect(esito.sufficiente).toBe(true);
    const stato = await statoConsumo(venueId);
    expect(stato.riservati).toBe(0);
    expect(stato.usati).toBe(0);
  });

  it("sospendere gli invii non tocca il contatore: non si cancella niente", async () => {
    await riservaQuota(venueId, 200);
    await sospendiInvii(venueId, "reputazione sotto controllo");
    const stato = await statoConsumo(venueId);
    expect(stato.sospeso).toBe(true);
    expect(stato.riservati).toBe(200);
  });
});
