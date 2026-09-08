import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AUTOMATIONS, giornoMese, SILENZIO_GIORNI } from "@/server/automations/catalogue";
import {
  enqueueDueAutomations,
  listAutomations,
  resolveDestinatari,
  runAutomation,
  updateAutomation,
} from "@/server/automations/engine";

/**
 * Le automazioni.
 *
 * La domanda a cui questi test rispondono non è «funziona», è **come si evita
 * che scriva a tutti tre volte**. In ordine di gravità:
 *
 * - accendere un'automazione **non deve** far partire un diluvio a tutto
 *   l'archivio: la finestra guarda solo chi ha appena superato la soglia;
 * - la stessa persona non riceve la stessa cosa due volte;
 * - nessuno riceve due email nostre in due giorni;
 * - il numero mostrato nell'anteprima è **lo stesso** che parte, altrimenti
 *   non è un'anteprima;
 * - un'automazione spenta è spenta.
 */

const db = new PrismaClient();
const PREFISSO = "test-auto-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

const ORA = new Date("2026-09-07T10:00:00.000Z");
const giorno = 86_400_000;

function piu(giorni: number): Date {
  return new Date(ORA.getTime() + giorni * giorno);
}

async function ospite(nome: string, dati: Parameters<typeof db.guest.create>[0]["data"] extends infer D ? Partial<D> : never = {}) {
  return db.guest.create({
    data: {
      venueId,
      firstName: nome,
      email: `${PREFISSO}${nome.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      marketingOptIn: true,
      ...(dati as object),
    },
  });
}

/** Una riga di registro, per simulare «gli abbiamo già scritto». */
async function messaggioA(guestId: string, kind: string, quandoGiorniFa: number) {
  return db.messageLog.create({
    data: {
      venueId,
      guestId,
      kind,
      channel: "EMAIL",
      toAddress: `${PREFISSO}x@test.local`,
      status: "SENT",
      createdAt: new Date(ORA.getTime() - quandoGiorniFa * giorno),
    },
  });
}

beforeAll(async () => {
  // Il canale email deve risultare configurato, altrimenti le automazioni si
  // fermano prima di provarci. Nessun invio avviene: si accoda soltanto.
  process.env.RESEND_API_KEY = "re_finta_per_i_test";

  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, phone: "+39 02 000" },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.messageLog.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  // I coupon si accumulano fra le prove: senza questa pulizia una prova
  // legge il codice creato dalla precedente e sembra che il messaggio sia
  // sbagliato.
  await db.couponRedemption.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.coupon.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.giftCard.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.backgroundJob.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.automationRun.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.automationWorkflow.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterEach(async () => {
  await db.backgroundJob.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  delete process.env.RESEND_API_KEY;
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("chi tocca il compleanno", () => {
  const G = 3;

  it("prende chi compie gli anni fra i giorni scelti, in qualunque anno sia nato", async () => {
    const bersaglio = piu(G);
    const g = await ospite("Nata", {
      birthday: new Date(Date.UTC(1984, bersaglio.getUTCMonth(), bersaglio.getUTCDate())),
    });
    const { pronti } = await resolveDestinatari(venueId, "compleanno", G, ORA);
    expect(pronti.map((p) => p.guestId)).toEqual([g.id]);
    expect(pronti[0].reason).toContain("compie gli anni");
  });

  it("recupera il giorno saltato, senza mandarlo due volte", async () => {
    // Il lavoro pianificato gira una volta al giorno: se ieri non è girato,
    // oggi la persona di ieri va comunque presa.
    const ieri = piu(G - 1);
    const g = await ospite("Ieri", {
      birthday: new Date(Date.UTC(1990, ieri.getUTCMonth(), ieri.getUTCDate())),
    });
    const { pronti } = await resolveDestinatari(venueId, "compleanno", G, ORA);
    expect(pronti.map((p) => p.guestId)).toContain(g.id);

    // Ma se l'ha già ricevuto, no.
    await messaggioA(g.id, "automation.compleanno", 1);
    const dopo = await resolveDestinatari(venueId, "compleanno", G, ORA);
    expect(dopo.pronti.map((p) => p.guestId)).not.toContain(g.id);
    expect(dopo.scartati.giaRicevuto).toBe(1);
  });

  it("lascia fuori chi compie gli anni in un altro momento", async () => {
    const lontano = piu(30);
    await ospite("Lontana", {
      birthday: new Date(Date.UTC(1990, lontano.getUTCMonth(), lontano.getUTCDate())),
    });
    const { pronti } = await resolveDestinatari(venueId, "compleanno", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("lascia fuori chi non ha dato il consenso o non ha email", async () => {
    const bersaglio = piu(G);
    const compleanno = new Date(Date.UTC(1990, bersaglio.getUTCMonth(), bersaglio.getUTCDate()));
    await ospite("SenzaConsenso", { birthday: compleanno, marketingOptIn: false });
    await db.guest.create({
      data: { venueId, firstName: "SenzaEmail", birthday: compleanno, marketingOptIn: true, email: null },
    });
    const { pronti } = await resolveDestinatari(venueId, "compleanno", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("il giorno e il mese si leggono in UTC: una data pura non si sposta col fuso", () => {
    // Chi è nato il 12 settembre è nato il 12 settembre a Milano e a Tokyo.
    expect(giornoMese(new Date("1984-09-12T00:00:00.000Z"))).toBe("09-12");
    expect(giornoMese(new Date("1984-01-01T00:00:00.000Z"))).toBe("01-01");
  });
});

describe("chi tocca «non torna da un po'»", () => {
  const G = 60;

  it("prende chi ha appena superato la soglia", async () => {
    const g = await ospite("Appena", { totalVisits: 3, lastVisitAt: piu(-(G + 1)) });
    const { pronti } = await resolveDestinatari(venueId, "non_torna", G, ORA);
    expect(pronti.map((p) => p.guestId)).toEqual([g.id]);
    expect(pronti[0].reason).toContain("ultima visita");
  });

  it("NON prende chi l'ha superata da mesi: accenderla non è un diluvio", async () => {
    // È la difesa più importante di tutte. «Tutti quelli che non vengono da
    // sessanta giorni», il primo giorno, sarebbe mezza rubrica.
    await ospite("Vecchia", { totalVisits: 5, lastVisitAt: piu(-400) });
    await ospite("Antica", { totalVisits: 2, lastVisitAt: piu(-200) });
    await ospite("Lontana", { totalVisits: 9, lastVisitAt: piu(-95) });
    const { pronti } = await resolveDestinatari(venueId, "non_torna", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non prende chi è ancora dentro la soglia", async () => {
    await ospite("Recente", { totalVisits: 4, lastVisitAt: piu(-10) });
    const { pronti } = await resolveDestinatari(venueId, "non_torna", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non prende chi non è mai venuto", async () => {
    await ospite("MaiVenuta", { totalVisits: 0, lastVisitAt: null });
    const { pronti } = await resolveDestinatari(venueId, "non_torna", G, ORA);
    expect(pronti).toHaveLength(0);
  });
});

describe("chi tocca l'invito a tornare", () => {
  const G = 7;

  async function visitaChiusa(guestId: string, giorniFa: number) {
    return db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 2,
        startsAt: piu(-giorniFa),
        closedAt: piu(-giorniFa),
        status: "COMPLETED",
        source: "PHONE",
      },
    });
  }

  it("prende chi è venuto una volta sola, passati i giorni scelti", async () => {
    const g = await ospite("PrimaVolta", { totalVisits: 1 });
    await visitaChiusa(g.id, G + 1);
    const { pronti } = await resolveDestinatari(venueId, "invito_ritorno", G, ORA);
    expect(pronti.map((p) => p.guestId)).toEqual([g.id]);
    expect(pronti[0].reason).toContain("prima visita");
  });

  it("non prende chi ha già un tavolo prenotato: sta già tornando", async () => {
    const g = await ospite("GiaPrenotata", { totalVisits: 1 });
    await visitaChiusa(g.id, G + 1);
    await db.booking.create({
      data: { venueId, guestId: g.id, partySize: 2, startsAt: piu(5), status: "CONFIRMED", source: "PHONE" },
    });
    const { pronti } = await resolveDestinatari(venueId, "invito_ritorno", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non prende chi è già tornato", async () => {
    const g = await ospite("Abituale", { totalVisits: 4 });
    await visitaChiusa(g.id, G + 1);
    const { pronti } = await resolveDestinatari(venueId, "invito_ritorno", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non prende una visita troppo recente: la richiesta di parere è appena partita", async () => {
    const g = await ospite("Ierissima", { totalVisits: 1 });
    await visitaChiusa(g.id, 1);
    const { pronti } = await resolveDestinatari(venueId, "invito_ritorno", G, ORA);
    expect(pronti).toHaveLength(0);
  });
});

describe("chi tocca la gift card ferma", () => {
  const G = 30;

  /** Una gift card intestata a un indirizzo, emessa N giorni fa. */
  async function giftCard(email: string | null, giorniFa: number, extra: Record<string, unknown> = {}) {
    return db.giftCard.create({
      data: {
        venueId,
        code: `${PREFISSO}${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        initialCents: 5000,
        balanceCents: 5000,
        recipientEmail: email,
        createdAt: piu(-giorniFa),
        ...extra,
      },
    });
  }

  it("prende chi ha una carta mai usata, passati i giorni scelti", async () => {
    const g = await ospite("Regalata");
    await giftCard(g.email, G + 5);
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti.map((p) => p.guestId)).toEqual([g.id]);
    expect(pronti[0].reason).toContain("50,00 €");
    expect(pronti[0].reason).toContain("mai usata");
  });

  it("non prende una carta appena emessa: non è ancora dimenticata", async () => {
    const g = await ospite("Fresca");
    await giftCard(g.email, 2);
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non prende una carta già intaccata, nemmeno di un euro", async () => {
    const g = await ospite("Iniziata");
    const carta = await giftCard(g.email, G + 5, { balanceCents: 4900 });
    await db.giftCardRedemption.create({ data: { giftCardId: carta.id, amountCents: 100 } });
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non prende una carta scaduta o già chiusa: quel credito non esiste più", async () => {
    const g = await ospite("Scaduta");
    await giftCard(g.email, G + 5, { expiresAt: piu(-1) });
    const h = await ospite("Chiusa");
    await giftCard(h.email, G + 5, { status: "CANCELLED" });
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("non scrive a uno sconosciuto: una carta comprata per un estraneo non è un consenso", async () => {
    await giftCard(`${PREFISSO}mai-vista@test.local`, G + 5);
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("rispetta il consenso come tutte le altre", async () => {
    const g = await ospite("SenzaConsenso", { marketingOptIn: false });
    await giftCard(g.email, G + 5);
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti).toHaveLength(0);
  });

  it("due carte per la stessa persona sono un messaggio solo", async () => {
    const g = await ospite("DueVolte");
    await giftCard(g.email, G + 5);
    await giftCard(g.email, G + 40);
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti).toHaveLength(1);
  });

  it("l'indirizzo scritto in maiuscolo è la stessa persona", async () => {
    const g = await ospite("Maiuscola");
    await giftCard(g.email!.toUpperCase(), G + 5);
    const { pronti } = await resolveDestinatari(venueId, "gift_card_ferma", G, ORA);
    expect(pronti.map((p) => p.guestId)).toEqual([g.id]);
  });
});

