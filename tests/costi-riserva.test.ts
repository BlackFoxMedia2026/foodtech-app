import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assicuraPiani, pianoPerSlug } from "@/server/dem/piani";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { periodoCorrente } from "@/server/dem/consumo";
import { cicloDi } from "@/lib/dem-quota";
import { registraUso, dettaglioPerServizio } from "@/server/costi/ledger";
import {
  assicuraPeriodoCosti,
  consumaCosto,
  rilasciaCosto,
  riservaCosto,
  stimaCostoInvio,
} from "@/server/costi/riserva";
import { ricalcolaPeriodo } from "@/server/costi/periodo";
import { autorizzaSuperamento } from "@/server/costi/override";
import { generaAvvisi } from "@/server/costi/avvisi";

/**
 * Il freno economico, contro il database vero.
 *
 * Qui si verifica quello che i test puri non possono: che due campagne
 * simultanee non riescano a impegnare lo stesso budget, che un webhook
 * ripetuto non raddoppi un costo, che un override scada da solo al ciclo
 * nuovo. Sono le tre cose che, sbagliate, non danno errore — danno una
 * bolletta più alta del previsto o un cliente bloccato senza motivo.
 */

const db = new PrismaClient();
const PREFISSO = "test-costi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";

async function pulisci() {
  const dove = { venue: { name: { startsWith: PREFISSO } } };
  await db.platformAlert.deleteMany({ where: dove });
  await db.usageEvent.deleteMany({ where: dove });
  await db.costOverride.deleteMany({ where: dove });
  await db.costPeriod.deleteMany({ where: dove });
  await db.demUsagePeriod.deleteMany({ where: dove });
  await db.demSubscription.deleteMany({ where: dove });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.providerPrice.deleteMany({ where: { provider: `${PREFISSO}AWS` } });
  await db.cambioValuta.deleteMany({ where: { da: "TST" } });
}

async function listino(prezzo = "0.10") {
  await db.providerPrice.create({
    data: {
      provider: "AWS",
      service: `${PREFISSO}SES_SEND`,
      label: "Invio di prova",
      unit: "EMAIL_1000",
      unitPrice: prezzo,
      currency: "USD",
      effectiveFrom: new Date("2020-01-01"),
    },
  });
}

async function conBudget(centesimi: number | null) {
  const piano = await pianoPerSlug("incluso");
  await db.demPlan.update({ where: { id: piano!.id }, data: { awsBudgetCents: centesimi } });
  await db.costPeriod.updateMany({ where: { venueId }, data: { budgetCents: centesimi } });
}

