import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registraEventoChiamata } from "@/server/chiamate";
import { elencoChiamate } from "@/server/chiamate";
import {
  EsitoNonModificabileError,
  esitoDalFatto,
  impostaEsito,
} from "@/server/voice/esiti";
import {
  apriRichiamata,
  chiudiRichiamata,
  richiamateAperte,
  segnaTentativo,
  NumeroNonRichiamabileError,
} from "@/server/voice/richiamate";
import { collegaPrenotazioneAChiamata } from "@/server/voice/collega";
import { cosaDaFareAlTelefono } from "@/server/voice/da-fare";

/**
 * Gli esiti e la coda delle richiamate.
 *
 * Le cose che qui si provano sono quelle che, sbagliate, si scoprono con un
 * cliente al telefono: una coda che non si spegne quando il lavoro è fatto, la
 * stessa persona in coda due volte, e una chiamata che resta «persa» dopo che
 * qualcuno l'ha richiamata e ha preso la prenotazione.
 */

const db = new PrismaClient();
const PREFISSO = "test-esiti-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";
let altroVenueId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
  const altro = await db.venue.create({
    data: {
      orgId: org.id,
      name: `${unico}-2`,
      slug: `${unico}-2`,
      timezone: "Europe/Rome",
    },
  });
  altroVenueId = altro.id;
}, 60_000);