describe("quante volte si chiede al database", () => {
  /**
   * Le due difese comuni (già ricevuto, silenzio) si chiedevano **una volta
   * per candidato**: con trecento clienti raggiungibili erano seicento viaggi
   * al database per aprire la pagina delle automazioni, e quattro automazioni
   * ne facevano duemilaquattrocento. Nessuno l'aveva notato perché la demo ne
   * ha centoventuno.
   *
   * Questa prova non guarda il risultato — lo guardano tutte le altre — ma
   * **il numero di letture**: è l'unico modo di impedire che il difetto
   * rientri dalla finestra la prossima volta che qualcuno aggiunge un
   * controllo dentro il ciclo.
   */
  let letture = 0;
  db.$use(async (params, next) => {
    if (params.model === "MessageLog") letture += 1;
    return next(params);
  });

  async function candidati(quanti: number) {
    // La pulizia qui dentro, non in un `beforeEach`: questa prova ha bisogno
    // di **due** platee diverse nella stessa esecuzione, per confrontarle.
    await db.messageLog.deleteMany({ where: { venueId } });
    await db.guest.deleteMany({ where: { venueId } });
    for (let i = 0; i < quanti; i++) {
      const g = await ospite(`Platea${i}`, { totalVisits: 3, lastVisitAt: piu(-61) });
      // Metà hanno già ricevuto qualcosa: così entrambe le difese lavorano.
      if (i % 2 === 0) await messaggioA(g.id, "altro.messaggio", 30);
    }
  }

  it("le letture non crescono con la platea", async () => {
    await candidati(3);
    letture = 0;
    const { pronti: pochi } = await resolveDestinatari(venueId, "non_torna", 60, ORA);
    const conTre = letture;

    await candidati(30);
    letture = 0;
    const { pronti: molti } = await resolveDestinatari(venueId, "non_torna", 60, ORA);
    const conTrenta = letture;

    expect(pochi.length).toBeGreaterThan(0);
    expect(molti.length).toBeGreaterThan(pochi.length);
    // Due letture sul registro dei messaggi, che siano tre candidati o trenta.
    expect(conTre).toBeLessThanOrEqual(2);
    expect(conTrenta).toBe(conTre);
  });
});

