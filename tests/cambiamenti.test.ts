import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FINESTRA_MIN, MAX_CAMBIAMENTI, ultimiCambiamenti } from "@/server/cambiamenti";

/**
 * Chi ha cambiato cosa (§65).
 *
 * La schermata del Servizio si aggiorna da sola, e il cambiamento appariva
 * senza dire chi: due persone sullo stesso servizio da due tablet vedevano un
 * tavolo assegnarsi da solo, e la seconda rifaceva il lavoro della prima.
 *
 * Le prove fissano le quattro regole che rendono la riga leggibile invece di
 * un registro: **le proprie azioni non si raccontano**, **tre tocchi sulla
 * stessa prenotazione sono un cambiamento**, **fuori dalla finestra non è più
 * adesso**, e **una frase senza soggetto resta una frase** — capita quando la
 * prenotazione è stata cancellata dopo.
 */

const db = new PrismaClient();
const PREFISSO = "test-cambia-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
let anna = "";
let io_ = "";
let tavolo = "";
const ORA = new Date("2026-09-10T20:00:00+02:00");

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}`, timezone: "Europe/Rome" },
    })
  ).id;
  anna = (
    await db.user.create({ data: { email: `${PREFISSO}anna${Date.now()}@test.local`, name: "Anna Conti" } })
  ).id;
  io_ = (await db.user.create({ data: { email: `${PREFISSO}io${Date.now()}@test.local`, name: "Luca Moncalvo" } })).id;
  tavolo = (await db.table.create({ data: { venueId, label: "T10", seats: 4 } })).id;
}, 60_000);

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.auditLog.deleteMany({ where: { orgId } });
  await db.order.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

async function prenotazione(nome: string, opts: { conTavolo?: boolean; venue?: string } = {}) {
  const v = opts.venue ?? venueId;
  const g = await db.guest.create({ data: { venueId: v, firstName: nome, lastName: "Bianchi" } });
  return db.booking.create({
    data: {
      venueId: v,
      guestId: g.id,
      tableId: opts.conTavolo ? tavolo : null,
      partySize: 2,
      startsAt: ORA,
      status: "CONFIRMED",
      source: "PHONE",
    },
  });
}

async function registra(
  action: string,
  entityType: string,
  entityId: string | null,
  opts: { chi?: string; minutiFa?: number; venue?: string } = {},
) {
  return db.auditLog.create({
    data: {
      orgId,
      venueId: opts.venue ?? venueId,
      actorId: opts.chi ?? anna,
      actorEmail: null,
      action,
      entityType,
      entityId,
      createdAt: new Date(ORA.getTime() - (opts.minutiFa ?? 1) * 60_000),
    },
  });
}

describe("la frase", () => {
  it("dice il nome di battesimo, cosa ha fatto e a chi, col tavolo fra parentesi", async () => {
    const b = await prenotazione("Marta", { conTavolo: true });
    await registra("booking.assign_table", "booking", b.id);

    const [c] = await ultimiCambiamenti(venueId, { now: ORA });
    expect(c.chi).toBe("Anna");
    expect(c.cosa).toBe("ha assegnato un tavolo a Marta Bianchi (T10)");
  });

  it("il conto porta all'ospite passando dalla prenotazione", async () => {
    const b = await prenotazione("Marta", { conTavolo: true });
    const o = await db.order.create({
      data: {
        venueId,
        bookingId: b.id,
        reference: `${PREFISSO}${Date.now()}`,
        status: "RECEIVED",
        scheduledAt: ORA,
      },
    });
    await registra("order.close", "order", o.id);

    const [c] = await ultimiCambiamenti(venueId, { now: ORA });
    expect(c.cosa).toBe("ha chiuso il conto di Marta Bianchi (T10)");
  });

  it("senza soggetto la frase non ha un buco dentro", async () => {
    // La prenotazione è stata cancellata dopo il cambiamento: l'identificativo
    // nel registro non porta più a niente.
    await registra("booking.cancel", "booking", "id-che-non-esiste-piu");

    const [c] = await ultimiCambiamenti(venueId, { now: ORA });
    expect(c.cosa).toBe("ha disdetto una prenotazione");
  });

  it("chi aspetta si chiama col nome scritto in lista", async () => {
    const e = await db.waitlistEntry.create({
      data: { venueId, guestName: "Famiglia Neri", partySize: 4, status: "WAITING", position: 1 },
    });
    await registra("waitlist.seat", "waitlist_entry", e.id);

    const [c] = await ultimiCambiamenti(venueId, { now: ORA });
    expect(c.cosa).toBe("ha accomodato Famiglia Neri dalla lista");
    await db.waitlistEntry.delete({ where: { id: e.id } });
  });
});

describe("cosa non si racconta", () => {
  it("le proprie azioni: chi le ha fatte le ha viste succedere", async () => {
    const b = await prenotazione("Marta");
    await registra("booking.assign_table", "booking", b.id, { chi: io_ });

    expect(await ultimiCambiamenti(venueId, { now: ORA, escludiUtente: io_ })).toHaveLength(0);
    // Senza esclusione invece si vede: è la stessa lettura.
    expect(await ultimiCambiamenti(venueId, { now: ORA })).toHaveLength(1);
  });

  it("le azioni che non riguardano il servizio in corso", async () => {
    await registra("menu.item_update", "menu_item", "qualcosa");
    await registra("coupon.create", "coupon", "qualcosa");
    expect(await ultimiCambiamenti(venueId, { now: ORA })).toHaveLength(0);
  });

  it("quello che è successo troppo tempo fa", async () => {
    const b = await prenotazione("Marta");
    await registra("booking.assign_table", "booking", b.id, { minutiFa: FINESTRA_MIN + 5 });
    expect(await ultimiCambiamenti(venueId, { now: ORA })).toHaveLength(0);
  });

  it("quello che è successo in un altro locale", async () => {
    const b = await prenotazione("Altrui", { venue: altroVenueId });
    await registra("booking.assign_table", "booking", b.id, { venue: altroVenueId });
    expect(await ultimiCambiamenti(venueId, { now: ORA })).toHaveLength(0);
  });
});

describe("quante righe", () => {
  it("tre tocchi sulla stessa prenotazione sono un cambiamento, il più recente", async () => {
    const b = await prenotazione("Marta", { conTavolo: true });
    await registra("booking.update", "booking", b.id, { minutiFa: 3 });
    await registra("booking.assign_table", "booking", b.id, { minutiFa: 2 });
    await registra("booking.update", "booking", b.id, { minutiFa: 1 });

    const righe = await ultimiCambiamenti(venueId, { now: ORA });
    expect(righe).toHaveLength(1);
    expect(righe[0].cosa).toBe("ha aggiornato Marta Bianchi (T10)");
  });

  it("non più di quante se ne leggono in una riga", async () => {
    for (let i = 0; i < MAX_CAMBIAMENTI + 3; i++) {
      const b = await prenotazione(`Ospite${i}`);
      await registra("booking.assign_table", "booking", b.id, { minutiFa: i + 1 });
    }
    const righe = await ultimiCambiamenti(venueId, { now: ORA });
    expect(righe).toHaveLength(MAX_CAMBIAMENTI);
    // E sono le più recenti.
    expect(righe[0].cosa).toContain("Ospite0");
  });
});
