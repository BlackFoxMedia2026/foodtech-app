import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  CaparraError,
  avvisaCaparraDaRestituire,
  testoCaparra,
  caparraDovutaCents,
  caparraSiPerde,
  chiediCaparra,
  politicaDi,
  rimborsaCaparra,
  salvaPolitica,
  segnaCaparraPagata,
  type Politica,
} from "@/server/caparre";
import { registraIncasso } from "@/server/pagamenti-tavolo";

/**
 * La caparra sulla prenotazione.
 *
 * È la richiesta numero uno contro i no-show e la frase con cui i concorrenti
 * vendono. In Tavolo `Booking.depositCents` era **un numero che si scriveva a
 * mano**: nessuno incassava niente.
 *
 * Qui si prova la parte che, sbagliando, tocca il denaro di un cliente:
 *
 * - **l'importo**, che è una funzione pura e va provata senza Stripe: un
 *   importo sbagliato non dà nessun errore, dà un cliente che paga il doppio;
 * - **l'importo non arriva da fuori**: se lo si accettasse da una richiesta,
 *   qualcuno potrebbe cambiarlo;
 * - **chiesta non è pagata**, e i due stati si distinguono in agenda;
 * - **la caparra pagata si scrive nello stesso istante** in cui il pagamento
 *   diventa riuscito, o resta una finestra in cui il denaro è incassato e
 *   l'agenda dice «da pagare»;
 * - e quando Stripe non è pronto **si dice cosa manca**, invece di un
 *   generico «non riuscito» che manda a cercare un guasto dove c'è una
 *   configurazione.
 */

const db = new PrismaClient();
const PREFISSO = "test-caparra-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let orgId = "";
let venueId = "";
let guestId = "";
let attore = {
  userId: "u-prova",
  email: null as string | null,
  orgId: "",
  venueId: "",
};

const DOMANI = new Date(Date.now() + 26 * 3_600_000);

async function pulisci() {
  await db.auditLog.deleteMany({
    where: { Organization: { name: { startsWith: PREFISSO } } },
  });
  await db.payment.deleteMany({
    where: { venue: { name: { startsWith: PREFISSO } } },
  });
  await db.booking.deleteMany({
    where: { venue: { name: { startsWith: PREFISSO } } },
  });
  await db.guest.deleteMany({
    where: { venue: { name: { startsWith: PREFISSO } } },
  });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({
    where: { name: { startsWith: PREFISSO } },
  });
}