describe("le difese comuni", () => {
  async function unCandidato(nome = "Candidata") {
    const g = await ospite(nome, { totalVisits: 3, lastVisitAt: piu(-61) });
    return g;
  }

  it("chi ha ricevuto un nostro qualunque messaggio da poco resta zitto", async () => {
    const g = await unCandidato();
    // Ieri gli è arrivata la richiesta di parere: oggi niente.
    await messaggioA(g.id, "booking.survey_request", 1);
    const { pronti, scartati } = await resolveDestinatari(venueId, "non_torna", 60, ORA);
    expect(pronti).toHaveLength(0);
    expect(scartati.silenzio).toBe(1);
  });

  it("passato il silenzio, torna raggiungibile", async () => {
    const g = await unCandidato();
    await messaggioA(g.id, "booking.survey_request", SILENZIO_GIORNI + 1);
    const { pronti } = await resolveDestinatari(venueId, "non_torna", 60, ORA);
    expect(pronti.map((p) => p.guestId)).toEqual([g.id]);
  });

  it("gli ospiti di un altro locale non si toccano", async () => {
    await db.guest.create({
      data: {
        venueId: altroVenueId,
        firstName: "Altrui",
        email: `${PREFISSO}altrui@test.local`,
        marketingOptIn: true,
        totalVisits: 3,
        lastVisitAt: piu(-61),
      },
    });
    const { pronti } = await resolveDestinatari(venueId, "non_torna", 60, ORA);
    expect(pronti).toHaveLength(0);
  });
});

