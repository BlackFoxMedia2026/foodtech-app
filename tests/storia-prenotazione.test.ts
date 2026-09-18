import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createBooking, updateBooking } from "@/server/bookings";
import { storiaPrenotazione } from "@/server/storia-prenotazione";
import { registraEventoChiamata } from "@/server/chiamate";
import { collegaPrenotazioneAChiamata } from "@/server/voice/collega";

/**
 * La storia di una prenotazione, letta dai fatti.
 *
 * Il punto di questi test non è che la storia si scriva — **non si scrive
 * niente**, è tutto già nel database. Il punto è che quello che c'era da mesi
 * diventi leggibile senza mentire: chi ha spostato cosa, se il messaggio è
 * partito, e da dove è arrivata la prenotazione.
 */

const db = new PrismaClient();
const PREFISSO = "test-storia-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";
let orgId = "";
let tavoloId = "";

/** Domani alle 20, dentro qualunque orario. */
function domaniAlle20(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  orgId = org.id;
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
  const room = await db.room.create({ data: { venueId, name: "Sala" } });
  const t = await db.table.create({
    data: { venueId, roomId: room.id, label: "T7", seats: 4 },
  });
  tavoloId = t.id;
}, 60_000);

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { venueId } });
  await db.messageLog.deleteMany({ where: { venueId } });
  await db.phoneCallEvent.deleteMany({ where: { call: { venueId } } });
  await db.phoneCall.deleteMany({ where: { venueId } });
  await db.voiceCallback.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

async function prenotazione(fonte: "WIDGET" | "PHONE" = "PHONE") {
  return createBooking(venueId, {
    guest: { firstName: "Chi", lastName: "Chiama", phone: "+393471110099" },
    partySize: 2,
    startsAt: domaniAlle20(),
    source: fonte,
  });
}

const ATTORE = {
  userId: "utente-di-prova",
  email: "anna@locale.it",
  orgId: "",
  venueId: "",
};