beforeEach(async () => {
  await pulisci();
  const unico = `${PREFISSO}${Date.now()}-${Math.random()}`;
  orgId = (
    await db.organization.create({
      data: { name: `${PREFISSO}org`, slug: unico },
    })
  ).id;
  venueId = (
    await db.venue.create({
      data: {
        orgId,
        name: `${PREFISSO}locale`,
        slug: `v-${unico}`,
        active: true,
        timezone: "Europe/Rome",
      },
    })
  ).id;
  guestId = (
    await db.guest.create({
      data: { venueId, firstName: "Chiara", email: `${unico}@prova.test` },
    })
  ).id;
  attore = { userId: "u-prova", email: null, orgId, venueId };
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

const SPENTA: Politica = {
  attiva: false,
  daPersone: 8,
  perPersonaCents: 1_000,
  fissaCents: null,
  oreAnnulloGratis: 48,
};

describe("quanto si chiede", () => {
  it("niente, finché il locale non l'ha accesa", () => {
    /* Spenta per difetto: tutto quello che tocca il denaro di qualcuno si
       accende con un gesto deliberato. */
    expect(caparraDovutaCents(SPENTA, 20)).toBeNull();
  });

  it("niente sotto la soglia di coperti", () => {
    /* Sotto, la caparra costa più in attrito di quanto salvi in no-show: un
       tavolo da due che deve pagare prima di venire va a mangiare altrove. */
    const p = { ...SPENTA, attiva: true };
    expect(caparraDovutaCents(p, 7)).toBeNull();
    expect(caparraDovutaCents(p, 8)).toBe(8_000);
  });

  it("a testa, o fissa: e non la somma dei due", () => {
    expect(caparraDovutaCents({ ...SPENTA, attiva: true }, 10)).toBe(10_000);
    expect(
      caparraDovutaCents(
        { ...SPENTA, attiva: true, perPersonaCents: null, fissaCents: 15_000 },
        10,
      ),
    ).toBe(15_000);
    /* Se un giorno il vincolo in validazione saltasse, qui non si sommano: un
       cliente che paga 25.000 invece di 15.000 lo scopre lui. */
    expect(
      caparraDovutaCents(
        { ...SPENTA, attiva: true, perPersonaCents: 1_000, fissaCents: 15_000 },
        10,
      ),
    ).toBe(15_000);
  });

  it("accesa senza importo non chiede niente", () => {
    expect(
      caparraDovutaCents(
        { ...SPENTA, attiva: true, perPersonaCents: null, fissaCents: null },
        20,
      ),
    ).toBeNull();
  });
});

describe("la regola dichiarata", () => {
  it("dice se la caparra si perde, secondo le ore del locale", () => {
    const p = { ...SPENTA, attiva: true, oreAnnulloGratis: 48 };
    const cena = new Date("2026-12-12T20:00:00Z");
    /* Tre giorni prima: si annulla e non si perde niente. */
    expect(caparraSiPerde(p, cena, new Date("2026-12-09T20:00:00Z"))).toBe(
      false,
    );
    /* Il giorno prima: si perde. È la frase che chi disdice deve sentire
       **prima** di disdire — è la differenza fra una cancellazione che si
       rivende e un no-show. */
    expect(caparraSiPerde(p, cena, new Date("2026-12-11T21:00:00Z"))).toBe(
      true,
    );
  });

  it("con zero ore non si perde mai per tempo", () => {
    const p = { ...SPENTA, attiva: true, oreAnnulloGratis: 0 };
    expect(
      caparraSiPerde(
        p,
        new Date("2026-12-12T20:00:00Z"),
        new Date("2026-12-12T19:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("la politica del locale", () => {
  it("si salva e si rilegge", async () => {
    const salvata = await salvaPolitica(
      venueId,
      {
        attiva: true,
        daPersone: 6,
        perPersonaCents: 1_500,
        oreAnnulloGratis: 24,
      },
      { actor: attore },
    );
    expect(salvata).toMatchObject({
      attiva: true,
      daPersone: 6,
      perPersonaCents: 1_500,
    });

    const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId } });
    expect(politicaDi(venue)).toMatchObject({
      attiva: true,
      oreAnnulloGratis: 24,
    });
  });

  it("accesa senza importo non si salva", async () => {
    /* Una caparra accesa che non chiede niente è un interruttore che non fa
       niente: chi l'ha acceso crede di essere protetto e non lo è. */
    await expect(
      salvaPolitica(venueId, {
        attiva: true,
        daPersone: 8,
        oreAnnulloGratis: 48,
      }),
    ).rejects.toThrow();
  });

  it("i due importi insieme non si salvano", async () => {
    await expect(
      salvaPolitica(venueId, {
        attiva: true,
        daPersone: 8,
        perPersonaCents: 1_000,
        fissaCents: 20_000,
        oreAnnulloGratis: 48,
      }),
    ).rejects.toThrow();
  });

  it("lascia una riga nel registro: è una regola sul denaro", async () => {
    await salvaPolitica(
      venueId,
      { attiva: true, daPersone: 8, fissaCents: 20_000, oreAnnulloGratis: 48 },
      { actor: attore },
    );
    const riga = await db.auditLog.findFirstOrThrow({
      where: { action: "venue.caparra_update", venueId },
    });
    expect((riga.diff as { fissaCents?: number }).fissaCents).toBe(20_000);
  });
});

describe("chiedere la caparra", () => {
  async function prenotazione(persone = 10) {
    return db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: persone,
        startsAt: DOMANI,
        status: "CONFIRMED",
      },
      select: { id: true },
    });
  }

  beforeEach(async () => {
    await salvaPolitica(venueId, {
      attiva: true,
      daPersone: 8,
      perPersonaCents: 1_000,
      oreAnnulloGratis: 48,
    });
  });

  it("senza Stripe pronto dice **cosa** manca", async () => {
    /* In locale Stripe non è configurato, ed è il caso normale: il messaggio
       deve mandare a configurare, non a cercare un guasto. */
    const b = await prenotazione();
    await expect(chiediCaparra(venueId, b.id)).rejects.toThrow(
      "stripe_non_pronto",
    );

    /* E non lascia niente a metà: nessun pagamento aperto, nessuno stato
       cambiato sulla prenotazione. */
    expect(await db.payment.count({ where: { venueId } })).toBe(0);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: b.id } }))
        .depositStatus,
    ).toBe("NONE");
  });

  it("sotto la soglia non si chiede, e lo dice", async () => {
    const b = await prenotazione(4);
    await expect(chiediCaparra(venueId, b.id)).rejects.toThrow(
      "nessuna_caparra",
    );
  });

  it("su una prenotazione chiusa non si chiede", async () => {
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: DOMANI,
        status: "CANCELLED",
      },
      select: { id: true },
    });
    await expect(chiediCaparra(venueId, b.id)).rejects.toThrow(
      "prenotazione_chiusa",
    );
  });

  it("su una già pagata non si chiede due volte", async () => {
    const b = await prenotazione();
    await db.booking.update({
      where: { id: b.id },
      data: { depositStatus: "CAPTURED", depositCents: 10_000 },
    });
    await expect(chiediCaparra(venueId, b.id)).rejects.toThrow("gia_pagata");
  });

  it("la prenotazione di un altro locale non si tocca", async () => {
    const b = await prenotazione();
    const unico = `${PREFISSO}altro-${Date.now()}`;
    const org2 = await db.organization.create({
      data: { name: `${PREFISSO}org2`, slug: unico },
    });
    const v2 = await db.venue.create({
      data: {
        orgId: org2.id,
        name: `${PREFISSO}altro`,
        slug: `v-${unico}`,
        timezone: "Europe/Rome",
      },
    });
    await expect(chiediCaparra(v2.id, b.id)).rejects.toThrow("non_trovata");
  });
});