describe("l'esecuzione", () => {
  async function candidati(quanti: number) {
    for (let i = 0; i < quanti; i++) {
      await ospite(`Cand${i}`, { totalVisits: 3, lastVisitAt: piu(-61) });
    }
  }

  it("un'automazione spenta non manda niente", async () => {
    await candidati(2);
    const esito = await runAutomation(venueId, "non_torna", { now: ORA });
    expect(esito.outcome).toBe("inactive");
    expect(await db.messageLog.count({ where: { venueId } })).toBe(0);
    expect(await db.backgroundJob.count({ where: { venueId } })).toBe(0);
  });

  it("accesa, mette in coda un messaggio per destinatario", async () => {
    await candidati(3);
    await updateAutomation(venueId, "non_torna", { active: true, giorni: 60 });
    const esito = await runAutomation(venueId, "non_torna", { now: ORA });

    expect(esito.outcome).toBe("queued");
    expect(esito.inCoda).toBe(3);
    expect(await db.messageLog.count({ where: { venueId, kind: "automation.non_torna" } })).toBe(3);
    expect(await db.backgroundJob.count({ where: { venueId, kind: "message.send" } })).toBe(3);

    // Ogni messaggio è legato alla sua esecuzione: si può sempre risalire.
    const righe = await db.messageLog.findMany({ where: { venueId }, select: { workflowRunId: true } });
    expect(righe.every((r) => r.workflowRunId === esito.runId)).toBe(true);
  });

  it("il tetto vale, e il resto slitta a domani", async () => {
    await candidati(3);
    await updateAutomation(venueId, "non_torna", { active: true, giorni: 60 });
    const esito = await runAutomation(venueId, "non_torna", { now: ORA, limit: 2 });
    expect(esito.inCoda).toBe(2);
    expect(esito.rimandati).toBe(1);
    const run = await db.automationRun.findFirstOrThrow({ where: { venueId } });
    expect(run.status).toBe("PARTIAL");
  });

  it("eseguita due volte, non scrive due volte alle stesse persone", async () => {
    await candidati(2);
    await updateAutomation(venueId, "non_torna", { active: true, giorni: 60 });
    await runAutomation(venueId, "non_torna", { now: ORA });
    const secondo = await runAutomation(venueId, "non_torna", { now: ORA });

    expect(secondo.outcome).toBe("nothing_to_do");
    expect(await db.messageLog.count({ where: { venueId, kind: "automation.non_torna" } })).toBe(2);
  });

  it("il numero dell'anteprima è quello che parte", async () => {
    await candidati(4);
    await updateAutomation(venueId, "non_torna", { active: true, giorni: 60 });
    const prima = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    const esito = await runAutomation(venueId, "non_torna", { now: ORA });
    // Se l'anteprima dicesse un numero e l'invio ne facesse un altro, non
    // sarebbe un'anteprima: sarebbe una stima.
    expect(esito.inCoda).toBe(prima.toccherebbeOggi);

    const dopo = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(dopo.toccherebbeOggi).toBe(0);
    expect(dopo.inviatiUltimi30).toBe(4);
  });
});