describe("la storia di una prenotazione", () => {
  it("la nascita c'è sempre, anche se nessuno ha registrato niente", async () => {
    const b = await prenotazione("WIDGET");
    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");

    /* Una prenotazione dal sito non lascia **nessuna** riga nel registro delle
       azioni: `recordAudit` non scrive senza attore, e dal widget non c'è
       nessun utente. La nascita si legge dalla riga stessa — se dipendesse dal
       registro, la storia di ogni prenotazione arrivata dal sito comincerebbe
       dal nulla. */
    expect(storia).toHaveLength(1);
    expect(storia[0]?.cosa).toBe("Prenotata dal sito");
    expect(storia[0]?.chi).toBeNull();
  });

  it("dice chi ha spostato, e da dove a dove", async () => {
    const b = await prenotazione();
    const dopo = new Date(domaniAlle20().getTime() + 60 * 60 * 1000);
    await updateBooking(
      venueId,
      b.id,
      { startsAt: dopo.toISOString() },
      { actor: { ...ATTORE, orgId, venueId } },
    );

    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    const spostamento = storia.find((v) => v.cosa.startsWith("Spostata"));
    /* La differenza era nel registro da mesi e nessuno la leggeva: «Anna ha
       aggiornato» non serve a nessuno, «Anna ha spostato da ven 19 set, 20:00
       a ven 19 set, 21:00» è l'informazione.

       Le due ore si calcolano **qui**, con lo stesso fuso del locale e non con
       quello della macchina: la prima versione di questa prova cercava
       «20:00» e girava su una macchina a UTC, dove quell'istante si scrive
       22:00. Passava in Italia e sarebbe diventata rossa in CI — cioè
       misurava il fuso del computer, non il prodotto. */
    const conFuso = new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
    expect(spostamento).toBeTruthy();
    expect(spostamento?.chi).toBe("Anna");
    expect(spostamento?.cosa).toContain(conFuso.format(domaniAlle20()));
    expect(spostamento?.cosa).toContain(conFuso.format(dopo));
  });

  it("racconta un cambio di coperti e di tavolo nella stessa modifica, separati", async () => {
    const b = await prenotazione();
    await updateBooking(
      venueId,
      b.id,
      { partySize: 4, tableId: tavoloId },
      { actor: { ...ATTORE, orgId, venueId } },
    );

    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    const frasi = storia.map((v) => v.cosa);
    /* Una riga di registro, due cambiamenti: separati si leggono, insieme
       diventano «ha aggiornato». */
    expect(frasi).toContain("Coperti da 2 a 4");
    expect(frasi).toContain("Tavolo T7");
  });

  it("la disdetta non si nasconde fra le modifiche", async () => {
    const b = await prenotazione();
    await updateBooking(
      venueId,
      b.id,
      { status: "CANCELLED" },
      { actor: { ...ATTORE, orgId, venueId } },
    );
    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    const disdetta = storia.find((v) => v.tipo === "disdetta");
    expect(disdetta?.cosa).toBe("Disdetta");
    expect(disdetta?.chi).toBe("Anna");
  });

  it("un messaggio non partito non si racconta come mandato", async () => {
    const b = await prenotazione();
    await db.messageLog.create({
      data: {
        venueId,
        bookingId: b.id,
        kind: "booking.confirmation",
        channel: "EMAIL",
        toAddress: "cliente@esempio.it",
        status: "FAILED",
      },
    });
    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    const messaggio = storia.find((v) => v.tipo === "messaggio");
    /* «Conferma mandata» su un messaggio non partito è la bugia che fa dire
       «ma io gliel'ho scritto». */
    expect(messaggio?.cosa).toContain("non è partito");
  });

  it("la telefonata da cui è nata sta nella storia", async () => {
    const chiamata = await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}${Math.random()}`,
      phone: "+393471110099",
      stato: "MISSED",
    });
    const b = await prenotazione();
    await collegaPrenotazioneAChiamata(
      venueId,
      chiamata.id,
      { id: b.id, reference: b.reference },
      "anna@locale.it",
    );

    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    expect(storia.some((v) => v.tipo === "telefonata")).toBe(true);
  });

  it("la storia di un'altra prenotazione non si legge da qui", async () => {
    const b = await prenotazione();
    const storia = await storiaPrenotazione("locale-di-un-altro", b.id);
    expect(storia).toHaveLength(0);
  });

  it("dal più recente: si apre per sapere com'è adesso", async () => {
    const b = await prenotazione();
    await updateBooking(
      venueId,
      b.id,
      { partySize: 6 },
      { actor: { ...ATTORE, orgId, venueId } },
    );
    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    for (let i = 1; i < storia.length; i++) {
      expect(storia[i - 1]!.quando.getTime()).toBeGreaterThanOrEqual(
        storia[i]!.quando.getTime(),
      );
    }
  });
});

describe("la fonte VOICE", () => {
  it("non si può dichiarare da una richiesta", async () => {
    /* `BookingInput` non accetta `VOICE`: se lo accettasse, chiunque potrebbe
       dire che una prenotazione l'ha presa una macchina — o che l'ha presa una
       persona quando l'ha presa una macchina, che è il verso che conta,
       perché `PHONE` si autoconferma. */
    await expect(
      createBooking(venueId, {
        guest: { firstName: "Furbo" },
        partySize: 2,
        startsAt: domaniAlle20(),
        source: "VOICE",
      }),
    ).rejects.toThrow();
  });

  it("dal codice server sì, e non si autoconferma", async () => {
    const b = await createBooking(
      venueId,
      {
        guest: { firstName: "Dal", lastName: "Risponditore" },
        partySize: 2,
        startsAt: domaniAlle20(),
      },
      { source: "VOICE" },
    );
    expect(b.source).toBe("VOICE");
    /* Il punto della fonte separata: al telefono ha risposto una persona, il
       risponditore ha raccolto dei tasti. La prima si conferma da sé, la
       seconda la conferma il locale. */
    expect(b.status).toBe("PENDING");

    const storia = await storiaPrenotazione(venueId, b.id, "Europe/Rome");
    expect(storia[storia.length - 1]?.cosa).toBe(
      "Raccolta dal risponditore del centralino",
    );
  });

  it("al telefono, da una persona, si conferma da sé", async () => {
    const b = await prenotazione("PHONE");
    expect(b.status).toBe("CONFIRMED");
  });
});