describe("la caparra che arriva", () => {
  it("il pagamento riuscito scrive la prenotazione **nello stesso istante**", async () => {
    /*
      Due scritture separate lascerebbero una finestra in cui il denaro è
      incassato e l'agenda dice ancora «da pagare» — e in quella finestra
      qualcuno telefona per chiedere perché.
    */
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: DOMANI,
        status: "CONFIRMED",
        depositCents: 10_000,
        depositStatus: "REQUESTED",
      },
      select: { id: true },
    });
    const pagamento = await db.payment.create({
      data: {
        venueId,
        bookingId: b.id,
        kind: "DEPOSIT",
        status: "PROCESSING",
        amountCents: 10_000,
        stripePaymentId: "pi_prova_caparra",
      },
      select: { id: true },
    });

    const esito = await registraIncasso({ paymentId: pagamento.id });
    expect(esito?.applicato).toBe(true);

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.depositStatus).toBe("CAPTURED");
    expect(dopo.depositCents).toBe(10_000);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: pagamento.id } }))
        .status,
    ).toBe("SUCCEEDED");
  });

  it("un pagamento del tavolo non tocca nessuna caparra", async () => {
    /* `registraIncasso` la usano tutti: il ramo della caparra deve scattare
       **solo** per i pagamenti di tipo caparra, o un conto pagato al tavolo
       marcherebbe come pagata una caparra che nessuno ha versato. */
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: DOMANI,
        status: "CONFIRMED",
        depositStatus: "REQUESTED",
        depositCents: 10_000,
      },
      select: { id: true },
    });
    const pagamento = await db.payment.create({
      data: {
        venueId,
        bookingId: b.id,
        kind: "TABLE_QR",
        status: "PROCESSING",
        amountCents: 4_200,
      },
      select: { id: true },
    });

    await registraIncasso({ paymentId: pagamento.id });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: b.id } }))
        .depositStatus,
    ).toBe("REQUESTED");
  });

  it("segnaCaparraPagata scrive l'importo incassato, non quello chiesto", async () => {
    /* Se i due divergessero — una caparra cambiata fra la richiesta e il
       pagamento — vale quello che il cliente ha davvero pagato. */
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: DOMANI,
        depositCents: 9_000,
      },
      select: { id: true },
    });
    await segnaCaparraPagata(db, b.id, 10_000);
    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.depositCents).toBe(10_000);
    expect(dopo.depositStatus).toBe("CAPTURED");
  });
});