describe("configurazione", () => {
  it("le automazioni nascono spente", async () => {
    const viste = await listAutomations(venueId, ORA);
    expect(viste).toHaveLength(4);
    expect(viste.every((v) => !v.active)).toBe(true);
  });

  it("i valori fuori scala vengono riportati dentro", async () => {
    const def = AUTOMATIONS.non_torna;
    await updateAutomation(venueId, "non_torna", { giorni: 5000 });
    let vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.giorni).toBe(def.knob.max);

    await updateAutomation(venueId, "non_torna", { giorni: 1 });
    vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.giorni).toBe(def.knob.min);
  });

  it("il testo si può cambiare, e vuoto torna quello nostro", async () => {
    await updateAutomation(venueId, "non_torna", { subject: "Ci sei mancato", intro: "Torna quando vuoi." });
    let vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.subject).toBe("Ci sei mancato");

    await updateAutomation(venueId, "non_torna", { subject: "   " });
    vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.subject).toBe("Ci sei mancato");
  });

  it("spegnere l'automazione la spegne davvero", async () => {
    await ospite("Candidata", { totalVisits: 3, lastVisitAt: piu(-61) });
    await updateAutomation(venueId, "non_torna", { active: true });
    await updateAutomation(venueId, "non_torna", { active: false });
    const esito = await runAutomation(venueId, "non_torna", { now: ORA });
    expect(esito.outcome).toBe("inactive");
  });
});

describe("il lavoro pianificato", () => {
  it("accoda solo le automazioni accese, una volta al giorno", async () => {
    await updateAutomation(venueId, "non_torna", { active: true });
    await updateAutomation(venueId, "compleanno", { active: false });

    const primo = await enqueueDueAutomations(ORA);
    expect(primo.accodate).toBe(1);

    // Un secondo passaggio nello stesso giorno non raddoppia niente.
    const secondo = await enqueueDueAutomations(ORA);
    expect(secondo.accodate).toBe(0);

    const lavori = await db.backgroundJob.findMany({ where: { venueId, kind: "automation.run" } });
    expect(lavori).toHaveLength(1);
    expect(lavori[0].dedupeKey).toContain("2026-09-07");
  });
});