afterEach(async () => {
  await db.voiceCallback.deleteMany({
    where: { venueId: { in: [venueId, altroVenueId] } },
  });
  await db.phoneCallEvent.deleteMany({
    where: { call: { venueId: { in: [venueId, altroVenueId] } } },
  });
  await db.phoneCall.deleteMany({
    where: { venueId: { in: [venueId, altroVenueId] } },
  });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

/** Una chiamata come la manda il centralino, nello stato che si vuole. */
async function chiamata(
  stato: "RINGING" | "ANSWERED" | "MISSED" | "ENDED",
  telefono = "+393471112233",
) {
  const r = await registraEventoChiamata(venueId, {
    externalId: `${PREFISSO}${Math.random()}`,
    phone: telefono,
    stato,
  });
  return r.id;
}

/* -------------------------------------------------------------------------- */
/*  Gli esiti                                                                 */
/* -------------------------------------------------------------------------- */

describe("gli esiti di una chiamata", () => {
  it("una chiamata persa nasce già con il suo esito, una risposta no", async () => {
    const persa = await chiamata("MISSED");
    const risposta = await chiamata("ANSWERED", "+393471112244");

    const righe = await db.phoneCall.findMany({
      where: { id: { in: [persa, risposta] } },
      select: { id: true, outcome: true, handler: true },
    });
    const p = righe.find((r) => r.id === persa)!;
    const a = righe.find((r) => r.id === risposta)!;

    expect(p.outcome).toBe("MISSED");
    expect(p.handler).toBe("NONE");

    /* «Non si sa ancora» è diverso da «niente da fare»: se nascesse con un
       esito qualunque, lo storico direbbe che quella telefonata è stata
       chiusa da qualcuno — e nessuno l'ha chiusa. */
    expect(a.outcome).toBeNull();
    expect(a.handler).toBe("HUMAN");
  });

  it("chi risponde dice com'è finita, e resta scritto chi l'ha detto", async () => {
    const id = await chiamata("ENDED");
    await impostaEsito(venueId, id, "INFORMATION", {
      nota: "Voleva sapere se siamo aperti il 25",
      attore: "sala@locale.it",
    });

    const riga = await db.phoneCall.findUniqueOrThrow({
      where: { id },
      select: { outcome: true, notes: true, handler: true },
    });
    expect(riga.outcome).toBe("INFORMATION");
    expect(riga.notes).toContain("aperti il 25");
    expect(riga.handler).toBe("HUMAN");

    const eventi = await db.phoneCallEvent.findMany({ where: { callId: id } });
    const chiusura = eventi.find((e) => e.kind === "OUTCOME_SET");
    expect(chiusura?.actor).toBe("sala@locale.it");
  });

  it("un esito scritto a mano si corregge", async () => {
    const id = await chiamata("ENDED");
    await impostaEsito(venueId, id, "NO_ACTION");
    await impostaEsito(venueId, id, "INFORMATION");
    const riga = await db.phoneCall.findUniqueOrThrow({
      where: { id },
      select: { outcome: true },
    });
    expect(riga.outcome).toBe("INFORMATION");
  });

  it("un esito che nasce da un fatto non si contraddice a mano", async () => {
    const id = await chiamata("ENDED");
    await esitoDalFatto(id, "BOOKING_CREATED");

    /* Il punto: «niente da fare» su una telefonata da cui è nata una
       prenotazione non è un'opinione diversa, è una riga che contraddice
       un'altra riga del database. */
    await expect(impostaEsito(venueId, id, "NO_ACTION")).rejects.toThrow(
      EsitoNonModificabileError,
    );
    const riga = await db.phoneCall.findUniqueOrThrow({
      where: { id },
      select: { outcome: true },
    });
    expect(riga.outcome).toBe("BOOKING_CREATED");
  });

  it("una chiamata persa poi recuperata diventa riuscita, non resta persa", async () => {
    const id = await chiamata("MISSED");
    expect(
      (
        await db.phoneCall.findUniqueOrThrow({
          where: { id },
          select: { outcome: true },
        })
      ).outcome,
    ).toBe("MISSED");

    /* È il caso di ogni giorno: nessuno ha risposto, chi arriva in servizio
       richiama e prende la prenotazione. Se restasse «persa», a fine mese
       quella telefonata risulterebbe fra le occasioni buttate. */
    await esitoDalFatto(id, "BOOKING_CREATED");
    expect(
      (
        await db.phoneCall.findUniqueOrThrow({
          where: { id },
          select: { outcome: true },
        })
      ).outcome,
    ).toBe("BOOKING_CREATED");
  });

  it("un fatto non declassa una prenotazione già presa", async () => {
    const id = await chiamata("ENDED");
    await esitoDalFatto(id, "BOOKING_CREATED");
    await esitoDalFatto(id, "WAITLIST_ADDED");
    expect(
      (
        await db.phoneCall.findUniqueOrThrow({
          where: { id },
          select: { outcome: true },
        })
      ).outcome,
    ).toBe("BOOKING_CREATED");
  });

  it("la chiamata di un altro locale non esiste", async () => {
    const id = await chiamata("ENDED");
    await expect(
      impostaEsito(altroVenueId, id, "NO_ACTION"),
    ).rejects.toThrowError("not_found");
  });

  it("l'esito compare nell'elenco", async () => {
    const id = await chiamata("ENDED");
    await impostaEsito(venueId, id, "INFORMATION");
    const elenco = await elencoChiamate(venueId);
    const riga = elenco.chiamate.find((c) => c.id === id);
    expect(riga?.esito).toBe("INFORMATION");
    expect(riga?.chiHaRisposto).toBe("HUMAN");
  });
});

/* -------------------------------------------------------------------------- */
/*  La coda                                                                   */
/* -------------------------------------------------------------------------- */

describe("la coda delle richiamate", () => {
  it("la stessa persona non entra in coda due volte", async () => {
    const id = await chiamata("MISSED");
    const prima = await apriRichiamata(venueId, { callId: id });
    const seconda = await apriRichiamata(venueId, { callId: id });

    expect(prima.giaInCoda).toBe(false);
    /* Non un errore: chi ha premuto voleva quella persona in coda, e in coda
       c'è. Un errore lo farebbe dubitare di una coda che è già giusta. */
    expect(seconda.giaInCoda).toBe(true);
    expect(seconda.id).toBe(prima.id);
    expect(await db.voiceCallback.count({ where: { venueId } })).toBe(1);
  });

  it("lo stesso numero scritto in un altro modo è la stessa persona", async () => {
    await apriRichiamata(venueId, { numero: "+39 347 111 2233" });
    const di_nuovo = await apriRichiamata(venueId, { numero: "3471112233" });
    expect(di_nuovo.giaInCoda).toBe(true);
    expect(await db.voiceCallback.count({ where: { venueId } })).toBe(1);
  });

  it("chiusa, quella persona può tornare in coda domani", async () => {
    const prima = await apriRichiamata(venueId, { numero: "+393471112233" });
    await chiudiRichiamata(venueId, prima.id, { come: "DONE" });
    const dopo = await apriRichiamata(venueId, { numero: "+393471112233" });
    expect(dopo.giaInCoda).toBe(false);
    expect(dopo.id).not.toBe(prima.id);
  });

  it("un numero riservato non si mette in coda", async () => {
    const id = await chiamata("MISSED", "");
    await expect(apriRichiamata(venueId, { callId: id })).rejects.toThrow(
      NumeroNonRichiamabileError,
    );
  });

  it("«non risponde» resta in coda e conta i tentativi", async () => {
    const r = await apriRichiamata(venueId, { numero: "+393471112233" });
    expect(await segnaTentativo(venueId, r.id)).toBe(1);
    expect(await segnaTentativo(venueId, r.id)).toBe(2);
    const aperte = await richiamateAperte(venueId);
    expect(aperte).toHaveLength(1);
    expect(aperte[0]?.tentativi).toBe(2);
  });

  it("«non richiamare» è una decisione e resta scritta", async () => {
    const r = await apriRichiamata(venueId, { numero: "+393471112233" });
    await chiudiRichiamata(venueId, r.id, {
      come: "IGNORED",
      nota: "Numero sbagliato",
      attore: "sala@locale.it",
    });
    const riga = await db.voiceCallback.findUniqueOrThrow({
      where: { id: r.id },
      select: { stato: true, chiusoDa: true, chiusoIl: true, nota: true },
    });
    expect(riga.stato).toBe("IGNORED");
    expect(riga.chiusoDa).toBe("sala@locale.it");
    expect(riga.chiusoIl).not.toBeNull();
    expect(riga.nota).toBe("Numero sbagliato");
  });

  it("chi chiude per secondo non riscrive la firma del primo", async () => {
    const r = await apriRichiamata(venueId, { numero: "+393471112233" });
    await chiudiRichiamata(venueId, r.id, {
      come: "DONE",
      attore: "primo@x.it",
    });
    await chiudiRichiamata(venueId, r.id, {
      come: "IGNORED",
      attore: "secondo@x.it",
    });
    const riga = await db.voiceCallback.findUniqueOrThrow({
      where: { id: r.id },
      select: { stato: true, chiusoDa: true },
    });
    expect(riga.stato).toBe("DONE");
    expect(riga.chiusoDa).toBe("primo@x.it");
  });

  it("la richiamata di un altro locale non esiste", async () => {
    const r = await apriRichiamata(venueId, { numero: "+393471112233" });
    await expect(
      chiudiRichiamata(altroVenueId, r.id, { come: "DONE" }),
    ).rejects.toThrowError("not_found");
  });
});

/* -------------------------------------------------------------------------- */
/*  Il centro operativo                                                      */
/* -------------------------------------------------------------------------- */

describe("cosa c'è da fare al telefono", () => {
  it("una persa senza nessuna decisione chiede un gesto; con la decisione no", async () => {
    const id = await chiamata("MISSED");
    let daFare = await cosaDaFareAlTelefono(venueId);
    expect(daFare.perse.map((p) => p.id)).toContain(id);
    expect(daFare.richiamate).toHaveLength(0);

    await apriRichiamata(venueId, { callId: id });
    daFare = await cosaDaFareAlTelefono(venueId);
    /* Passa dall'una all'altra lista e **non** sta in entrambe: le perse
       chiedono di decidere, le richiamate chiedono di telefonare. La stessa
       riga in due liste farebbe contare due volte lo stesso lavoro. */
    expect(daFare.perse.map((p) => p.id)).not.toContain(id);
    expect(daFare.richiamate).toHaveLength(1);
    expect(daFare.totale).toBe(1);
  });

  it("decisa di lasciar perdere, non torna a chiedere attenzione domani", async () => {
    const id = await chiamata("MISSED");
    const r = await apriRichiamata(venueId, { callId: id });
    await chiudiRichiamata(venueId, r.id, { come: "IGNORED" });

    const daFare = await cosaDaFareAlTelefono(venueId);
    expect(daFare.totale).toBe(0);
  });

  it("presa la prenotazione, la coda si spegne da sé", async () => {
    const id = await chiamata("MISSED");
    await apriRichiamata(venueId, { callId: id });

    const org = await db.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { orgId: true },
    });
    const ospite = await db.guest.create({
      data: { venueId, firstName: "Chi", lastName: "Chiama" },
    });
    const prenotazione = await db.booking.create({
      data: {
        venueId,
        guestId: ospite.id,
        partySize: 2,
        startsAt: new Date(Date.now() + 86_400_000),
        status: "CONFIRMED",
        source: "PHONE",
        reference: `T${Date.now().toString().slice(-6)}`,
      },
      select: { id: true, reference: true },
    });
    expect(org.orgId).toBeTruthy();

    await collegaPrenotazioneAChiamata(venueId, id, prenotazione, "sala@x.it");

    /* Le tre cose insieme, perché separate non servono: la chiamata è
       riuscita, la coda è vuota, e nel registro c'è scritto chi ha preso la
       prenotazione. Senza la seconda, la coda continuerebbe a chiedere di
       telefonare a chi ha già il tavolo. */
    const riga = await db.phoneCall.findUniqueOrThrow({
      where: { id },
      select: { outcome: true, bookingId: true, handler: true },
    });
    expect(riga.outcome).toBe("BOOKING_CREATED");
    expect(riga.bookingId).toBe(prenotazione.id);
    expect(riga.handler).toBe("HUMAN");
    expect(await cosaDaFareAlTelefono(venueId)).toMatchObject({ totale: 0 });

    await db.booking.deleteMany({ where: { venueId } });
    await db.guest.deleteMany({ where: { venueId } });
  });
});
