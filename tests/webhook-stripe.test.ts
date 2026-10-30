import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

/**
 * Il webhook di Stripe: chi firma, cosa è un doppione, cosa si rilavora.
 *
 * - **Due segreti.** Caparre e conti al tavolo sono addebiti diretti
 *   sull'account del ristorante: i loro eventi arrivano dall'endpoint Connect,
 *   con un segreto diverso da quello della piattaforma. Con un segreto solo
 *   venivano rifiutati, e il denaro restava «in corso» per sempre.
 * - **Un doppione è solo un vincolo unico violato**, e un evento rimasto a
 *   metà si riprende — ma non mentre un altro lo sta lavorando.
 * - **Una carta rifiutata non chiude il pagamento**: Checkout lascia
 *   riprovare con un'altra.
 *
 * Le chiavi sono finte e si impostano **prima** di importare la rotta:
 * `lib/stripe` legge la chiave al caricamento. Nessuna chiamata va a Stripe —
 * gli eventi usati qui non ne fanno.
 */

const db = new PrismaClient();
const PREFISSO = "test-whstripe-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const SEGRETO_PIATTAFORMA = "whsec_prova_piattaforma";
const SEGRETO_CONNECT = "whsec_prova_connect";

let POST: (req: Request) => Promise<Response>;
const firmatore = new Stripe("sk_test_finto");
let venueId = "";

function richiesta(evento: object, segreto: string): Request {
  const corpo = JSON.stringify(evento);
  const firma = firmatore.webhooks.generateTestHeaderString({ payload: corpo, secret: segreto });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": firma, "content-type": "application/json" },
    body: corpo,
  });
}

let contatore = 0;
/** Un evento che non tocca niente: un account che nessun locale conosce. */
function eventoInnocuo(): Stripe.Event {
  contatore += 1;
  return {
    id: `evt_${PREFISSO}${Date.now()}_${contatore}`,
    object: "event",
    type: "account.updated",
    account: "acct_sconosciuto",
    data: { object: { id: `acct_${PREFISSO}nessuno`, object: "account" } },
  } as unknown as Stripe.Event;
}

beforeAll(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_finto");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SEGRETO_PIATTAFORMA);
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", SEGRETO_CONNECT);
  vi.resetModules();
  ({ POST } = await import("@/app/api/webhooks/stripe/route"));

  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.webhookEvent.deleteMany({ where: { provider: "stripe", providerEventId: { startsWith: `evt_${PREFISSO}` } } });
  await db.payment.deleteMany({ where: { venueId } });
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("la firma", () => {
  it("accetta gli eventi firmati dall'endpoint della piattaforma", async () => {
    const r = await POST(richiesta(eventoInnocuo(), SEGRETO_PIATTAFORMA));
    expect(r.status).toBe(200);
  });

  it("accetta gli eventi firmati dall'endpoint Connect", async () => {
    const r = await POST(richiesta(eventoInnocuo(), SEGRETO_CONNECT));
    expect(r.status).toBe(200);
  });

  it("rifiuta una firma che non torna con nessuno dei due", async () => {
    const r = await POST(richiesta(eventoInnocuo(), "whsec_inventato"));
    expect(r.status).toBe(400);
  });
});

describe("doppioni e lavori rimasti a metà", () => {
  it("lo stesso evento due volte si lavora una volta", async () => {
    const e = eventoInnocuo();
    expect((await POST(richiesta(e, SEGRETO_CONNECT))).status).toBe(200);
    const secondo = await POST(richiesta(e, SEGRETO_CONNECT));
    expect(secondo.status).toBe(200);
    expect(await secondo.json()).toMatchObject({ ripetuto: true });
  });

  it("un evento registrato e mai finito si riprende al ritentativo", async () => {
    const e = eventoInnocuo();
    await db.webhookEvent.create({
      data: {
        provider: "stripe",
        providerEventId: e.id,
        eventType: e.type,
        payload: {},
        // Il processo che l'aveva preso è morto dieci minuti fa.
        receivedAt: new Date(Date.now() - 10 * 60_000),
      },
    });

    const r = await POST(richiesta(e, SEGRETO_CONNECT));
    expect(r.status).toBe(200);
    expect(await r.json()).not.toMatchObject({ ripetuto: true });
    const riga = await db.webhookEvent.findFirstOrThrow({ where: { provider: "stripe", providerEventId: e.id } });
    expect(riga.processedAt).not.toBeNull();
  });

  it("ma non mentre qualcun altro lo sta lavorando", async () => {
    const e = eventoInnocuo();
    await db.webhookEvent.create({
      data: { provider: "stripe", providerEventId: e.id, eventType: e.type, payload: {}, receivedAt: new Date() },
    });

    const r = await POST(richiesta(e, SEGRETO_CONNECT));
    // Né 200 (lo butterebbe via) né lavorato due volte: Stripe riproverà.
    expect(r.status).toBe(409);
    const riga = await db.webhookEvent.findFirstOrThrow({ where: { provider: "stripe", providerEventId: e.id } });
    expect(riga.processedAt).toBeNull();
  });
});

describe("una carta rifiutata", () => {
  it("non chiude il pagamento: sulla stessa sessione si può riprovare", async () => {
    const pagamento = await db.payment.create({
      data: {
        venueId,
        kind: "TABLE_QR",
        status: "PROCESSING",
        amountCents: 5000,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const e = {
      ...eventoInnocuo(),
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: `pi_${PREFISSO}rifiutato`,
          object: "payment_intent",
          metadata: { tavolo_payment_id: pagamento.id },
          last_payment_error: { code: "card_declined" },
        },
      },
    };

    expect((await POST(richiesta(e, SEGRETO_CONNECT))).status).toBe(200);
    const dopo = await db.payment.findUniqueOrThrow({ where: { id: pagamento.id } });
    expect(dopo.status).toBe("PROCESSING");
    expect(dopo.expiresAt).not.toBeNull();
  });
});
