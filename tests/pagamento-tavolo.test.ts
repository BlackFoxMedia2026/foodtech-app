import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { generaPayToken } from "@/lib/pay-token";
import { leggiContoTavolo, tavoloDaToken, ContoTavoloError } from "@/server/conto-tavolo";
import {
  impegnaPagamento,
  liberaPagamento,
  registraIncasso,
  registraRimborso,
  scadiPagamentiVecchi,
  PagamentoError,
} from "@/server/pagamenti-tavolo";

/**
 * Il pagamento al tavolo col QR.
 *
 * La prova che conta più di tutte è una sola, ed è quella che il brief chiede
 * esplicitamente al punto 14: **due persone che pagano lo stesso residuo nello
 * stesso istante non devono poter pagare due volte la stessa cena.** Tutto il
 * resto di questo file esiste per rendere credibile quella.
 *
 * Girano sul database vero, non su finzioni: la difesa contro la doppia
 * riscossione è una serratura di Postgres (`SELECT ... FOR UPDATE`), e una
 * finta non ne proverebbe niente — proverebbe solo che la finta funziona.
 */

const db = new PrismaClient();
const PREFISSO = "test-payqr-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let tableId = "";
let token = "";
let orderId = "";

/** Un tavolo col QR acceso e un conto aperto sopra, come a metà servizio. */
async function apparecchia(righe: { nome: string; prezzo: number; quantita: number }[]) {
  const booking = await db.booking.create({
    data: { venueId, tableId, partySize: 4, startsAt: new Date(), seatedAt: new Date(), status: "SEATED", source: "PHONE" },
  });
  const order = await db.order.create({
    data: {
      venueId,
      bookingId: booking.id,
      kind: "TABLE",
      status: "RECEIVED",
      reference: `${PREFISSO}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scheduledAt: new Date(),
      currency: "EUR",
      OrderItem: {
        create: righe.map((r) => ({ name: r.nome, priceCents: r.prezzo, quantity: r.quantita })),
      },
    },
  });
  orderId = order.id;
  return order.id;
}

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  orgId = org.id;
  const venue = await db.venue.create({
    data: {
      orgId,
      name: `${PREFISSO}locale`,
      slug: `${PREFISSO}v${Date.now()}`,
      timezone: "Europe/Rome",
      qrPaymentsEnabled: true,
      // Il locale è collegato a Stripe: senza, l'avvio si rifiuta prima di
      // arrivare all'aritmetica.
      stripeAccountId: "acct_test_finto",
      stripeChargesEnabled: true,
    },
  });
  venueId = venue.id;
  token = generaPayToken();
  const table = await db.table.create({
    data: { venueId, label: "12", seats: 4, payQrToken: token, payQrEnabled: true },
  });
  tableId = table.id;
}, 60_000);

beforeEach(async () => {
  await db.paymentAllocation.deleteMany({ where: { order: { venueId } } });
  await db.payment.deleteMany({ where: { venueId } });
  await db.orderItem.deleteMany({ where: { Order: { venueId } } });
  await db.order.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */
/*  Leggere il conto dal QR                                                   */
/* -------------------------------------------------------------------------- */

describe("il QR apre il conto di adesso", () => {
  it("trova il conto aperto del tavolo passando dalla prenotazione seduta", async () => {
    await apparecchia([{ nome: "Tartare", prezzo: 1600, quantita: 2 }]);
    const conto = await leggiContoTavolo(token);

    expect(conto.tavolo).toBe("12");
    expect(conto.totaleCents).toBe(3200);
    expect(conto.residuoCents).toBe(3200);
    expect(conto.stato).toBe("OPEN");
    expect(conto.righe[0]).toMatchObject({ quantita: 2, pagate: 0, disponibili: 2 });
  });

  /** Il QR è permanente: prima che il tavolo si sieda non c'è niente da pagare. */
  it("dice «nessun conto» invece di inventarne uno", async () => {
    await expect(leggiContoTavolo(token)).rejects.toMatchObject({ code: "nessun_conto" });
  });

  it("un token sconosciuto non fa trapelare se il tavolo esiste", async () => {
    await expect(tavoloDaToken(generaPayToken())).rejects.toMatchObject({ code: "token_sconosciuto" });
    // Una stringa che non ha nemmeno la forma di un token non arriva al database.
    await expect(tavoloDaToken("../../etc/passwd")).rejects.toMatchObject({ code: "token_sconosciuto" });
  });

  it("col QR spento risponde «non attivo», non un errore", async () => {
    await db.table.update({ where: { id: tableId }, data: { payQrEnabled: false } });
    await expect(tavoloDaToken(token)).rejects.toMatchObject({ code: "qr_disattivato" });
    await db.table.update({ where: { id: tableId }, data: { payQrEnabled: true } });
  });

  /** Gift card e punti sono già stati scalati in sala: il QR non li richiede. */
  it("il residuo tiene conto degli sconti già applicati al tavolo", async () => {
    const id = await apparecchia([{ nome: "Ribeye", prezzo: 3800, quantita: 1 }]);
    const gc = await db.giftCard.create({
      data: { venueId, code: `${PREFISSO}${Date.now()}`, initialCents: 1000, balanceCents: 0, status: "EXHAUSTED" },
    });
    await db.giftCardRedemption.create({
      data: { giftCardId: gc.id, orderId: id, amountCents: 1000 },
    });

    const conto = await leggiContoTavolo(token);
    expect(conto.totaleCents).toBe(3800);
    expect(conto.scontiCents).toBe(1000);
    expect(conto.residuoCents).toBe(2800);
  });
});

/* -------------------------------------------------------------------------- */
/*  Il punto 14: due persone, lo stesso residuo, lo stesso istante            */
/* -------------------------------------------------------------------------- */

describe("due persone pagano insieme", () => {
  /**
   * Lo scenario del brief, alla lettera.
   *
   * Residuo 50 €. Mario e Giulia premono «paga tutto» nello stesso momento.
   * **Non devono arrivare 100 €.** Il secondo dei due deve trovare il residuo
   * già impegnato e sentirsi dire che non c'è più niente da pagare.
   */
  it("non lascia impegnare due volte lo stesso residuo", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 5000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);

    const [mario, giulia] = await Promise.allSettled([
      impegnaPagamento(tavolo, { modo: "tutto" }),
      impegnaPagamento(tavolo, { modo: "tutto" }),
    ]);

    const riusciti = [mario, giulia].filter((e) => e.status === "fulfilled");
    const falliti = [mario, giulia].filter((e) => e.status === "rejected");

    expect(riusciti).toHaveLength(1);
    expect(falliti).toHaveLength(1);
    expect((falliti[0] as PromiseRejectedResult).reason).toBeInstanceOf(PagamentoError);
    expect((falliti[0] as PromiseRejectedResult).reason.code).toBe("residuo_esaurito");

    // E in tabella c'è un solo impegno, da 50 €.
    const impegni = await db.payment.findMany({ where: { orderId, status: "PROCESSING" } });
    expect(impegni).toHaveLength(1);
    expect(impegni[0].amountCents).toBe(5000);
  });

  /**
   * La stessa cosa, ma con più pressione: otto tentativi contemporanei su un
   * residuo che ne regge esattamente quattro. Ne devono passare quattro, e la
   * somma degli impegni deve essere **esattamente** il residuo — non un
   * centesimo in più.
   */
  it("regge otto tentativi simultanei senza superare il residuo", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 10000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);

    const esiti = await Promise.allSettled(
      Array.from({ length: 8 }, () => impegnaPagamento(tavolo, { modo: "importo", importoCents: 2500 })),
    );

    const riusciti = esiti.filter((e) => e.status === "fulfilled");
    expect(riusciti).toHaveLength(4);

    const impegni = await db.payment.aggregate({
      where: { orderId, status: "PROCESSING" },
      _sum: { amountCents: true },
    });
    expect(impegni._sum.amountCents).toBe(10000);

    const conto = await leggiContoTavolo(token);
    expect(conto.residuoCents).toBe(0);
    expect(conto.stato).toBe("PAYMENT_IN_PROGRESS");
  });

  /**
   * Gli stessi calici, due persone. Il brief lo chiede al punto 7: chi arriva
   * secondo non deve poter pagare il Barolo di chi è arrivato primo.
   */
  it("non lascia impegnare due volte le stesse portate", async () => {
    const id = await apparecchia([{ nome: "Barolo", prezzo: 1200, quantita: 3 }]);
    const tavolo = await tavoloDaToken(token);
    const riga = (await db.orderItem.findFirstOrThrow({ where: { orderId: id } })).id;

    // Tre persone chiedono due calici ciascuna: ce ne sono tre in tutto.
    const esiti = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        impegnaPagamento(tavolo, { modo: "righe", selezione: [{ orderItemId: riga, quantity: 2 }] }),
      ),
    );

    // Uno solo può averne due; agli altri ne resta uno, che non basta per la
    // richiesta da due.
    expect(esiti.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    for (const e of esiti.filter((x) => x.status === "rejected")) {
      expect((e as PromiseRejectedResult).reason.code).toBe("righe_non_disponibili");
    }

    const conto = await leggiContoTavolo(token);
    expect(conto.righe[0]).toMatchObject({ quantita: 3, impegnate: 2, pagate: 0, disponibili: 1 });
  });

  /** Le unità libere restano pagabili: un calice su tre non blocca gli altri due. */
  it("lascia pagare le unità che restano della stessa riga", async () => {
    const id = await apparecchia([{ nome: "Barolo", prezzo: 1200, quantita: 3 }]);
    const tavolo = await tavoloDaToken(token);
    const riga = (await db.orderItem.findFirstOrThrow({ where: { orderId: id } })).id;

    const primo = await impegnaPagamento(tavolo, {
      modo: "righe",
      selezione: [{ orderItemId: riga, quantity: 1 }],
    });
    expect(primo.payment.amountCents).toBe(1200);

    const secondo = await impegnaPagamento(tavolo, {
      modo: "righe",
      selezione: [{ orderItemId: riga, quantity: 2 }],
    });
    expect(secondo.payment.amountCents).toBe(2400);

    const conto = await leggiContoTavolo(token);
    expect(conto.righe[0].disponibili).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Incassare                                                                 */
/* -------------------------------------------------------------------------- */

describe("incassare", () => {
  it("segna il pagamento, le portate e il residuo", async () => {
    const id = await apparecchia([{ nome: "Barolo", prezzo: 1200, quantita: 3 }]);
    const tavolo = await tavoloDaToken(token);
    const riga = (await db.orderItem.findFirstOrThrow({ where: { orderId: id } })).id;

    const { payment } = await impegnaPagamento(tavolo, {
      modo: "righe",
      selezione: [{ orderItemId: riga, quantity: 1 }],
    });

    const esito = await registraIncasso({ paymentId: payment.id, metodo: "apple_pay" });
    expect(esito).toMatchObject({ applicato: true, billCents: 1200, tipCents: 0, saldato: false });
    expect(esito!.residuoCents).toBe(2400);

    const conto = await leggiContoTavolo(token);
    expect(conto.pagatoCents).toBe(1200);
    expect(conto.righe[0]).toMatchObject({ pagate: 1, impegnate: 0, disponibili: 2 });
    expect(conto.stato).toBe("PARTIALLY_PAID");
  });

  /**
   * La mancia **non** riduce il conto. È la regola del punto 9, ed è quella
   * che permette al locale di sapere a fine serata quanto ha incassato di
   * cena e quanto di riconoscenza.
   */
  it("tiene la mancia fuori dal residuo", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 3000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);

    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto", manciaPercento: 10 });
    // 30 € di conto, 3 € di mancia, 33 € addebitati.
    expect(payment.amountCents).toBe(3300);
    expect(payment.tipCents).toBe(300);

    const esito = await registraIncasso({ paymentId: payment.id });
    expect(esito).toMatchObject({ billCents: 3000, tipCents: 300, saldato: true, residuoCents: 0 });

    const conto = await db.order.findUniqueOrThrow({ where: { id: esito!.orderId! } });
    expect(conto.paymentStatus).toBe("SUCCEEDED");
  });

  /**
   * Stripe consegna «almeno una volta»: lo stesso incasso può arrivare due
   * volte, e da due eventi diversi. Il secondo non deve incassare niente.
   */
  it("non incassa due volte lo stesso pagamento", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 5000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto" });

    const primo = await registraIncasso({ paymentId: payment.id });
    const secondo = await registraIncasso({ paymentId: payment.id });

    expect(primo!.applicato).toBe(true);
    expect(secondo!.applicato).toBe(false);

    const conto = await leggiContoTavolo(token);
    expect(conto.pagatoCents).toBe(5000);
    expect(conto.pagamenti).toBe(1);
  });

  it("ritrova il pagamento anche dalla sola sessione di Stripe", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 2000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto" });
    await db.payment.update({ where: { id: payment.id }, data: { stripeCheckoutSessionId: "cs_test_123" } });

    const esito = await registraIncasso({ checkoutSessionId: "cs_test_123" });
    expect(esito).toMatchObject({ applicato: true, paymentId: payment.id });
  });
});

/* -------------------------------------------------------------------------- */
/*  Abbandoni, scadenze, rimborsi                                             */
/* -------------------------------------------------------------------------- */

describe("quando un pagamento non arriva", () => {
  it("libera il residuo di chi ha abbandonato", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 5000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto" });

    expect((await leggiContoTavolo(token)).residuoCents).toBe(0);
    await liberaPagamento(payment.id, "CANCELLED");
    expect((await leggiContoTavolo(token)).residuoCents).toBe(5000);
  });

  /**
   * Un telefono rimasto senza batteria non deve bloccare il dolce degli
   * altri: l'impegno scade, e smette di contare **già in lettura** — prima
   * ancora che il lavoro periodico passi a fare pulizia.
   */
  it("un impegno scaduto non blocca più il conto, anche prima della pulizia", async () => {
    const id = await apparecchia([{ nome: "Cena", prezzo: 5000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto" });

    await db.payment.update({
      where: { id: payment.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    expect((await leggiContoTavolo(token)).residuoCents).toBe(5000);

    const liberati = await scadiPagamentiVecchi();
    expect(liberati).toBeGreaterThanOrEqual(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("EXPIRED");
    void id;
  });

  /**
   * Stripe non garantisce l'ordine degli eventi: la scadenza può arrivare
   * dopo la conferma. Annullare lì cancellerebbe un incasso vero.
   */
  it("non annulla mai un pagamento già riuscito", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 5000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto" });
    await registraIncasso({ paymentId: payment.id });

    await liberaPagamento(payment.id, "EXPIRED");

    const dopo = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(dopo.status).toBe("SUCCEEDED");
    expect((await leggiContoTavolo(token)).pagatoCents).toBe(5000);
  });

  it("un rimborso parziale non cancella tutto l'incasso", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 5000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    const { payment } = await impegnaPagamento(tavolo, { modo: "tutto" });
    await registraIncasso({ paymentId: payment.id });

    const esito = await registraRimborso({ paymentIntentId: null, checkoutSessionId: null, rimborsatoCents: 2000 });
    // Senza riferimenti non trova niente: è il comportamento giusto.
    expect(esito).toBeNull();

    await db.payment.update({ where: { id: payment.id }, data: { stripePaymentId: "pi_test_1" } });
    const vero = await registraRimborso({ paymentIntentId: "pi_test_1", rimborsatoCents: 2000 });
    expect(vero).toMatchObject({ totale: false });

    const conto = await leggiContoTavolo(token);
    // Restano incassati 30 dei 50 €, e il tavolo torna a dover 20 €.
    expect(conto.pagatoCents).toBe(3000);
    expect(conto.residuoCents).toBe(2000);
  });
});

/* -------------------------------------------------------------------------- */
/*  Quello che il telefono non decide                                         */
/* -------------------------------------------------------------------------- */

describe("il server non si fida del telefono", () => {
  it("rifiuta un importo più alto del residuo", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 3000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);
    await expect(impegnaPagamento(tavolo, { modo: "importo", importoCents: 9999 })).rejects.toMatchObject({
      code: "importo_oltre_residuo",
    });
  });

  it("avverte invece di addebitare, se il conto è cambiato nel frattempo", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 10000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);

    // Giulia ha aperto la pagina quando il residuo era 100 €; nel frattempo
    // Mario ne ha pagati 40.
    const { payment } = await impegnaPagamento(tavolo, { modo: "importo", importoCents: 4000 });
    await registraIncasso({ paymentId: payment.id });

    await expect(
      impegnaPagamento(tavolo, { modo: "tutto", attesoCents: 10000 }),
    ).rejects.toMatchObject({ code: "conto_cambiato", dettaglio: { realeCents: 6000 } });
  });

  /** La quota si calcola sul residuo di adesso, non su quello di partenza. */
  it("divide sempre il residuo vero", async () => {
    await apparecchia([{ nome: "Cena", prezzo: 12000, quantita: 1 }]);
    const tavolo = await tavoloDaToken(token);

    const primo = await impegnaPagamento(tavolo, { modo: "quota", parti: 4 });
    expect(primo.payment.amountCents).toBe(3000);
    await registraIncasso({ paymentId: primo.payment.id });

    // Restano 90 € e tre persone: 30 € a testa, non 120/4.
    const secondo = await impegnaPagamento(tavolo, { modo: "quota", parti: 3 });
    expect(secondo.payment.amountCents).toBe(3000);
  });

  it("non lascia pagare un tavolo il cui locale non ha collegato Stripe", async () => {
    await db.venue.update({ where: { id: venueId }, data: { stripeChargesEnabled: false } });
    await apparecchia([{ nome: "Cena", prezzo: 3000, quantita: 1 }]);
    const { avviaPagamento } = await import("@/server/pagamenti-tavolo");
    await expect(avviaPagamento(token, { modo: "tutto" })).rejects.toMatchObject({
      code: "stripe_non_collegato",
    });
    await db.venue.update({ where: { id: venueId }, data: { stripeChargesEnabled: true } });
  });
});
