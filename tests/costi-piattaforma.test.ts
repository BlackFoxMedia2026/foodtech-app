import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assicuraPiani, pianoPerSlug } from "@/server/dem/piani";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { periodoCorrente } from "@/server/dem/consumo";
import { cicloDi } from "@/lib/dem-quota";
import { elencoCosti, kpiCosti } from "@/server/costi/piattaforma-costi";
import { eSuperAdmin } from "@/lib/super-admin";

/**
 * La tabella di piattaforma, contro il database vero.
 *
 * Quello che conta qui non è che i numeri escano: è che escano **nell'ordine
 * giusto**. Una tabella di trecento clienti si guarda per tre righe, e se il
 * cliente bloccato è alla riga ottantasette tanto vale non averla.
 */

const db = new PrismaClient();
const PREFISSO = "test-piatt-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let ciclo = "";

async function pulisci() {
  const dove = { venue: { name: { startsWith: PREFISSO } } };
  await db.costOverride.deleteMany({ where: dove });
  await db.costPeriod.deleteMany({ where: dove });
  await db.demUsagePeriod.deleteMany({ where: dove });
  await db.demSubscription.deleteMany({ where: dove });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

async function cliente(
  nome: string,
  costi: {
    amountCents?: number | null;
    budgetCents?: number | null;
    forecastCents?: number | null;
    stato?: string;
    allowOverage?: boolean;
    reservedCents?: number;
    originalAmount?: string;
    sospeso?: boolean;
    override?: boolean;
  },
) {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}o-${Date.now()}-${Math.random()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}v-${Date.now()}-${Math.random()}` },
  });
  const sub = await abbonamentoDi(venue.id);
  ciclo = cicloDi(sub.currentPeriodStart);
  await periodoCorrente(venue.id);

  if (costi.sospeso) {
    await db.demSubscription.update({
      where: { venueId: venue.id },
      data: { sendingPausedAt: new Date(), sendingPausedReason: "prova" },
    });
  }

  await db.costPeriod.create({
    data: {
      venueId: venue.id,
      yearMonth: ciclo,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      originalAmount: costi.originalAmount ?? "10",
      amountCents: costi.amountCents === undefined ? 1000 : costi.amountCents,
      reservedCents: costi.reservedCents ?? 0,
      budgetCents: costi.budgetCents === undefined ? 4000 : costi.budgetCents,
      forecastCents: costi.forecastCents ?? null,
      stato: costi.stato ?? "NORMALE",
      allowOverage: costi.allowOverage ?? false,
    },
  });

  if (costi.override) {
    await db.costOverride.create({
      data: {
        venueId: venue.id,
        yearMonth: ciclo,
        kind: "BUDGET",
        oldValue: 4000,
        newValue: 6000,
        actorEmail: "luca@esempio.it",
      },
    });
  }

  return venue.id;
}

beforeEach(async () => {
  await pulisci();
  await assicuraPiani();
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

describe("l'ordinamento per criticità (§5)", () => {
  it("il bloccato è la prima riga, il regolare l'ultima", async () => {
    await cliente("regolare", { stato: "NORMALE" });
    await cliente("attenzione", { stato: "ATTENZIONE", amountCents: 3100 });
    await cliente("critico", { stato: "CRITICO", amountCents: 3700 });
    await cliente("bloccato", { stato: "LIMITE", amountCents: 4100, allowOverage: false });

    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri[0].locale).toContain("bloccato");
    expect(nostri[nostri.length - 1].locale).toContain("regolare");
  });

  it("la previsione di superamento sale sopra l'attenzione", async () => {
    await cliente("attenzione", { stato: "ATTENZIONE", amountCents: 3100 });
    await cliente("previsione", { stato: "NORMALE", amountCents: 1600, forecastCents: 6900 });

    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri[0].locale).toContain("previsione");
  });

  it("a parità di stato viene prima chi ha consumato una quota maggiore", async () => {
    await cliente("poco", { stato: "ATTENZIONE", amountCents: 3100 });
    await cliente("tanto", { stato: "ATTENZIONE", amountCents: 3500 });

    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri[0].locale).toContain("tanto");
  });
});

describe("gli stati composti arrivano dal backend (§4)", () => {
  it("regolare più previsione di superamento: due etichette", async () => {
    await cliente("aurora", { stato: "NORMALE", amountCents: 1604, budgetCents: 4000, forecastCents: 6951 });
    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const aurora = righe.find((r) => r.locale.includes("aurora"))!;
    expect(aurora.etichette).toEqual(["NORMALE", "PREVISIONE_SUPERAMENTO"]);
    expect(aurora.percentuale).toBe(40.1);
  });

  it("un costo non calcolabile non diventa zero (§21)", async () => {
    await cliente("senzacambio", { amountCents: null, originalAmount: "18.43" });
    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const riga = righe.find((r) => r.locale.includes("senzacambio"))!;
    expect(riga.calcolabile).toBe(false);
    expect(riga.amountCents).toBeNull();
    expect(riga.etichette).toContain("NON_CALCOLABILE");
  });

  it("l'override attivo si vede in tabella", async () => {
    await cliente("autorizzato", { override: true });
    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const riga = righe.find((r) => r.locale.includes("autorizzato"))!;
    expect(riga.overrideAttivo).toBe(true);
    expect(riga.etichette).toContain("OVERRIDE_ATTIVO");
  });

  it("l'impegnato viaggia accanto allo speso, non sommato", async () => {
    await cliente("impegnato", { amountCents: 1604, reservedCents: 642 });
    const { righe } = await elencoCosti({ ciclo, perPagina: 50 });
    const riga = righe.find((r) => r.locale.includes("impegnato"))!;
    expect(riga.amountCents).toBe(1604);
    expect(riga.reservedCents).toBe(642);
  });
});

describe("filtri e impaginazione (§6, §28)", () => {
  it("il filtro «bloccati» prende sospesi e clienti al tetto", async () => {
    await cliente("sospeso", { sospeso: true });
    await cliente("regolare", {});
    const { righe } = await elencoCosti({ ciclo, filtro: "bloccati", perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri).toHaveLength(1);
    expect(nostri[0].locale).toContain("sospeso");
  });

  it("la ricerca filtra per nome", async () => {
    await cliente("aurora", {});
    await cliente("riva", {});
    const { righe } = await elencoCosti({ ciclo, ricerca: "aurora", perPagina: 50 });
    expect(righe.every((r) => r.locale.toLowerCase().includes("aurora"))).toBe(true);
  });

  it("l'impaginazione limita le righe e dichiara il totale", async () => {
    // Il totale arriva da una finestra SQL: non serve una seconda query, e non
    // dipende da quante righe stiamo trasportando.
    // Cinque è la pagina più piccola che il server accetta: sotto, il costo di
    // una richiesta supera quello delle righe che porta.
    for (const n of ["uno", "due", "tre", "quattro", "cinque", "sei"]) await cliente(n, {});
    const pagina1 = await elencoCosti({ ciclo, perPagina: 5, pagina: 1 });
    const pagina2 = await elencoCosti({ ciclo, perPagina: 5, pagina: 2 });

    expect(pagina1.righe).toHaveLength(5);
    expect(pagina1.totale).toBeGreaterThanOrEqual(6);
    expect(pagina2.righe.length).toBeGreaterThanOrEqual(1);
    const idPagina1 = pagina1.righe.map((r) => r.venueId);
    expect(pagina2.righe.every((r) => !idPagina1.includes(r.venueId))).toBe(true);
  });
});

describe("i totali di testata", () => {
  it("sommano costo, budget e previsione e contano gli stati", async () => {
    await cliente("uno", { amountCents: 1000, budgetCents: 4000, stato: "NORMALE" });
    await cliente("due", { amountCents: 3700, budgetCents: 4000, stato: "CRITICO" });

    const kpi = await kpiCosti(ciclo);
    expect(kpi.costoTotaleCents).toBeGreaterThanOrEqual(4700);
    expect(kpi.critici).toBeGreaterThanOrEqual(1);
  });
});

describe("i costi non escono da chi non è Super Admin (§30)", () => {
  it("un'email fuori dall'elenco non è amministratore", () => {
    // È il controllo che ogni rotta dei costi esegue per conto suo, prima di
    // qualunque lettura: la UI che nasconde la voce di menu non è una difesa.
    expect(eSuperAdmin("cliente@ristorante.it")).toBe(false);
  });
});