describe("restituire la caparra", () => {
  it("senza una caparra pagata non si rimborsa niente", async () => {
    const b = await db.booking.create({
      data: { venueId, guestId, partySize: 10, startsAt: DOMANI },
      select: { id: true },
    });
    await expect(rimborsaCaparra(venueId, b.id)).rejects.toThrow(
      "nessuna_caparra_pagata",
    );
  });

  it("senza Stripe pronto lo dice, e non cambia lo stato", async () => {
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: DOMANI,
        depositStatus: "CAPTURED",
        depositCents: 10_000,
      },
      select: { id: true },
    });
    await db.payment.create({
      data: {
        venueId,
        bookingId: b.id,
        kind: "DEPOSIT",
        status: "SUCCEEDED",
        amountCents: 10_000,
        stripePaymentId: "pi_prova",
      },
    });

    await expect(rimborsaCaparra(venueId, b.id)).rejects.toThrow(
      "stripe_non_pronto",
    );
    /* Lo stato resta «pagata»: dire «restituita» senza aver restituito niente
       sarebbe la bugia peggiore di tutte — il cliente aspetta un bonifico che
       non arriva. */
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: b.id } }))
        .depositStatus,
    ).toBe("CAPTURED");
  });

  it("l'errore porta un codice, non una frase da leggere a caso", () => {
    const err = new CaparraError("stripe_non_pronto");
    expect(err.code).toBe("stripe_non_pronto");
    expect(err.name).toBe("CaparraError");
  });
});

describe("il messaggio con il link", () => {
  const dati = {
    nome: "Chiara",
    locale: "Nomad",
    importo: "100 €",
    url: "https://checkout.prova.test/c/abc",
  };

  it("dice il locale, la cifra e dove pagare", () => {
    /* Un link di pagamento arrivato per SMS senza contesto si legge come una
       truffa, e nel 2026 la gente ha imparato a non toccarli. */
    const t = testoCaparra(dati);
    expect(t).toContain("Chiara");
    expect(t).toContain("Nomad");
    expect(t).toContain("100 €");
    expect(t).toContain("https://checkout.prova.test/c/abc");
  });

  it("**nessuna lettera accentata**: costerebbe il doppio", () => {
    /* Un accento porta l'SMS da centosessanta caratteri a settanta. Nessun
       errore lo dice: si scopre dalla fattura. */
    expect(testoCaparra(dati)).not.toMatch(/[àèéìòóùÀÈÉÌÒÓÙ]/);
  });

  it("senza nome resta una frase intera", () => {
    const t = testoCaparra({ ...dati, nome: null });
    expect(t.startsWith("per confermare")).toBe(true);
  });
});

describe("la caparra chiesta dal sito", () => {
  /*
    Chi prenota online sopra la soglia paga subito: e il modo in cui la caparra
    ferma davvero i no-show, perche non dipende da nessuno che si ricordi di
    mandare un link.

    Quello che qui si difende e il **verso**: prima la prenotazione, poi il
    pagamento. Al contrario, un cliente che non completa il pagamento non
    lascerebbe traccia di niente — e un tavolo libero e una prenotazione
    sparita non sono un'informazione, mentre «chiesta, non pagata» lo e.
  */
  it("una prenotazione resta anche se la caparra non si e potuta chiedere", async () => {
    /* In locale Stripe non e configurato: la prenotazione dal sito deve
       nascere comunque. Rifiutarla per un problema nostro vorrebbe dire
       perdere un coperto. */
    await salvaPolitica(venueId, {
      attiva: true,
      daPersone: 8,
      perPersonaCents: 1_000,
      oreAnnulloGratis: 48,
    });

    const b = await db.booking.create({
      data: { venueId, guestId, partySize: 10, startsAt: DOMANI, status: "PENDING" },
      select: { id: true },
    });

    await expect(chiediCaparra(venueId, b.id)).rejects.toThrow("stripe_non_pronto");

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("PENDING");
    /* E senza caparra: il locale la vede e la chiede con un clic. Non «pagata»
       e non «chiesta» — nessuna delle due sarebbe vera. */
    expect(dopo.depositStatus).toBe("NONE");
    expect(dopo.depositCents).toBe(0);
  });

  it("sotto la soglia il sito non chiede niente, e non e un errore", async () => {
    await salvaPolitica(venueId, {
      attiva: true,
      daPersone: 8,
      perPersonaCents: 1_000,
      oreAnnulloGratis: 48,
    });
    const b = await db.booking.create({
      data: { venueId, guestId, partySize: 2, startsAt: DOMANI, status: "CONFIRMED" },
      select: { id: true },
    });

    /* `nessuna_caparra` e il caso normale della maggioranza delle
       prenotazioni: e un esito, non un guasto. */
    await expect(chiediCaparra(venueId, b.id)).rejects.toThrow("nessuna_caparra");
  });
});

