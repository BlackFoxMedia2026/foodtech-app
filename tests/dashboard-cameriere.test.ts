import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { daGestireOra, salaDelCameriere, soloMiei } from "@/server/staff-app/sala";
import { tavoloConsentito } from "@/server/staff-app/accesso-tavolo";
import { prendiInCarico, prendiInCaricoSeScoperto } from "@/server/staff-app/presa-in-carico";
import { apriTavolo } from "@/server/staff-app/tavolo";
import { PERMESSI_PER_RUOLO } from "@/lib/permessi-staff";
import { chiedeUnGesto } from "@/lib/stato-tavolo-staff";

/**
 * **Lo scenario della famiglia Bertoldi**, dall'inizio alla fine, contro il
 * database.
 *
 * È il percorso che ha fatto nascere questo lavoro, e il difetto che
 * verificava era esattamente al passo 3: il capo sala accomoda quattro
 * persone a T9, e sul telefono dei camerieri non compare **niente**. Non era
 * un tavolo assegnato, non era libero, e non aveva un richiamo — quindi non
 * stava in nessuna delle quattro sezioni della dashboard.
 *
 * Ogni prova qui sotto è un passo dello scenario, nell'ordine in cui succede
 * in sala. Sono in sequenza e condividono lo stato di proposito: rimetterlo a
 * zero fra un passo e l'altro vorrebbe dire verificare sei fotografie invece
 * di un servizio, e il difetto stava proprio nel passaggio da una all'altra.
 *
 * Il «dopo il refresh» non ha bisogno di una prova sua: qui non c'è nessuno
 * stato in memoria da ricaricare. Ogni passo rilegge dal database con le
 * stesse funzioni che usa la pagina, che è ciò che fa un ricaricamento.
 */

const db = new PrismaClient();
const PREFISSO = "test-dashboard-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/** Mezzogiorno di oggi: vedi la nota sull'orologio in `sala-live.test.ts`. */
const ADESSO = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();

const minutiFa = (m: number) => new Date(ADESSO.getTime() - m * 60_000);

/** I permessi di un cameriere vero: comanda sì, tutta la sala no. */
const CAMERIERE = PERMESSI_PER_RUOLO.CAMERIERE;

let venueId = "";
let tableId = "";
let bookingId = "";
let orderId = "";
let sara = "";
let marco = "";