describe("l'omaggio allegato a un'automazione", () => {
  async function candidato(nome = "Regalata") {
    return ospite(nome, { totalVisits: 3, lastVisitAt: piu(-61) });
  }

  it("nasce assente: un'automazione non regala niente se nessuno l'ha chiesto", async () => {
    const viste = await listAutomations(venueId, ORA);
    expect(viste.every((v) => v.coupon === null)).toBe(true);
  });

  it("ogni persona riceve un codice suo, intestato a lei e valido una volta", async () => {
    const a = await candidato("Prima");
    const b = await candidato("Seconda");
    await updateAutomation(venueId, "non_torna", {
      active: true,
      giorni: 60,
      coupon: { kind: "PERCENT", value: 20, giorniValidita: 30 },
    });

    const esito = await runAutomation(venueId, "non_torna", { now: ORA });
    expect(esito.inCoda).toBe(2);

    const coupon = await db.coupon.findMany({ where: { venueId }, orderBy: { createdAt: "asc" } });
    expect(coupon).toHaveLength(2);
    // Un codice condiviso si gira agli amici: questi sono due codici diversi,
    // ognuno intestato a una persona e usabile una volta.
    expect(coupon[0].code).not.toBe(coupon[1].code);
    expect(coupon.map((c) => c.guestId).sort()).toEqual([a.id, b.id].sort());
    expect(coupon.every((c) => c.maxRedemptions === 1 && c.maxPerGuest === 1)).toBe(true);
    expect(coupon.every((c) => c.category === "WINBACK")).toBe(true);
    expect(coupon.every((c) => c.validUntil && c.validUntil > ORA)).toBe(true);
  });

  it("il codice finisce dentro il messaggio", async () => {
    await candidato();
    await updateAutomation(venueId, "non_torna", {
      active: true,
      giorni: 60,
      coupon: { kind: "FREE_ITEM", freeItem: "il dolce", giorniValidita: 15 },
    });
    await runAutomation(venueId, "non_torna", { now: ORA });

    const g = await db.guest.findFirstOrThrow({ where: { venueId, firstName: "Regalata" } });
    const coupon = await db.coupon.findFirstOrThrow({ where: { venueId, guestId: g.id } });
    const lavoro = await db.backgroundJob.findFirstOrThrow({ where: { venueId, kind: "message.send" } });
    const payload = lavoro.payload as { body: string };
    expect(payload.body).toContain(coupon.code);
    expect(payload.body).toContain("il dolce in omaggio");
    expect(payload.body).toContain("solo per te");
  });

  it("senza omaggio il messaggio non contiene nessun codice", async () => {
    await candidato();
    await updateAutomation(venueId, "non_torna", { active: true, giorni: 60, coupon: null });
    await runAutomation(venueId, "non_torna", { now: ORA });

    expect(await db.coupon.count({ where: { venueId } })).toBe(0);
    const lavoro = await db.backgroundJob.findFirstOrThrow({ where: { venueId, kind: "message.send" } });
    expect((lavoro.payload as { body: string }).body).not.toContain("solo per te");
  });

  it("togliere l'omaggio è un gesto possibile", async () => {
    await updateAutomation(venueId, "non_torna", {
      coupon: { kind: "PERCENT", value: 20, giorniValidita: 30 },
    });
    let vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.coupon?.value).toBe(20);

    // Assente vuol dire «non l'ho toccato», `null` vuol dire «toglilo».
    await updateAutomation(venueId, "non_torna", { giorni: 70 });
    vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.coupon?.value).toBe(20);

    await updateAutomation(venueId, "non_torna", { coupon: null });
    vista = (await listAutomations(venueId, ORA)).find((a) => a.key === "non_torna")!;
    expect(vista.coupon).toBeNull();
  });

  it("una seconda esecuzione non regala un secondo coupon alla stessa persona", async () => {
    const g = await candidato();
    await updateAutomation(venueId, "non_torna", {
      active: true,
      giorni: 60,
      coupon: { kind: "PERCENT", value: 20, giorniValidita: 30 },
    });
    await runAutomation(venueId, "non_torna", { now: ORA });
    expect(await db.coupon.count({ where: { venueId, guestId: g.id } })).toBe(1);

    // Il divieto di ripetizione dei messaggi già la ferma, ma anche forzando
    // il caso il coupon esistente si riusa invece di raddoppiare lo sconto.
    await db.messageLog.deleteMany({ where: { venueId } });
    await db.backgroundJob.deleteMany({ where: { venueId } });
    await runAutomation(venueId, "non_torna", { now: ORA });
    expect(await db.coupon.count({ where: { venueId, guestId: g.id } })).toBe(1);
  });
});