beforeEach(async () => {
  await pulisci();
  await assicuraPiani();
  /* Il listino: senza, `registraUso` non scrive niente e i test passerebbero
     solo su un database già seminato a mano. */
  const listinoEsistente = await db.providerPrice.findFirst({
    where: { provider: "AWS", service: "SES_SEND", active: true },
  });
  if (!listinoEsistente) {
    await db.providerPrice.create({
      data: {
        provider: "AWS",
        service: "SES_SEND",
        label: "Invio email",
        unit: "EMAIL_1000",
        unitPrice: "0.10",
        currency: "USD",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
  }
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}o-${Date.now()}-${Math.random()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v-${Date.now()}-${Math.random()}` },
  });
  venueId = venue.id;
  await abbonamentoDi(venueId);
  await periodoCorrente(venueId);
});

afterAll(async () => {
  const piano = await pianoPerSlug("incluso");
  if (piano) await db.demPlan.update({ where: { id: piano.id }, data: { awsBudgetCents: null } });
  await pulisci();
  await db.$disconnect();
});

describe("la riserva del budget è atomica (§3)", () => {
  it("due campagne che impegnano lo stesso budget: passa una sola", async () => {
    /* La scena da evitare: A e B leggono entrambe «€10 disponibili», costano
       €8 ciascuna, partono tutte e due, e il mese chiude a €16 su un budget di
       €10. Il controllo e la sottrazione stanno nella stessa UPDATE, quindi
       Postgres ne lascia passare una. */
    await assicuraPeriodoCosti(venueId);
    await conBudget(1000);

    const [a, b] = await Promise.all([riservaCosto(venueId, 800), riservaCosto(venueId, 800)]);
    const passate = [a, b].filter((r) => r.riservato).length;
    expect(passate).toBe(1);

    const periodo = await db.costPeriod.findFirstOrThrow({ where: { venueId } });
    expect(periodo.reservedCents).toBe(800);
  });

  it("senza budget configurato la riserva passa sempre: non c'è niente da proteggere", async () => {
    await assicuraPeriodoCosti(venueId);
    await conBudget(null);
    const esito = await riservaCosto(venueId, 999_999);
    expect(esito.riservato).toBe(true);
  });

  it("il rilascio non porta il riservato sotto zero", async () => {
    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await conBudget(10_000);
    await riservaCosto(venueId, 500);
    await rilasciaCosto(venueId, yearMonth, 500);
    await rilasciaCosto(venueId, yearMonth, 500);
    const periodo = await db.costPeriod.findFirstOrThrow({ where: { venueId } });
    expect(periodo.reservedCents).toBe(0);
  });
});

describe("riserva e consumo reale (§1)", () => {
  it("una campagna annullata a metà lascia speso solo quello che è partito", async () => {
    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await conBudget(10_000);

    // 50.000 destinatari impegnati, 10.000 partiti, il resto liberato.
    await riservaCosto(venueId, 5_000);
    await consumaCosto(venueId, yearMonth, 1_000);
    await rilasciaCosto(venueId, yearMonth, 4_000);

    const periodo = await db.costPeriod.findFirstOrThrow({ where: { venueId } });
    expect(periodo.amountCents).toBe(1_000);
    expect(periodo.reservedCents).toBe(0);
  });

  it("l'impegnato non entra nel costo del ciclo", async () => {
    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await conBudget(10_000);
    await riservaCosto(venueId, 3_000);

    await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 10_000, yearMonth, idempotencyKey: `${PREFISSO}uno`,
    });

    const stato = await ricalcolaPeriodo(venueId);
    // Il costo viene dal ledger: solo quello che è partito davvero.
    expect(stato.originalAmount).toBeCloseTo(1, 6);
  });
});

describe("il ledger non conta due volte (§22)", () => {
  it("lo stesso evento registrato due volte conta una volta sola", async () => {
    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    const uno = await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 50_000, yearMonth, idempotencyKey: `${PREFISSO}doppio`,
    });
    const due = await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 50_000, yearMonth, idempotencyKey: `${PREFISSO}doppio`,
    });

    expect(uno.registrato).toBe(true);
    expect(due.registrato).toBe(false);
    const righe = await dettaglioPerServizio(venueId, yearMonth);
    expect(righe[0].quantita).toBe(50_000);
  });

  it("un rifiuto prima dell'accettazione si registra a costo zero (§9)", async () => {
    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 400, yearMonth, idempotencyKey: `${PREFISSO}falliti`, status: "FAILED",
    });

    const righe = await dettaglioPerServizio(venueId, yearMonth);
    // Non compare fra i costi: Amazon non l'ha accettata, non la fattura.
    expect(righe).toHaveLength(0);
    const scritte = await db.usageEvent.count({ where: { venueId, status: "FAILED" } });
    expect(scritte).toBe(1);
  });

  it("una rettifica di riconciliazione somma senza toccare la riga originale (§7)", async () => {
    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 80_000, yearMonth, idempotencyKey: `${PREFISSO}originale`,
    });
    const originale = await db.usageEvent.findFirstOrThrow({ where: { venueId } });

    await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 2_000, yearMonth, idempotencyKey: `${PREFISSO}rettifica`, status: "RECONCILED",
    });

    const dopo = await db.usageEvent.findUniqueOrThrow({ where: { id: originale.id } });
    expect(Number(dopo.estimatedCost)).toBe(Number(originale.estimatedCost));
    const stato = await ricalcolaPeriodo(venueId);
    expect(stato.originalAmount).toBeCloseTo(8.2, 6);
  });
});

describe("listino e cambio mancanti (§13)", () => {
  it("senza listino la stima non vale zero: dice che non si può calcolare", async () => {
    await db.providerPrice.updateMany({ where: { service: "SES_SEND" }, data: { active: false } });
    const stima = await stimaCostoInvio(10_000);
    expect(stima.calcolabile).toBe(false);
    if (!stima.calcolabile) expect(stima.motivo).toBe("SENZA_LISTINO");
    await db.providerPrice.updateMany({ where: { service: "SES_SEND" }, data: { active: true } });
  });

  it("senza cambio la stima non vale zero", async () => {
    const cambi = await db.cambioValuta.findMany({ where: { da: "USD", a: "EUR" } });
    await db.cambioValuta.deleteMany({ where: { da: "USD", a: "EUR" } });

    const stima = await stimaCostoInvio(10_000);
    expect(stima.calcolabile).toBe(false);
    if (!stima.calcolabile) expect(stima.motivo).toBe("SENZA_CAMBIO");

    for (const c of cambi) {
      await db.cambioValuta.create({ data: { da: c.da, a: c.a, tasso: c.tasso, lettoIl: c.lettoIl } });
    }
  });
});

describe("gli override del Super Admin (§6)", () => {
  it("alzano il budget del ciclo corrente e restano scritti con chi li ha fatti", async () => {
    await assicuraPeriodoCosti(venueId);
    await conBudget(4_000);

    const esito = await autorizzaSuperamento({
      venueId, kind: "BUDGET", delta: 2_000, note: "campagna di Natale", actorEmail: "luca@esempio.it",
    });

    expect(esito.precedente).toBe(4_000);
    expect(esito.nuovo).toBe(6_000);

    const riga = await db.costOverride.findFirstOrThrow({ where: { venueId } });
    expect(riga.actorEmail).toBe("luca@esempio.it");
    expect(riga.note).toBe("campagna di Natale");

    const periodo = await db.costPeriod.findFirstOrThrow({ where: { venueId } });
    expect(periodo.budgetCents).toBe(6_000);
  });

  it("valgono per il ciclo: al mese nuovo il budget torna quello del piano", async () => {
    await assicuraPeriodoCosti(venueId);
    await conBudget(4_000);
    await autorizzaSuperamento({ venueId, kind: "BUDGET", delta: 2_000, actorEmail: "luca@esempio.it" });

    // Un ciclo diverso non vede l'override: la ricerca è per (locale, ciclo).
    const { budgetEffettivo } = await import("@/server/costi/periodo");
    const altroCiclo = await budgetEffettivo(venueId, "2099-01", 4_000);
    expect(altroCiclo).toBe(4_000);
  });

  it("su un cliente senza budget non si autorizza un superamento: creerebbe un tetto", async () => {
    await assicuraPeriodoCosti(venueId);
    await conBudget(null);
    await expect(
      autorizzaSuperamento({ venueId, kind: "BUDGET", delta: 2_000, actorEmail: "luca@esempio.it" }),
    ).rejects.toThrow("override_senza_budget");
  });

  it("l'override sugli invii alza il tetto su cui gira la riserva atomica", async () => {
    const prima = await periodoCorrente(venueId);
    const esito = await autorizzaSuperamento({
      venueId, kind: "EMAILS", delta: 50_000, actorEmail: "luca@esempio.it",
    });

    expect(esito.nuovo).toBe(prima.periodo.monthlyLimit + 50_000);
    const dopo = await periodoCorrente(venueId);
    expect(dopo.periodo.monthlyLimit).toBe(prima.periodo.monthlyLimit + 50_000);
  });
});

describe("gli avvisi non si ripetono (§11)", () => {
  it("lo stesso stato ripassato dal cron non genera un secondo avviso", async () => {
    await assicuraPeriodoCosti(venueId);
    await conBudget(1_000);
    await db.cambioValuta.create({ data: { da: "USD", a: "EUR", tasso: 0.87 } });

    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 100_000, yearMonth, idempotencyKey: `${PREFISSO}soglia`,
    });

    const stato = await ricalcolaPeriodo(venueId);
    const primi = await generaAvvisi(stato, "Locale di prova");
    const secondi = await generaAvvisi(stato, "Locale di prova");

    expect(primi).toBeGreaterThan(0);
    expect(secondi).toBe(0);
  });

  it("le soglie attraversate si annunciano tutte, non solo l'ultima", async () => {
    await assicuraPeriodoCosti(venueId);
    await conBudget(1_000);
    await db.cambioValuta.create({ data: { da: "USD", a: "EUR", tasso: 0.87 } });

    const { yearMonth } = await assicuraPeriodoCosti(venueId);
    await registraUso({
      venueId, provider: "AWS", service: "SES_SEND", eventType: "EMAIL_SENT",
      quantity: 200_000, yearMonth, idempotencyKey: `${PREFISSO}tutte`,
    });

    const stato = await ricalcolaPeriodo(venueId);
    await generaAvvisi(stato, "Locale di prova");

    const tipi = await db.platformAlert.findMany({ where: { venueId }, select: { kind: true } });
    expect(tipi.map((t) => t.kind).sort()).toEqual(["BUDGET_CRITICAL", "BUDGET_LIMIT", "BUDGET_WARNING"]);
  });
});
