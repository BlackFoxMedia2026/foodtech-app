import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assicuraPiani } from "@/server/dem/piani";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { periodoCorrente } from "@/server/dem/consumo";
import { cicloDi } from "@/lib/dem-quota";
import { registraUso } from "@/server/costi/ledger";
import { attribuitoAiClienti, registraCostoReale, riconciliaCiclo } from "@/server/costi/riconciliazione";

/* Cost Explorer spento **dentro il test**, qualunque cosa dica l'ambiente: con
   la lettura vera accesa questi controlli dipenderebbero da cosa Amazon ha
   fatturato ieri, cioè dal meteo. Lo stato «solo stima» va provato per quello
   che è — l'assenza del dato — non per la fortuna di non averlo. */
process.env.AWS_COST_EXPLORER_ENABLED = "";

/**
 * La riconciliazione contro il database vero.
 *
 * Due cose che i test puri non possono verificare: che l'attribuzione sommi
 * **solo** quello che è stato speso davvero (e non gli impegni o i rifiuti), e
 * che registrare la fattura non tocchi una sola riga del ledger — che è la
 * regola su cui poggia tutta la fase 4.
 */

const db = new PrismaClient();
const PREFISSO = "test-ric-";
/* Un fornitore tutto loro: `attribuitoAiClienti` somma **tutta** la
   piattaforma — ed è giusto così, è una vista di piattaforma — quindi su
   `AWS` questi test leggerebbero anche i consumi degli altri locali del
   database di sviluppo. */
const PROVIDER = "TEST-RIC-AWS";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let ciclo = "";

async function pulisci() {
  const dove = { venue: { name: { startsWith: PREFISSO } } };
  await db.usageEvent.deleteMany({ where: dove });
  await db.costPeriod.deleteMany({ where: dove });
  await db.demUsagePeriod.deleteMany({ where: dove });
  await db.demSubscription.deleteMany({ where: dove });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.costReconciliation.deleteMany({ where: { provider: PROVIDER } });
  await db.providerPrice.deleteMany({ where: { provider: PROVIDER } });
}

beforeEach(async () => {
  await pulisci();
  await assicuraPiani();
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}o-${Date.now()}-${Math.random()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v-${Date.now()}-${Math.random()}` },
  });
  venueId = venue.id;
  await db.providerPrice.create({
    data: {
      provider: PROVIDER,
      service: "SES_SEND",
      label: "Invio di prova",
      unit: "EMAIL_1000",
      unitPrice: "0.10",
      currency: "USD",
      effectiveFrom: new Date("2020-01-01"),
    },
  });
  const sub = await abbonamentoDi(venueId);
  ciclo = cicloDi(sub.currentPeriodStart);
  await periodoCorrente(venueId);
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

async function consuma(quantita: number, stato: "SENT" | "RESERVED" | "FAILED" | "RECONCILED" = "SENT", chiave = "a") {
  await registraUso({
    venueId,
    provider: PROVIDER,
    service: "SES_SEND",
    eventType: "EMAIL_SENT",
    quantity: quantita,
    yearMonth: ciclo,
    idempotencyKey: `${PREFISSO}${chiave}`,
    status: stato,
  });
}

describe("l'attribuzione somma solo quello che è stato speso", () => {
  it("gli impegni e i rifiuti non entrano nel totale attribuito", async () => {
    await consuma(100_000, "SENT", "spesi");
    await consuma(50_000, "RESERVED", "impegnati");
    await consuma(20_000, "FAILED", "rifiutati");

    const perValuta = await attribuitoAiClienti(ciclo, PROVIDER);
    const nostri = perValuta.find((v) => v.valuta === "USD");
    // 100.000 email a 0,10 $ / 1.000 = 10 $. Gli altri 70.000 non si pagano.
    expect(nostri?.importo).toBeCloseTo(10, 6);
  });

  it("le rettifiche di riconciliazione si sommano alle spese", async () => {
    await consuma(100_000, "SENT", "spesi");
    await consuma(5_000, "RECONCILED", "rettifica");
    const perValuta = await attribuitoAiClienti(ciclo, PROVIDER);
    expect(perValuta[0].importo).toBeCloseTo(10.5, 6);
  });
});

describe("il ciclo si riconcilia", () => {
  it("senza il dato di Amazon resta «solo stima», con l'attribuito scritto", async () => {
    await consuma(184_320, "SENT", "aurora");
    const esito = await riconciliaCiclo(ciclo, { provider: PROVIDER });

    expect(esito.stato).toBe("SOLO_STIMA");
    expect(esito.dichiarato).toBeNull();
    expect(esito.nonAttribuito).toBeNull();
    expect(esito.attribuito).toBeCloseTo(18.432, 3);
  });

  it("registrando la fattura compaiono differenza e scostamento", async () => {
    await consuma(184_320, "SENT", "aurora");
    const esito = await registraCostoReale({ yearMonth: ciclo, importo: 20, valuta: "USD", nota: "fattura di prova", provider: PROVIDER });

    expect(esito.stato).toBe("RICONCILIATO");
    expect(esito.dichiarato).toBe(20);
    expect(esito.nonAttribuito).toBeCloseTo(1.568, 3);
    expect(esito.fonte).toBe("MANUALE");
  });

  it("registrare la fattura **non** tocca il ledger", async () => {
    // È la regola della fase 4: le stime restano quello che erano, e la
    // differenza fra ciò che credevamo e ciò che era resta leggibile.
    await consuma(184_320, "SENT", "aurora");
    const prima = await db.usageEvent.findFirstOrThrow({ where: { venueId } });

    await registraCostoReale({ yearMonth: ciclo, importo: 25, valuta: "USD", provider: PROVIDER });

    const dopo = await db.usageEvent.findUniqueOrThrow({ where: { id: prima.id } });
    expect(Number(dopo.estimatedCost)).toBe(Number(prima.estimatedCost));
    expect(dopo.actualCost).toBeNull();
    expect(dopo.occurredAt).toEqual(prima.occurredAt);
  });

  it("riconciliare due volte aggiorna la stessa riga, non ne crea una seconda", async () => {
    await consuma(100_000, "SENT", "uno");
    await riconciliaCiclo(ciclo, { provider: PROVIDER });
    await riconciliaCiclo(ciclo, { provider: PROVIDER });

    const righe = await db.costReconciliation.count({ where: { yearMonth: ciclo, provider: PROVIDER } });
    expect(righe).toBe(1);
  });

  it("una valuta diversa da quella del ledger non si confronta", async () => {
    // Un dollaro contro un euro produrrebbe uno scostamento del 13% che non
    // esiste: meglio restare «solo stima».
    await consuma(100_000, "SENT", "uno");
    const esito = await registraCostoReale({ yearMonth: ciclo, importo: 9, valuta: "EUR", provider: PROVIDER });
    expect(esito.stato).toBe("SOLO_STIMA");
    expect(esito.nonAttribuito).toBeNull();
  });
});