describe("la caparra di una prenotazione disdetta", () => {
  /*
    Il pulsante «Restituisci» sta nella pagina di quella prenotazione — che e
    esattamente la pagina che nessuno riapre dopo una disdetta. Senza un
    avviso, il denaro di un cliente resta in cassa perche nessuno se l'e
    ricordato.
  */
  async function conCaparraPagata(quando: Date) {
    return db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: quando,
        status: "CANCELLED",
        depositStatus: "CAPTURED",
        depositCents: 10_000,
      },
      select: { id: true, startsAt: true, depositCents: true, depositStatus: true },
    });
  }

  beforeEach(async () => {
    await salvaPolitica(venueId, {
      attiva: true,
      daPersone: 8,
      perPersonaCents: 1_000,
      oreAnnulloGratis: 48,
    });
  });

  it("disdetta in tempo: dice che **va restituita**", async () => {
    const fraUnaSettimana = new Date(Date.now() + 7 * 86_400_000);
    const b = await conCaparraPagata(fraUnaSettimana);

    expect(await avvisaCaparraDaRestituire(venueId, b)).toBe(true);
    const avviso = await db.notification.findFirstOrThrow({
      where: { venueId, kind: "PAYMENT_REFUND" },
    });
    expect(avviso.title).toContain("da restituire");
    expect(avviso.body).toContain("va restituita");
    /* Il link porta alla prenotazione, dove sta il pulsante: un avviso che
       dice cosa fare e non dove farlo si chiude senza fare niente. */
    expect(avviso.link).toBe(`/bookings/${b.id}`);
  });

  it("disdetta in ritardo: dice che **puoi tenerla**, e non decide", async () => {
    /* La regola dichiarata dice che e fuori tempo. Ma trattenere e restituire
       sono due gesti, e nessuno dei due si decide da solo: la simmetria conta
       — un orologio che muove denaro non lo vuole nessuno, in nessuna delle
       due direzioni. */
    const fraTreOre = new Date(Date.now() + 3 * 3_600_000);
    const b = await conCaparraPagata(fraTreOre);

    expect(await avvisaCaparraDaRestituire(venueId, b)).toBe(true);
    const avviso = await db.notification.findFirstOrThrow({
      where: { venueId, kind: "PAYMENT_REFUND" },
    });
    expect(avviso.body).toContain("puoi tenerla");

    /* E lo stato **non cambia**: la caparra resta pagata finche qualcuno
       decide. */
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).depositStatus).toBe(
      "CAPTURED",
    );
  });

  it("senza caparra pagata non avvisa nessuno", async () => {
    /* Un avviso per ogni disdetta sarebbe rumore, e tre di quelli insegnano a
       non aprire la campanella. */
    const b = await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 10,
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        status: "CANCELLED",
        depositStatus: "REQUESTED",
        depositCents: 10_000,
      },
      select: { id: true, startsAt: true, depositCents: true, depositStatus: true },
    });

    expect(await avvisaCaparraDaRestituire(venueId, b)).toBe(false);
    expect(await db.notification.count({ where: { venueId, kind: "PAYMENT_REFUND" } })).toBe(0);
  });
});
