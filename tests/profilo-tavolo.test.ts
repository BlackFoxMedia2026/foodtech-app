import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getProfiloTavolo, getStoricoTavolo, servizioDi } from "@/server/profilo-tavolo";

/**
 * Il profilo di un tavolo.
 *
 * Due cose vanno fissate per iscritto, perché sono quelle che un ritocco
 * distratto romperebbe senza far fallire niente altro:
 *
 * 1. **il residuo non sta in colonna.** Si somma dai pagamenti, dentro la
 *    stessa lettura che mostra il conto. Il giorno in cui qualcuno lo copiasse
 *    in un campo, il pannello direbbe «restano 90 €» a un tavolo che ha già
 *    saldato — e il cameriere ci andrebbe;
 * 2. **lo storico tiene l'id del tavolo, non il nome.** Rinominare il 12 in
 *    «12 bis» non deve spostare né perdere le serate già fatte.
 */

const ROMA = "Europe/Rome";

/* -------------------------------------------------------------------------- */
/*  In quale servizio cade un istante                                         */
/* -------------------------------------------------------------------------- */

describe("il servizio di un istante", () => {
  // Martedì: weekday 2.
  const pranzo = { name: "Pranzo", weekday: 2, startMinute: 12 * 60, endMinute: 15 * 60 };
  const cena = { name: "Cena", weekday: 2, startMinute: 19 * 60, endMinute: 23 * 60 + 30 };
  /** Una cena che scavalca la mezzanotte: finisce all'01:30 del giorno dopo. */
  const cenaLunga = { name: "Cena", weekday: 2, startMinute: 19 * 60, endMinute: 25 * 60 + 30 };

  it("riconosce la fascia in cui cade l'ora locale, non quella UTC", () => {
    // 18:00 UTC = 20:00 a Roma d'estate: è cena, non «fuori servizio».
    expect(servizioDi(new Date("2026-09-15T18:00:00.000Z"), [pranzo, cena], ROMA)).toBe("Cena");
    expect(servizioDi(new Date("2026-09-15T11:00:00.000Z"), [pranzo, cena], ROMA)).toBe("Pranzo");
  });

  it("fuori da ogni fascia non inventa un servizio", () => {
    // 17:00 a Roma: il pranzo è finito, la cena non è cominciata.
    expect(servizioDi(new Date("2026-09-15T15:00:00.000Z"), [pranzo, cena], ROMA)).toBeNull();
  });

  it("una cena che scavalca la mezzanotte copre le ore piccole del giorno dopo", () => {
    // Mercoledì 00:30 a Roma: appartiene alla cena di martedì.
    const orePiccole = new Date("2026-09-15T22:30:00.000Z");
    expect(servizioDi(orePiccole, [cenaLunga], ROMA)).toBe("Cena");
    // Con una cena che finisce alle 23:30, invece, l'una di notte è fuori.
    expect(servizioDi(orePiccole, [cena], ROMA)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Contro il database                                                        */
/* -------------------------------------------------------------------------- */

describe("il profilo di un tavolo, contro il database", () => {
  const db = new PrismaClient();
  const PREFISSO = "test-profilo-";

  const url = process.env.DATABASE_URL ?? "";
  if (!/dev|test/i.test(url)) {
    throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
  }

  /** Martedì 15 settembre 2026, 20:00 a Roma. In piena cena. */
  const ADESSO = new Date("2026-09-15T18:00:00.000Z");

  let venueId = "";
  let guestId = "";
  let waiterId = "";
  let tableId = "";

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
    });
    const venue = await db.venue.create({
      data: {
        orgId: org.id,
        name: `${PREFISSO}locale`,
        slug: `${PREFISSO}v${Date.now()}`,
        timezone: ROMA,
        currency: "EUR",
      },
    });
    venueId = venue.id;

    // Le fasce servono sia a dire «Cena» sia a leggere il personale, che è
    // scritto per giorno **e** servizio.
    await db.shift.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { venueId, name: "Pranzo", weekday, startMinute: 12 * 60, endMinute: 15 * 60 },
        { venueId, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60 + 30 },
      ]),
    });

    const room = await db.room.create({ data: { venueId, name: "Sala prova" } });
    tableId = (await db.table.create({ data: { venueId, roomId: room.id, label: "P1", seats: 4 } })).id;
    guestId = (
      await db.guest.create({
        data: { venueId, firstName: "Mario", lastName: "Rossi", totalVisits: 12, loyaltyTier: "VIP" },
      })
    ).id;
    waiterId = (
      await db.waiter.create({
        data: {
          venueId,
          firstName: "Marco",
          lastName: "Bianchi",
          birthday: new Date("1990-01-01"),
          phone: "+390000000",
          role: "Cameriere",
          capabilities: ["TABLE_RESPONSIBLE"],
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
    await db.$disconnect();
  }, 60_000);

  async function svuota() {
    await db.payment.deleteMany({ where: { venueId } });
    await db.order.deleteMany({ where: { venueId } });
    await db.booking.deleteMany({ where: { venueId } });
    await db.staffAssignment.deleteMany({ where: { venueId } });
  }

  /** Una serata su questo tavolo: prenotazione seduta, conto, e quello che vuoi. */
  async function serata(opts: {
    sedutiDaMin: number;
    righe: Array<{ nome: string; prezzoCents: number; quantita: number }>;
    chiusaDaMin?: number;
  }) {
    const seatedAt = new Date(ADESSO.getTime() - opts.sedutiDaMin * 60_000);
    const booking = await db.booking.create({
      data: {
        venueId,
        guestId,
        tableId,
        partySize: 4,
        startsAt: seatedAt,
        durationMin: 105,
        status: opts.chiusaDaMin != null ? "COMPLETED" : "SEATED",
        source: "PHONE",
        seatedAt,
        closedAt:
          opts.chiusaDaMin != null ? new Date(ADESSO.getTime() - opts.chiusaDaMin * 60_000) : null,
      },
    });
    const order = await db.order.create({
      data: {
        venueId,
        bookingId: booking.id,
        guestId,
        kind: "TABLE",
        status: opts.chiusaDaMin != null ? "COMPLETED" : "RECEIVED",
        reference: `${PREFISSO}${booking.id.slice(-8)}`,
        scheduledAt: seatedAt,
        tableLabel: "P1",
        OrderItem: {
          create: opts.righe.map((r) => ({
            name: r.nome,
            priceCents: r.prezzoCents,
            quantity: r.quantita,
          })),
        },
      },
    });
    return { booking, order };
  }

  it("dice chi c'è, da quanto e quanto resta da pagare", async () => {
    await svuota();
    // 122,00 € di conto, 32,00 € già pagati col QR: restano 90,00 €.
    const { order } = await serata({
      sedutiDaMin: 84,
      righe: [{ nome: "Menu degustazione", prezzoCents: 6100, quantita: 2 }],
    });
    await db.payment.create({
      data: {
        venueId,
        orderId: order.id,
        tableId,
        amountCents: 3500,
        tipCents: 300,
        kind: "TABLE_QR",
        status: "SUCCEEDED",
        paidAt: new Date(ADESSO.getTime() - 10 * 60_000),
        paymentMethod: "card",
      },
    });

    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });

    // Seduti da 84' con 105' previsti: ancora dentro la durata, quindi
    // «occupato». Diventerebbe «al conto» passati i 105.
    expect(p.stato).toBe("OCCUPATO");
    expect(p.corrente?.ospite.nome).toBe("Mario Rossi");
    expect(p.corrente?.coperti).toBe(4);
    expect(p.corrente?.daMinuti).toBe(84);

    // Il residuo si somma dai pagamenti: 12200 - (3500 - 300) = 9000.
    expect(p.conto?.totaleCents).toBe(12200);
    expect(p.conto?.pagatoCents).toBe(3200);
    expect(p.conto?.residuoCents).toBe(9000);
    expect(p.conto?.manceCents).toBe(300);
    expect(p.conto?.quote).toHaveLength(1);
    expect(p.conto?.quote[0].stato).toBe("PAGATA");

    // Il cliente c'è una volta sola, ed è quello della prenotazione.
    expect(p.clienti).toHaveLength(1);
    expect(p.clienti[0].guestId).toBe(guestId);
    expect(p.clienti[0].visite).toBe(12);
  });

  it("un pagamento scaduto non tiene impegnato niente", async () => {
    await svuota();
    const { order } = await serata({
      sedutiDaMin: 30,
      righe: [{ nome: "Coperto", prezzoCents: 1000, quantita: 4 }],
    });
    // Qualcuno ha aperto Stripe e ha chiuso la pagina un'ora fa.
    await db.payment.create({
      data: {
        venueId,
        orderId: order.id,
        tableId,
        amountCents: 2000,
        kind: "TABLE_QR",
        status: "PROCESSING",
        expiresAt: new Date(ADESSO.getTime() - 60 * 60_000),
      },
    });

    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });
    expect(p.conto?.inCorsoCents).toBe(0);
    expect(p.conto?.residuoCents).toBe(4000);
    expect(p.pagamentoInCorso).toBe(false);
  });

  it("un pagamento vivo impegna la sua parte, e si vede in testa", async () => {
    await svuota();
    const { order } = await serata({
      sedutiDaMin: 30,
      righe: [{ nome: "Coperto", prezzoCents: 1000, quantita: 4 }],
    });
    await db.payment.create({
      data: {
        venueId,
        orderId: order.id,
        tableId,
        amountCents: 2000,
        kind: "TABLE_QR",
        status: "PROCESSING",
        expiresAt: new Date(ADESSO.getTime() + 10 * 60_000),
      },
    });

    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });
    expect(p.conto?.inCorsoCents).toBe(2000);
    expect(p.conto?.residuoCents).toBe(2000);
    expect(p.pagamentoInCorso).toBe(true);
  });

  it("legge il personale assegnato a questo tavolo per questo servizio", async () => {
    await svuota();
    await db.staffAssignment.create({
      data: {
        venueId,
        waiterId,
        tableId,
        date: new Date("2026-09-15T00:00:00.000Z"),
        service: "Cena",
        scope: "TABLE",
        assignmentType: "TABLE_RESPONSIBLE",
      },
    });

    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });
    expect(p.servizio).toBe("Cena");
    expect(p.personale).toHaveLength(1);
    expect(p.personale[0].nome).toBe("Marco Bianchi");
    expect(p.personale[0].ruolo).toBe("TABLE_RESPONSIBLE");

    // Il personale del pranzo non compare alla cena.
    const aPranzo = await getProfiloTavolo(venueId, tableId, {
      now: ADESSO,
      giorno: "2026-09-15",
      servizio: "Pranzo",
    });
    expect(aPranzo.personale).toHaveLength(0);
  });

  it("lo storico raccoglie i servizi chiusi, col conto e con chi serviva", async () => {
    await svuota();
    await db.staffAssignment.create({
      data: {
        venueId,
        waiterId,
        tableId,
        date: new Date("2026-09-15T00:00:00.000Z"),
        service: "Cena",
        scope: "TABLE",
        assignmentType: "TABLE_RESPONSIBLE",
      },
    });
    // Una serata chiusa dieci minuti fa: seduti alle 19:20, alzati alle 19:50.
    // Dentro la fascia «Cena», che è ciò che le dà un nome nello storico.
    const { order } = await serata({
      sedutiDaMin: 40,
      chiusaDaMin: 10,
      righe: [{ nome: "Cena", prezzoCents: 9300, quantita: 2 }],
    });
    await db.payment.create({
      data: {
        venueId,
        orderId: order.id,
        tableId,
        amountCents: 19100,
        tipCents: 500,
        kind: "TABLE_QR",
        status: "SUCCEEDED",
        paidAt: new Date(ADESSO.getTime() - 61 * 60_000),
      },
    });

    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });
    expect(p.storicoTotale).toBe(1);
    expect(p.storico).toHaveLength(1);

    const s = p.storico[0];
    expect(s.giorno).toBe("2026-09-15");
    expect(s.servizio).toBe("Cena");
    expect(s.coperti).toBe(4);
    expect(s.durataMin).toBe(30); // seduti 40' fa, liberato 10' fa
    expect(s.totaleCents).toBe(18600);
    expect(s.pagatoCents).toBe(18600);
    expect(s.manceCents).toBe(500);
    expect(s.ospite?.nome).toBe("Mario Rossi");
    expect(s.personale).toEqual(["Marco Bianchi"]);
  });

  it("lo storico segue l'id del tavolo, non il suo nome", async () => {
    await svuota();
    await serata({
      sedutiDaMin: 180,
      chiusaDaMin: 60,
      righe: [{ nome: "Cena", prezzoCents: 5000, quantita: 1 }],
    });

    // Il locale rinomina il tavolo a metà stagione: la serata resta sua.
    await db.table.update({ where: { id: tableId }, data: { label: "P1 bis" } });
    try {
      const { righe, totale } = await getStoricoTavolo(venueId, tableId, { now: ADESSO });
      expect(totale).toBe(1);
      expect(righe).toHaveLength(1);
    } finally {
      await db.table.update({ where: { id: tableId }, data: { label: "P1" } });
    }
  });

  it("una prenotazione mai chiusa non finisce nello storico", async () => {
    await svuota();
    // Seduti e mai chiusi: è una riga dimenticata, non una serata.
    await serata({ sedutiDaMin: 600, righe: [{ nome: "Cena", prezzoCents: 5000, quantita: 1 }] });
    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });
    expect(p.storicoTotale).toBe(0);
  });

  it("su un giorno futuro si legge la giornata, non l'orologio di adesso", async () => {
    await svuota();
    // Una cena di sabato prossimo: guardata con l'orologio di oggi risulterebbe
    // finita, e il tavolo libero.
    await db.booking.create({
      data: {
        venueId,
        guestId,
        tableId,
        partySize: 2,
        startsAt: new Date("2026-09-19T18:30:00.000Z"),
        durationMin: 105,
        status: "CONFIRMED",
        source: "PHONE",
      },
    });

    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO, giorno: "2026-09-19" });
    expect(p.giorno).toBe("2026-09-19");
    expect(p.stato).toBe("PRENOTATO");
    expect(p.corrente?.ospite.nome).toBe("Mario Rossi");
    // Nessun conto: nessuno si è ancora seduto.
    expect(p.conto).toBeNull();
  });

  it("un tavolo senza niente sopra è libero e lo dice", async () => {
    await svuota();
    const p = await getProfiloTavolo(venueId, tableId, { now: ADESSO });
    expect(p.stato).toBe("LIBERO");
    expect(p.corrente).toBeNull();
    expect(p.prossima).toBeNull();
    expect(p.conto).toBeNull();
    expect(p.clienti).toHaveLength(0);
    expect(p.qr.generato).toBe(false);
    expect(p.qr.attivo).toBe(false);
  });
});
