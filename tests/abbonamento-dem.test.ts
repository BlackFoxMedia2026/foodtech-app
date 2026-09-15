import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { sincronizzaAbbonamentoStripe } from "@/server/dem/stripe-dem";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { statoConsumo } from "@/server/dem/consumo";
import { assicuraPiani } from "@/server/dem/piani";

/**
 * Il riallineamento con Stripe.
 *
 * Stripe consegna gli eventi **più di una volta** e **fuori ordine**: è
 * dichiarato, non è un guasto. Quindi la funzione che li applica non può
 * sommare né sottrarre niente — descrive uno stato finale — e questi test
 * verificano proprio quello: eseguirla due volte, o eseguirla al contrario,
 * deve lasciare il cliente nello stesso posto.
 *
 * Gli oggetti Stripe sono costruiti a mano: chiamare la rete renderebbe il
 * test lento, instabile e dipendente da un account. Quello che va verificato
 * è cosa facciamo **noi** con quella risposta.
 */

const db = new PrismaClient();
const PREFISSO = "test-abb-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";

function abbonamentoStripe(opts: {
  priceId: string;
  stato?: Stripe.Subscription.Status;
  inizio?: Date;
  fine?: Date;
  disdetto?: boolean;
}): Stripe.Subscription {
  const inizio = opts.inizio ?? new Date("2026-09-01T00:00:00Z");
  const fine = opts.fine ?? new Date("2026-10-01T00:00:00Z");
  return {
    id: "sub_prova",
    object: "subscription",
    customer: "cus_prova",
    status: opts.stato ?? "active",
    cancel_at_period_end: opts.disdetto ?? false,
    current_period_start: Math.floor(inizio.getTime() / 1000),
    current_period_end: Math.floor(fine.getTime() / 1000),
    metadata: { venueId, prodotto: "dem" },
    items: { object: "list", data: [{ id: "si_1", price: { id: opts.priceId } }] },
  } as unknown as Stripe.Subscription;
}

async function prezzoDi(slug: string): Promise<string> {
  const piano = await db.demPlan.findUniqueOrThrow({ where: { slug } });
  const priceId = `price_${slug}`;
  if (piano.stripePriceId !== priceId) {
    await db.demPlan.update({ where: { id: piano.id }, data: { stripePriceId: priceId } });
  }
  return priceId;
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
  await db.demUsagePeriod.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.demSubscription.deleteMany({ where: { venueId } });
  await db.demPlan.updateMany({ where: { stripePriceId: { startsWith: "price_" } }, data: { stripePriceId: null } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("un abbonamento pagato", () => {
  it("porta il locale sul piano comprato", async () => {
    await abbonamentoDi(venueId);
    await sincronizzaAbbonamentoStripe(abbonamentoStripe({ priceId: await prezzoDi("business") }));

    const sub = await abbonamentoDi(venueId, new Date("2026-09-15T00:00:00Z"));
    expect(sub.plan.slug).toBe("business");
    expect(sub.status).toBe("ACTIVE");
    expect(sub.stripeSubscriptionId).toBe("sub_prova");
  });

  it("lo stesso evento due volte lascia tutto com'era", async () => {
    await abbonamentoDi(venueId);
    const evento = abbonamentoStripe({ priceId: await prezzoDi("business") });

    await sincronizzaAbbonamentoStripe(evento);
    const dopoUno = await statoConsumo(venueId, new Date("2026-09-15T00:00:00Z"));
    await sincronizzaAbbonamentoStripe(evento);
    const dopoDue = await statoConsumo(venueId, new Date("2026-09-15T00:00:00Z"));

    expect(dopoDue).toEqual(dopoUno);
    expect(await db.demUsagePeriod.count({ where: { venueId } })).toBe(1);
  });

  it("il ciclo è quello di Stripe, non uno calcolato da noi", async () => {
    // Fatturato il 3, non il 1°: il mese del cliente comincia il 3, altrimenti
    // paga un mese e ne riceve ventotto giorni.
    await abbonamentoDi(venueId);
    await sincronizzaAbbonamentoStripe(
      abbonamentoStripe({
        priceId: await prezzoDi("start"),
        inizio: new Date("2026-09-03T10:00:00Z"),
        fine: new Date("2026-10-03T10:00:00Z"),
      }),
    );

    const sub = await abbonamentoDi(venueId, new Date("2026-09-15T00:00:00Z"));
    expect(sub.currentPeriodStart.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(sub.currentPeriodEnd.toISOString()).toBe("2026-10-03T10:00:00.000Z");
  });
});

describe("un abbonamento che non è ancora pagato", () => {
  it("non dà la quota a chi ha solo aperto il pagamento", async () => {
    await abbonamentoDi(venueId);
    // Prima si torna al piano compreso, poi arriva un `incomplete`.
    await sincronizzaAbbonamentoStripe(abbonamentoStripe({ priceId: await prezzoDi("business") }));
    await sincronizzaAbbonamentoStripe(
      abbonamentoStripe({ priceId: await prezzoDi("premium"), stato: "incomplete" }),
    );

    const sub = await abbonamentoDi(venueId, new Date("2026-09-15T00:00:00Z"));
    // Il piano resta quello pagato davvero: un checkout aperto e abbandonato
    // non regala un milione di email.
    expect(sub.plan.slug).toBe("business");
    expect(sub.status).toBe("INCOMPLETE");
  });

  it("un pagamento in ritardo non toglie il servizio già pagato", async () => {
    await abbonamentoDi(venueId);
    await sincronizzaAbbonamentoStripe(
      abbonamentoStripe({ priceId: await prezzoDi("business"), stato: "past_due" }),
    );

    const stato = await statoConsumo(venueId, new Date("2026-09-15T00:00:00Z"));
    expect(stato.limite).toBe(100_000);
    expect(stato.sospeso).toBe(false);
  });
});

describe("l'upgrade non azzera il consumo", () => {
  it("quello che è già stato inviato resta contato", async () => {
    await abbonamentoDi(venueId);
    await sincronizzaAbbonamentoStripe(abbonamentoStripe({ priceId: await prezzoDi("start") }));

    const adesso = new Date("2026-09-15T00:00:00Z");
    const { id } = await db.demUsagePeriod.findFirstOrThrow({ where: { venueId } });
    await db.demUsagePeriod.update({ where: { id }, data: { used: 17_000 } });

    await sincronizzaAbbonamentoStripe(abbonamentoStripe({ priceId: await prezzoDi("business") }));

    const stato = await statoConsumo(venueId, adesso);
    expect(stato.limite).toBe(100_000);
    expect(stato.usati).toBe(17_000);
    expect(stato.disponibili).toBe(83_000);
  });
});

describe("un abbonamento di nessuno", () => {
  it("non viene assegnato a caso", async () => {
    const senzaLocale = {
      ...abbonamentoStripe({ priceId: await prezzoDi("premium") }),
      metadata: {},
    } as Stripe.Subscription;

    await sincronizzaAbbonamentoStripe(senzaLocale);
    const sub = await abbonamentoDi(venueId, new Date("2026-09-15T00:00:00Z"));
    expect(sub.plan.slug).not.toBe("premium");
  });
});
