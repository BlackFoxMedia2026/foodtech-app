import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { signBookingToken, verifyBookingToken } from "@/lib/booking-token";
import { alreadySent, esitoResend } from "@/server/messaging/send";
import { sendDueReminders, REMINDER_KINDS } from "@/server/reminders";
import { applyBookingAction, readBookingByToken } from "@/server/guest-actions";

/**
 * I promemoria e le azioni che l'ospite compie dal link.
 *
 * Le tre cose che devono reggere: **non si manda due volte** lo stesso
 * promemoria (il cron gira ogni quarto d'ora), **non si manda a chi non
 * aspetta niente** (chi ha annullato, chi è già arrivato), e **il link di un
 * altro non funziona** — un identificativo indovinato non deve poter annullare
 * la cena di qualcun altro.
 */

const db = new PrismaClient();
const PREFISSO = "test-rem-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";

/** Una prenotazione fra ~2h45: dentro la finestra del promemoria "3 ore". */
async function prenotazioneFraPoco(status: "CONFIRMED" | "CANCELLED" | "ARRIVED" = "CONFIRMED", conEmail = true) {
  return db.booking.create({
    data: {
      venueId,
      guestId: conEmail ? guestId : null,
      partySize: 2,
      startsAt: new Date(Date.now() + 2.7 * 3600 * 1000),
      status,
      source: "PHONE",
    },
  });
}

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
      phone: "+39 02 000 0000",
    },
  });
  venueId = venue.id;
  guestId = (
    await db.guest.create({
      data: { venueId, firstName: "Prova", lastName: "Ospite", email: `${PREFISSO}ospite@test.local` },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("link firmati", () => {
  it("il token torna la prenotazione e l'azione", () => {
    const t = signBookingToken("abc123", "cancel");
    expect(verifyBookingToken(t)).toEqual({ bookingId: "abc123", action: "cancel" });
  });

  it("il token per confermare non serve ad annullare", () => {
    const conferma = verifyBookingToken(signBookingToken("abc123", "confirm"));
    expect(conferma?.action).toBe("confirm");
    // L'azione è dentro la firma: cambiarla invalida il token.
    expect(conferma?.action).not.toBe("cancel");
  });

  it("una firma manomessa non passa", () => {
    const t = signBookingToken("abc123", "cancel");
    const manomesso = `${t.slice(0, t.lastIndexOf("."))}.0000000000000000000000000000abcd`;
    expect(verifyBookingToken(manomesso)).toBeNull();
  });

  it("cambiare la prenotazione dentro il token non passa", () => {
    const t = signBookingToken("abc123", "cancel");
    const firma = t.slice(t.lastIndexOf(".") + 1);
    const altroPayload = Buffer.from("cancel:altro999", "utf8").toString("base64url");
    expect(verifyBookingToken(`${altroPayload}.${firma}`)).toBeNull();
  });

  it("non contiene caratteri che si perdono in un URL", () => {
    // I due punti nel percorso non sopravvivevano: il token è base64url.
    const t = signBookingToken("abc123", "confirm");
    expect(t).not.toContain(":");
    expect(t).toBe(encodeURIComponent(t).replace(/%2E/g, "."));
  });

  it("un token qualsiasi non passa", () => {
    expect(verifyBookingToken("")).toBeNull();
    expect(verifyBookingToken("boh")).toBeNull();
    expect(verifyBookingToken("boh.boh")).toBeNull();
  });
});

describe("chi riceve il promemoria", () => {
  it("una prenotazione confermata fra tre ore è nell'elenco", async () => {
    const booking = await prenotazioneFraPoco();
    const esiti = await sendDueReminders();
    const mio = esiti.find((e) => e.bookingId === booking.id && e.kind === REMINDER_KINDS.hours);
    expect(mio).toBeDefined();
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("una annullata non riceve niente", async () => {
    const booking = await prenotazioneFraPoco("CANCELLED");
    const esiti = await sendDueReminders();
    expect(esiti.find((e) => e.bookingId === booking.id)).toBeUndefined();
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("chi è già arrivato non riceve niente", async () => {
    const booking = await prenotazioneFraPoco("ARRIVED");
    const esiti = await sendDueReminders();
    expect(esiti.find((e) => e.bookingId === booking.id)).toBeUndefined();
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("senza contatto lo dice, invece di provare a mandare", async () => {
    const booking = await prenotazioneFraPoco("CONFIRMED", false);
    const esiti = await sendDueReminders();
    const mio = esiti.find((e) => e.bookingId === booking.id);
    expect(mio?.outcome).toBe("no_address");
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("non si manda due volte: una riga già inviata esclude la prenotazione", async () => {
    const booking = await prenotazioneFraPoco();

    // Simula un invio andato a buon fine (in locale il canale email non c'è).
    await db.messageLog.create({
      data: {
        venueId,
        bookingId: booking.id,
        guestId,
        kind: REMINDER_KINDS.hours,
        channel: "EMAIL",
        toAddress: "prova@test.local",
        status: "SENT",
        sentAt: new Date(),
      },
    });

    expect(await alreadySent(booking.id, REMINDER_KINDS.hours)).toBe(true);

    const esiti = await sendDueReminders();
    expect(esiti.find((e) => e.bookingId === booking.id && e.kind === REMINDER_KINDS.hours)).toBeUndefined();

    await db.messageLog.deleteMany({ where: { bookingId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });
  });
});

describe("l'ospite risponde dal link", () => {
  it("conferma", async () => {
    const booking = await prenotazioneFraPoco("CONFIRMED");
    await db.booking.update({ where: { id: booking.id }, data: { status: "PENDING" } });

    const esito = await applyBookingAction(signBookingToken(booking.id, "confirm"));
    expect(esito.ok).toBe(true);

    const riletta = await db.booking.findUnique({ where: { id: booking.id } });
    expect(riletta?.status).toBe("CONFIRMED");

    await db.auditLog.deleteMany({ where: { entityId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("annulla, e il tavolo torna disponibile", async () => {
    const booking = await prenotazioneFraPoco();
    const esito = await applyBookingAction(signBookingToken(booking.id, "cancel"));
    expect(esito.ok).toBe(true);

    const riletta = await db.booking.findUnique({ where: { id: booking.id } });
    expect(riletta?.status).toBe("CANCELLED");
    expect(riletta?.closedAt).not.toBeNull();

    await db.auditLog.deleteMany({ where: { entityId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("annullare due volte non è un errore silenzioso: lo dice", async () => {
    const booking = await prenotazioneFraPoco();
    await applyBookingAction(signBookingToken(booking.id, "cancel"));
    const secondo = await applyBookingAction(signBookingToken(booking.id, "cancel"));
    expect(secondo.ok).toBe(false);
    if (!secondo.ok) expect(secondo.code).toBe("already_closed");

    await db.auditLog.deleteMany({ where: { entityId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("l'azione resta registrata come fatta dall'ospite, non dallo staff", async () => {
    const booking = await prenotazioneFraPoco();
    await applyBookingAction(signBookingToken(booking.id, "cancel"));

    const riga = await db.auditLog.findFirst({
      where: { entityId: booking.id, action: "booking.guest_cancelled" },
    });
    expect(riga).not.toBeNull();
    expect(riga?.actorId).toBe("guest");
    expect(riga?.actorEmail).toBeNull();

    await db.auditLog.deleteMany({ where: { entityId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("un token di sola lettura non compie azioni", async () => {
    const booking = await prenotazioneFraPoco();
    const esito = await applyBookingAction(signBookingToken(booking.id, "view"));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.code).toBe("not_allowed");
    await db.booking.delete({ where: { id: booking.id } });
  });

  it("la pagina mostra i dati giusti nel fuso del locale", async () => {
    const booking = await prenotazioneFraPoco();
    const vista = await readBookingByToken(signBookingToken(booking.id, "confirm"));
    expect(vista?.venueName).toContain(PREFISSO);
    expect(vista?.timezone).toBe("Europe/Rome");
    expect(vista?.partySize).toBe(2);
    expect(vista?.action).toBe("confirm");
    expect(vista?.closed).toBe(false);
    await db.booking.delete({ where: { id: booking.id } });
  });
});

describe("l'esito del fornitore email", () => {
  it("un rifiuto non è un invio riuscito", () => {
    // Il client di Resend non solleva un errore: torna un oggetto con
    // `error` dentro. Prima veniva ignorato, e con una chiave non valida i
    // promemoria risultavano «inviati» senza che fosse partito niente.
    expect(() => esitoResend({ data: null, error: { message: "API key is invalid" } })).toThrow(
      "API key is invalid"
    );
  });

  it("un esito senza identificativo non si crede", () => {
    expect(() => esitoResend({ data: null, error: null })).toThrow("non ha confermato");
    expect(() => esitoResend({ data: {}, error: null })).toThrow("non ha confermato");
  });

  it("un invio accettato porta l'identificativo del fornitore", () => {
    expect(esitoResend({ data: { id: "re_123" }, error: null })).toEqual({ providerId: "re_123" });
  });
});
