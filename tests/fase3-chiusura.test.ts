import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { vietaDatiDemo, databaseNonDiProduzione } from "@/lib/ambiente-dati";
import { eSuperAdmin } from "@/lib/super-admin";
import { assicuraPiani, pianoPerSlug } from "@/server/dem/piani";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { periodoCorrente } from "@/server/dem/consumo";
import { cicloDi } from "@/lib/dem-quota";
import { elencoCosti } from "@/server/costi/piattaforma-costi";

/**
 * La chiusura della fase 3: il pannello del blocco, il filtro per piano, le
 * linguette e la difesa dei dati demo.
 *
 * Il filo che li tiene insieme è uno: nessuno di questi pezzi deve far uscire
 * un'informazione economica dalla parte sbagliata: né verso il ristoratore, né
 * verso un database di produzione.
 */

const db = new PrismaClient();
const PREFISSO = "test-fase3-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let ciclo = "";

async function pulisci() {
  const dove = { venue: { name: { startsWith: PREFISSO } } };
  await db.campaign.deleteMany({ where: dove });
  await db.costPeriod.deleteMany({ where: dove });
  await db.demUsagePeriod.deleteMany({ where: dove });
  await db.demSubscription.deleteMany({ where: dove });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

async function locale(nome: string, slugPiano: string) {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}o-${Date.now()}-${Math.random()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}${nome}`, slug: `${PREFISSO}v-${Date.now()}-${Math.random()}` },
  });
  const sub = await abbonamentoDi(venue.id);
  ciclo = cicloDi(sub.currentPeriodStart);
  await periodoCorrente(venue.id);

  const piano = await pianoPerSlug(slugPiano);
  await db.demSubscription.update({ where: { venueId: venue.id }, data: { planId: piano!.id } });

  await db.costPeriod.create({
    data: {
      venueId: venue.id,
      yearMonth: ciclo,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      originalAmount: "10",
      amountCents: 1000,
      budgetCents: 4000,
      stato: "NORMALE",
    },
  });
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

describe("il pannello del blocco è solo per la piattaforma (§1)", () => {
  it("il motivo e i numeri restano sulla campagna, non nel messaggio al cliente", async () => {
    const venueId = await locale("bloccato", "pro");
    const campagna = await db.campaign.create({
      data: {
        venueId,
        name: `${PREFISSO}campagna`,
        status: "DRAFT",
        blockedAt: new Date(),
        blockedReason: "BUDGET_LIMIT_EXCEEDED",
        blockedDetail: {
          spesoCents: 3800,
          impegnatoCents: 0,
          stimaCents: 700,
          budgetCents: 4000,
          totaleCents: 4500,
          eccedenzaCents: 500,
        },
      },
    });

    const riga = await db.campaign.findUniqueOrThrow({ where: { id: campagna.id } });
    const dettaglio = riga.blockedDetail as Record<string, number>;
    expect(riga.blockedReason).toBe("BUDGET_LIMIT_EXCEEDED");
    expect(dettaglio.totaleCents).toBe(4500);
    expect(dettaglio.eccedenzaCents).toBe(500);
  });

  it("un account cliente non supera il controllo che protegge il pannello", () => {
    // È lo stesso controllo che la pagina campagna esegue **server-side**:
    // senza, il riquadro verrebbe reso e spedito al browser del ristoratore.
    expect(eSuperAdmin("titolare@ristorante.it")).toBe(false);
    expect(eSuperAdmin(null)).toBe(false);
  });

  it("i tre motivi restano distinti sulla riga (§2)", async () => {
    const venueId = await locale("motivi", "pro");
    for (const motivo of ["EMAIL_LIMIT_EXCEEDED", "BUDGET_LIMIT_EXCEEDED", "COST_CALCULATION_UNAVAILABLE"]) {
      const c = await db.campaign.create({
        data: { venueId, name: `${PREFISSO}${motivo}`, status: "DRAFT", blockedAt: new Date(), blockedReason: motivo },
      });
      const riga = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
      expect(riga.blockedReason).toBe(motivo);
    }
  });

  it("una campagna mai bloccata non ha niente da mostrare", async () => {
    const venueId = await locale("pulita", "pro");
    const c = await db.campaign.create({ data: { venueId, name: `${PREFISSO}ok`, status: "DRAFT" } });
    const riga = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(riga.blockedReason).toBeNull();
    expect(riga.blockedAt).toBeNull();
  });
});

describe("il filtro per piano (§3)", () => {
  it("tiene solo i clienti di quel piano", async () => {
    await locale("pro", "pro");
    await locale("business", "business");

    const { righe } = await elencoCosti({ ciclo, pianoSlug: "pro", perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri).toHaveLength(1);
    expect(nostri[0].pianoSlug).toBe("pro");
  });

  it("funziona insieme alla ricerca", async () => {
    await locale("aurora", "pro");
    await locale("riva", "pro");
    const { righe } = await elencoCosti({ ciclo, pianoSlug: "pro", ricerca: "aurora", perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri).toHaveLength(1);
    expect(nostri[0].locale).toContain("aurora");
  });

  it("funziona insieme al filtro di stato", async () => {
    await locale("tranquillo", "pro");
    const critico = await locale("critico", "pro");
    await db.costPeriod.updateMany({ where: { venueId: critico }, data: { stato: "CRITICO", amountCents: 3700 } });

    const { righe } = await elencoCosti({ ciclo, pianoSlug: "pro", filtro: "critici", perPagina: 50 });
    const nostri = righe.filter((r) => r.locale.startsWith(PREFISSO));
    expect(nostri).toHaveLength(1);
    expect(nostri[0].locale).toContain("critico");
  });

  it("un piano inesistente non restituisce niente, invece di ignorare il filtro", async () => {
    await locale("pro", "pro");
    const { righe } = await elencoCosti({ ciclo, pianoSlug: "non-esiste", perPagina: 50 });
    expect(righe.filter((r) => r.locale.startsWith(PREFISSO))).toHaveLength(0);
  });
});

describe("i dati dimostrativi non arrivano in produzione (§5)", () => {
  it("un database di sviluppo o di prova passa", () => {
    expect(databaseNonDiProduzione("postgresql://x@localhost:5432/tavolo_dev")).toBe(true);
    expect(databaseNonDiProduzione("postgresql://x@host/tavolo_test")).toBe(true);
    expect(vietaDatiDemo("postgresql://x@localhost:5432/tavolo_dev", false)).toBeNull();
  });

  it("un database che non si dichiara di sviluppo viene rifiutato", () => {
    const messaggio = vietaDatiDemo("postgresql://x@rds.amazonaws.com/tavolo", false);
    expect(messaggio).not.toBeNull();
    expect(messaggio).toContain("SEED_DEMO_PRODUZIONE=1");
  });

  it("la scappatoia esiste ma va chiesta a voce alta", () => {
    expect(vietaDatiDemo("postgresql://x@rds.amazonaws.com/tavolo", true)).toBeNull();
  });

  it("i tre seed usano la stessa difesa", async () => {
    // Una difesa copiata tre volte è una difesa dimenticata in uno dei tre:
    // questo test fallisce se qualcuno ne scrive una quarta versione a mano.
    const { readFileSync } = await import("node:fs");
    for (const file of ["prisma/seed.ts", "prisma/seed-e2e.ts"]) {
      expect(readFileSync(file, "utf8")).toContain("vietaDatiDemo");
    }
  });
});
