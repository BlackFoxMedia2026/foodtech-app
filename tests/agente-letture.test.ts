import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { toolRegistry } from "@/server/ai/tool-registry";
import type { AgentContext } from "@/server/ai/types";

/**
 * Gli strumenti dell'agente che **leggono**.
 *
 * Non scrivono, quindi sbagliando non rovinano dati: fanno una cosa peggiore
 * in un altro modo — **dicono un numero falso a chi decide**. Un «spesa media
 * 0,00 €» detto con la voce dell'assistente non si distingue da una misura, e
 * chi lo sente ci costruisce sopra una decisione sui prezzi.
 *
 * Le prove guardano i casi in cui la risposta giusta **non è un numero**:
 * quando non c'è niente da misurare, e quando la persona che l'agente dovrebbe
 * segnalare non rientra nella domanda fatta.
 */

const db = new PrismaClient();
const PREFISSO = "test-agente-letture-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";
let personaId = "";
let ctx: AgentContext;

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
  personaId = (
    await db.waiter.create({
      data: {
        venueId,
        firstName: "Anna",
        lastName: "Bianchi",
        birthday: new Date("1994-05-12T00:00:00.000Z"),
        phone: "+39 333 1112223",
        role: "Sala",
      },
    })
  ).id;
  ctx = {
    venueId,
    venueName: unico,
    venueTimezone: "Europe/Rome",
    role: "MANAGER",
    userId: "test",
    orgId,
  };
}, 60_000);

afterEach(async () => {
  await db.staffContract.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("quanto abbiamo incassato", () => {
  it("senza conti chiusi dice che non si può misurare, e non «0,00 €»", async () => {
    /**
     * `getAnalytics` restituisce `ospitiConConti` **proprio** per non
     * confondere zero con «non misurato»: quel modulo è stato corretto per
     * questo, dopo che la Panoramica mostrava «0,00 €» accanto a una freccia
     * di tendenza. L'agente lo ignorava e ripeteva lo zero a voce — dove è
     * ancora più credibile, perché sembra una risposta.
     */
    const esito = await toolRegistry.get_period_revenue!.run(ctx, {});
    expect(esito.text).toMatch(/non .*(misur|abbastanza)/i);
    expect(esito.text).not.toContain("0.00");
    expect(esito.text).not.toContain("0,00");
  });
});

describe("i contratti che scadono", () => {
  it("segnala chi scade entro trenta giorni, col nome", async () => {
    const fra10 = new Date(Date.now() + 10 * 86_400_000);
    await db.staffContract.create({
      data: {
        venueId,
        waiterId: personaId,
        contractType: "TEMPO_DETERMINATO",
        startDate: new Date(Date.now() - 200 * 86_400_000),
        endDate: fra10,
      },
    });

    const esito = await toolRegistry.get_expiring_contracts!.run(ctx, {});
    /* Il nome **nel testo**: all'agente si chiede a voce, e «un contratto in
       scadenza» senza dire di chi obbliga a cercarlo. */
    expect(esito.text).toMatch(/Anna/);
  });

  it("chi è già scoperto oggi non deve sparire dietro un rinnovo futuro", async () => {
    /**
     * Il caso di conformità, lo stesso trovato nell'audit sulla scheda del
     * dipendente: contratto scaduto il mese scorso, rinnovo registrato in
     * anticipo che parte il mese prossimo. In mezzo la persona **lavora senza
     * contratto in vigore**, e `pickCurrentContract` — che scegli quello
     * cominciato per ultimo — guardava il rinnovo e non vedeva niente da
     * segnalare.
     *
     * È più urgente di una scadenza fra venti giorni, non meno: chiedere
     * all'agente «chi ha il contratto in scadenza?» e sentirsi rispondere
     * «nessuno» mentre qualcuno è scoperto è la risposta peggiore possibile.
     */
    await db.staffContract.create({
      data: {
        venueId,
        waiterId: personaId,
        contractType: "TEMPO_DETERMINATO",
        startDate: new Date(Date.now() - 300 * 86_400_000),
        endDate: new Date(Date.now() - 20 * 86_400_000),
      },
    });
    await db.staffContract.create({
      data: {
        venueId,
        waiterId: personaId,
        contractType: "TEMPO_DETERMINATO",
        startDate: new Date(Date.now() + 25 * 86_400_000),
        endDate: new Date(Date.now() + 300 * 86_400_000),
      },
    });

    const esito = await toolRegistry.get_expiring_contracts!.run(ctx, {});
    expect(esito.text).toMatch(/Anna/);
    expect(esito.text).toMatch(/senza contratto|scopert/i);
  });

  it("quando non c'è niente da guardare lo dice, e non tace", async () => {
    const esito = await toolRegistry.get_expiring_contracts!.run(ctx, {});
    expect(esito.text).toMatch(/Nessun contratto in scadenza/);
    expect(esito.text).toMatch(/nessuno senza contratto/i);
  });
});



describe("chi non torna", () => {
  it("dice quanti si possono invitare davvero, e perché gli altri no", async () => {
    /**
     * È la risposta che protegge dalla multa: «duecento clienti non tornano»
     * è inutile se centottanta non hanno dato il consenso, e scrivere a loro
     * non è una scorciatoia. Questa prova fissa il fatto che il numero
     * raggiungibile e il motivo dell'esclusione stiano **nella risposta**, non
     * in una schermata da aprire dopo.
     */
    const ospite = await db.guest.create({
      data: {
        venueId,
        firstName: "Vecchio",
        lastName: "Cliente",
        email: null,
        /* Nessun consenso e nessuna email: è il caso che conta — un cliente
           che non torna e a cui **non si può** scrivere. */
        marketingOptIn: false,
      },
    });
    /* Una visita di un anno fa: è quello che lo rende «inattivo». */
    await db.booking.create({
      data: {
        venueId,
        guestId: ospite.id,
        partySize: 2,
        startsAt: new Date(Date.now() - 400 * 86_400_000),
        durationMin: 105,
        status: "COMPLETED",
        source: "PHONE",
        reference: `${PREFISSO}vecchia`,
      },
    });

    const esito = await toolRegistry.chi_non_torna!.run(ctx, {});
    /* O ci sono inattivi e la risposta spiega chi è raggiungibile, o
       l'archivio non ne ha e lo dice: quello che non deve succedere è un
       numero senza il suo perché. */
    expect(esito.text).toMatch(/consenso|email|Nessun cliente/i);

    await db.booking.deleteMany({ where: { guestId: ospite.id } });
    await db.guest.delete({ where: { id: ospite.id } });
  });
});