const ctxSara = () => ({ venueId, timezone: "Europe/Rome", waiterId: sara });
const ctxMarco = () => ({ venueId, timezone: "Europe/Rome", waiterId: marco });

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: {
      orgId: org.id,
      name: `${PREFISSO}locale`,
      slug: `${PREFISSO}v${Date.now()}`,
      timezone: "Europe/Rome",
    },
  });
  venueId = venue.id;

  tableId = (await db.table.create({ data: { venueId, label: "T9", seats: 4 } })).id;
  await db.table.create({ data: { venueId, label: "T1", seats: 2 } });

  sara = (
    await db.waiter.create({
      data: {
        venueId,
        firstName: "Sara",
        lastName: "Fedi",
        primaryRole: "CAMERIERE",
        birthday: new Date("1995-04-12"),
        phone: "+390000000001",
        role: "Cameriere",
      },
    })
  ).id;
  marco = (
    await db.waiter.create({
      data: {
        venueId,
        firstName: "Marco",
        lastName: "Pini",
        primaryRole: "CAMERIERE",
        birthday: new Date("1990-07-03"),
        phone: "+390000000002",
        role: "Cameriere",
      },
    })
  ).id;

  const guest = await db.guest.create({
    data: { venueId, firstName: "Famiglia", lastName: "Bertoldi" },
  });

  /* Passi 1–4: la prenotazione esiste, il capo sala le dà T9 e la fa
     accomodare. Tre minuti fa, che è il momento in cui la dashboard deve
     dire «appena seduti». */
  bookingId = (
    await db.booking.create({
      data: {
        venueId,
        guestId: guest.id,
        tableId,
        partySize: 4,
        startsAt: minutiFa(5),
        durationMin: 105,
        status: "SEATED",
        seatedAt: minutiFa(3),
        source: "PHONE",
      },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const salaDiSara = () =>
  salaDelCameriere(ctxSara(), { adesso: ADESSO, ancheLiberi: true, ancheScoperti: true });

describe("la famiglia Bertoldi, da accomodata a servita", () => {
  it("passo 6-7: T9 compare subito in «Da gestire ora», appena seduti", async () => {
    const sala = await salaDiSara();
    const coda = daGestireOra(sala);

    const t9 = coda.find((t) => t.label === "T9");
    expect(t9, "T9 deve stare nella coda anche senza essere assegnato a nessuno").toBeTruthy();
    expect(t9!.stato).toBe("ACCOMODATI");
    expect(t9!.scoperto).toBe(true);
    expect(t9!.mio).toBe(false);
    expect(t9!.ospite).toBe("Famiglia Bertoldi");
    expect(t9!.ospiti).toBe(4);
    expect(t9!.richiamo?.tipo).toBe("SENZA_COMANDA");
    expect(t9!.richiamo?.etichetta).toBe("Appena seduti");
    expect(t9!.richiamo?.daMinuti).toBe(3);
    /* L'ora di seduta, non quella prenotata: sono due cose diverse e la card
       scrive «dalle 11:15» sulla prima. */
    expect(t9!.dalle).toBeTruthy();
  });

  it("e sta in cima: un tavolo libero non compete con quattro persone sedute", async () => {
    const sala = await salaDiSara();
    expect(daGestireOra(sala)[0].label).toBe("T9");
    /* Il tavolo libero resta nella sala, ma fuori dalla coda: non chiede
       niente a nessuno. */
    expect(daGestireOra(sala).some((t) => t.label === "T1")).toBe(false);
  });

  it("un tavolo scoperto si può aprire senza essere il maître", async () => {
    // `view_all_tables` protegge i tavoli **degli altri**. Questo non è di
    // nessuno, e rifiutarlo vorrebbe dire lasciare quattro persone fuori
    // dalla portata di chiunque non sia il responsabile di sala.
    expect(await tavoloConsentito({ ...ctxSara(), permessi: CAMERIERE }, tableId, ADESSO)).toBe(true);
  });

  it("passo 9-10: «prendo io» e T9 entra fra i miei tavoli", async () => {
    await prendiInCarico(ctxSara(), tableId, { adesso: ADESSO });

    const sala = await salaDiSara();
    const t9 = sala.tavoli.find((t) => t.label === "T9")!;
    expect(t9.mio).toBe(true);
    expect(t9.scoperto).toBe(false);
    expect(t9.coperto.map((c) => c.nome)).toEqual(["Sara Fedi"]);
    expect(soloMiei(sala).map((t) => t.label)).toContain("T9");

    // E resta nella coda finché non ha una comanda: prenderlo in carico non
    // è servirlo.
    expect(daGestireOra(sala).some((t) => t.label === "T9")).toBe(true);
  });

  it("da quel momento è di Sara e non di Marco", async () => {
    expect(await tavoloConsentito({ ...ctxMarco(), permessi: CAMERIERE }, tableId, ADESSO)).toBe(
      false,
    );
    const suaSala = await salaDelCameriere(ctxMarco(), {
      adesso: ADESSO,
      ancheLiberi: true,
      ancheScoperti: true,
    });
    expect(suaSala.tavoli.some((t) => t.label === "T9")).toBe(false);
  });

  it("passo 11-12: aperta la comanda, T9 esce dalla coda", async () => {
    const order = await db.order.create({
      data: {
        venueId,
        bookingId,
        reference: `${PREFISSO}${Date.now()}`,
        kind: "TABLE",
        status: "RECEIVED",
        scheduledAt: ADESSO,
        totalCents: 4200,
      },
    });
    orderId = order.id;

    const comanda = await db.comanda.create({
      data: { venueId, orderId, tableId, bookingId, numero: 1, status: "BOZZA", waiterId: sara },
    });
    await db.orderItem.create({
      data: {
        orderId,
        comandaId: comanda.id,
        name: "Tagliatelle",
        priceCents: 1400,
        quantity: 3,
        status: "BOZZA",
      },
    });

    const sala = await salaDiSara();
    const t9 = sala.tavoli.find((t) => t.label === "T9")!;
    expect(t9.stato).toBe("ORDINAZIONE");
    /* Niente da fare: qualcuno ci sta lavorando adesso. Una coda che tenesse
       dentro il tavolo su cui si sta battendo la comanda direbbe al cameriere
       di andare dove è già.

       Il richiamo che resta è la nota dell'ospite — «prima volta qui», che il
       CRM scrive da solo su un cliente nuovo. Serve a chi lo serve e **non è
       una cosa da fare**: resta sull'icona del tasto in Sala e non entra in
       coda. È precisamente la riga che nello screenshot iniziale era l'unica
       cosa sotto «Da fare». */
    expect(chiedeUnGesto(t9.richiamo)).toBe(false);
    expect(daGestireOra(sala).some((t) => t.label === "T9")).toBe(false);
  });

  it("passo 13: partita per la cucina, lo stato lo dice", async () => {
    await db.comanda.updateMany({
      where: { venueId, tableId },
      data: { status: "INVIATA", sentAt: minutiFa(6) },
    });
    await db.orderItem.updateMany({ where: { orderId }, data: { status: "INVIATA" } });

    const t9 = (await salaDiSara()).tavoli.find((t) => t.label === "T9")!;
    expect(t9.stato).toBe("COMANDA_INVIATA");
    expect(t9.daMinutiStato).toBe(6);
    expect(chiedeUnGesto(t9.richiamo)).toBe(false);
  });

  it("i piatti pronti scavalcano tutto, e il cronometro parte dal più vecchio", async () => {
    await db.comanda.updateMany({
      where: { venueId, tableId },
      data: { status: "PRONTA", readyAt: minutiFa(4) },
    });
    await db.orderItem.updateMany({
      where: { orderId },
      data: { status: "PRONTA", readyAt: minutiFa(4) },
    });

    const sala = await salaDiSara();
    const t9 = sala.tavoli.find((t) => t.label === "T9")!;
    expect(t9.stato).toBe("IN_SERVIZIO");
    expect(t9.richiamo?.tipo).toBe("PIATTI_PRONTI");
    expect(t9.richiamo?.etichetta).toBe("Piatti da servire");
    expect(t9.richiamo?.testo).toBe("3 piatti pronti al passe");
    expect(t9.richiamo?.daMinuti).toBe(4);
    expect(daGestireOra(sala)[0].label).toBe("T9");
  });

  it("serviti e passati venti minuti: il tavolo va ricontrollato", async () => {
    await db.comanda.updateMany({
      where: { venueId, tableId },
      data: { status: "SERVITA", servedAt: minutiFa(20) },
    });
    await db.orderItem.updateMany({
      where: { orderId },
      data: { status: "SERVITA", servedAt: minutiFa(20) },
    });

    const t9 = (await salaDiSara()).tavoli.find((t) => t.label === "T9")!;
    expect(t9.richiamo?.tipo).toBe("DA_CONTROLLARE");
  });

  it("il conto richiesto batte il controllo di cortesia", async () => {
    await db.order.update({ where: { id: orderId }, data: { contoRichiestoAt: minutiFa(2) } });

    const sala = await salaDiSara();
    const t9 = sala.tavoli.find((t) => t.label === "T9")!;
    expect(t9.stato).toBe("CONTO");
    expect(t9.richiamo?.tipo).toBe("CONTO");
    expect(t9.richiamo?.daMinuti).toBe(2);
  });

  it("passo 14: aperto da qualunque schermata, è la stessa seduta", async () => {
    // La Home, la Sala e le Comande portano tutte qui, e qui c'è la stessa
    // prenotazione, lo stesso conto, lo stesso stato della card.
    const aperto = await apriTavolo(ctxSara(), tableId, { adesso: ADESSO });
    const dallaLista = (await salaDiSara()).tavoli.find((t) => t.label === "T9")!;

    expect(aperto.seduta?.bookingId).toBe(bookingId);
    expect(aperto.seduta?.ospite).toBe("Famiglia Bertoldi");
    expect(aperto.seduta?.coperti).toBe(4);
    expect(aperto.seduta?.dalle).toBe(dallaLista.dalle);
    expect(aperto.conto?.orderId).toBe(orderId);
    expect(aperto.stato).toBe(dallaLista.stato);
    expect(aperto.richiamo?.tipo).toBe(dallaLista.richiamo?.tipo);
    expect(aperto.mio).toBe(true);
    expect(aperto.coperto.map((c) => c.nome)).toEqual(["Sara Fedi"]);
  });
});

describe("la presa in carico implicita", () => {
  it("chi batte la comanda su un tavolo scoperto se lo prende", async () => {
    const t1 = await db.table.findFirstOrThrow({ where: { venueId, label: "T1" } });
    const guest = await db.guest.create({
      data: { venueId, firstName: "Walk", lastName: "In" },
    });
    await db.booking.create({
      data: {
        venueId,
        guestId: guest.id,
        tableId: t1.id,
        partySize: 2,
        startsAt: minutiFa(2),
        durationMin: 105,
        status: "SEATED",
        seatedAt: minutiFa(2),
        source: "WALK_IN",
      },
    });

    await prendiInCaricoSeScoperto(ctxMarco(), t1.id, { adesso: ADESSO });

    const suaSala = await salaDelCameriere(ctxMarco(), {
      adesso: ADESSO,
      ancheLiberi: true,
      ancheScoperti: true,
    });
    expect(soloMiei(suaSala).map((t) => t.label)).toContain("T1");
  });

  it("ma non ruba il tavolo di un collega", async () => {
    // Aiutare su un tavolo di qualcun altro è normale e non deve cambiargli
    // il rango sotto i piedi.
    await prendiInCaricoSeScoperto(ctxMarco(), tableId, { adesso: ADESSO });

    const t9 = (await salaDiSara()).tavoli.find((t) => t.label === "T9")!;
    expect(t9.coperto.map((c) => c.nome)).toEqual(["Sara Fedi"]);
  });
});
