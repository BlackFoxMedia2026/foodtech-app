import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { annullaAzione, avviaAzione } from "@/lib/prenotazioni-nuove";
import { createBooking, updateBooking } from "@/server/bookings";
import { GiaGestitaError, gestisciNuova, prenotazioniNuove } from "@/server/prenotazioni-nuove";

/**
 * Le «Nuove» della Panoramica, sul database: conferma, rifiuto, «segna come
 * vista» e annulla.
 *
 * Quello che queste prove tengono fermo è che ogni gesto **segna la
 * prenotazione come gestita** (`seenAt`), e che vale solo su ciò che il
 * riquadro mostrava: se un collega è arrivato prima, la risposta è «già
 * gestita», non un secondo cambio di stato sopra il suo.
 */

const db = new PrismaClient();
const PREFISSO = "test-nuove-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const ATTORE = { userId: "u-prova", email: null, orgId: "", venueId: "" };

let venueId = "";
let guestId = "";
/** Domani alle 20:00: dentro il turno di cena, e dentro le «nuove». */
let quando = new Date();

async function pulisci() {
  await db.auditLog.deleteMany({ where: { Organization: { name: { startsWith: PREFISSO } } } });
  await db.booking.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.guest.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.shift.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

beforeEach(async () => {
  await pulisci();
  const unico = `${PREFISSO}${Date.now()}-${Math.random()}`;
  const orgId = (await db.organization.create({ data: { name: `${PREFISSO}org`, slug: unico } })).id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}locale`, slug: `v-${unico}`, active: true, timezone: "Europe/Rome" },
    })
  ).id;
  guestId = (
    await db.guest.create({ data: { venueId, firstName: "Francesca", lastName: "Rinaldi", phone: "3331112222" } })
  ).id;
  ATTORE.orgId = orgId;
  ATTORE.venueId = venueId;

  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: { venueId, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 20 },
    });
  }

  const domani = new Date();
  domani.setDate(domani.getDate() + 1);
  domani.setHours(20, 0, 0, 0);
  quando = domani;
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

/** Una richiesta dal widget pubblico: nasce in attesa. */
async function richiesta() {
  return createBooking(venueId, { guestId, partySize: 4, startsAt: quando.toISOString(), source: "WIDGET" });
}

/** Una prenotazione presa al telefono da chi è in sala: nasce confermata. */
async function alTelefono() {
  return createBooking(venueId, { guestId, partySize: 2, startsAt: quando.toISOString(), source: "PHONE" });
}

async function idNuove() {
  return (await prenotazioniNuove(venueId)).map((p) => p.id);
}

describe("chi arriva fra le nuove", () => {
  it("una richiesta dal sito sì; una scritta dallo staff no — chi l'ha scritta l'ha vista", async () => {
    const dalSito = await richiesta();
    const scritta = await alTelefono();

    expect(dalSito.status).toBe("PENDING");
    expect(scritta.seenAt).toBeInstanceOf(Date);
    expect(await idNuove()).toEqual([dalSito.id]);
  });

  it("confermata da un collega altrove: resta fra le nuove come «già confermata»", async () => {
    const b = await richiesta();
    // L'elenco delle prenotazioni conferma senza passare dalla Panoramica.
    await updateBooking(venueId, b.id, { status: "CONFIRMED" }, { actor: ATTORE });

    const [nuova] = await prenotazioniNuove(venueId);
    expect(nuova?.id).toBe(b.id);
    expect(nuova?.status).toBe("CONFIRMED");
    expect(nuova?.seenAt).toBeNull();
  });
});

describe("conferma", () => {
  it("la prenotazione diventa confermata, gestita, ed esce dalle nuove", async () => {
    const b = await richiesta();
    await gestisciNuova(venueId, b.id, "conferma", ATTORE);

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("CONFIRMED");
    expect(dopo.seenAt).toBeInstanceOf(Date);
    expect(await idNuove()).toEqual([]);
    expect(await db.auditLog.count({ where: { action: "booking.update", entityId: b.id } })).toBe(1);
  });

  it("se un collega l'ha già gestita, non si conferma due volte", async () => {
    const b = await richiesta();
    await gestisciNuova(venueId, b.id, "rifiuta", ATTORE);
    await expect(gestisciNuova(venueId, b.id, "conferma", ATTORE)).rejects.toBeInstanceOf(GiaGestitaError);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CANCELLED");
  });

  it("non si conferma la prenotazione di un altro locale", async () => {
    const b = await richiesta();
    const unico = `${PREFISSO}altro-${Date.now()}`;
    const org2 = await db.organization.create({ data: { name: `${PREFISSO}org2`, slug: unico } });
    const v2 = await db.venue.create({
      data: { orgId: org2.id, name: `${PREFISSO}altro`, slug: `v-${unico}`, timezone: "Europe/Rome" },
    });

    await expect(gestisciNuova(v2.id, b.id, "conferma", ATTORE)).rejects.toThrow("not_found");
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PENDING");
  });
});

describe("rifiuto", () => {
  it("la prenotazione diventa annullata, registrata come annullamento, ed esce dalle nuove", async () => {
    const b = await richiesta();
    await gestisciNuova(venueId, b.id, "rifiuta", ATTORE);

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("CANCELLED");
    expect(dopo.seenAt).toBeInstanceOf(Date);
    expect(await idNuove()).toEqual([]);
    expect(await db.auditLog.count({ where: { action: "booking.cancel", entityId: b.id } })).toBe(1);
  });

  it("una prenotazione già confermata non si rifiuta da qui", async () => {
    const b = await richiesta();
    await updateBooking(venueId, b.id, { status: "CONFIRMED" }, { actor: ATTORE });
    await expect(gestisciNuova(venueId, b.id, "rifiuta", ATTORE)).rejects.toBeInstanceOf(GiaGestitaError);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CONFIRMED");
  });
});

describe("segna come vista", () => {
  it("la confermata da un collega esce dalle nuove, e lo stato non cambia", async () => {
    const b = await richiesta();
    await updateBooking(venueId, b.id, { status: "CONFIRMED" }, { actor: ATTORE });

    await gestisciNuova(venueId, b.id, "vista", ATTORE);

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("CONFIRMED");
    expect(dopo.seenAt).toBeInstanceOf(Date);
    expect(await idNuove()).toEqual([]);
    expect(await db.auditLog.count({ where: { action: "booking.seen", entityId: b.id } })).toBe(1);
  });

  it("due clic sull'occhio non riscrivono l'istante né il registro", async () => {
    const b = await richiesta();
    await updateBooking(venueId, b.id, { status: "CONFIRMED" }, { actor: ATTORE });
    await gestisciNuova(venueId, b.id, "vista", ATTORE);
    const prima = (await db.booking.findUniqueOrThrow({ where: { id: b.id } })).seenAt;

    await gestisciNuova(venueId, b.id, "vista", ATTORE);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).seenAt).toEqual(prima);
    expect(await db.auditLog.count({ where: { action: "booking.seen", entityId: b.id } })).toBe(1);
  });

  it("una richiesta in attesa non si «vede»: va confermata o rifiutata", async () => {
    const b = await richiesta();
    await expect(gestisciNuova(venueId, b.id, "vista", ATTORE)).rejects.toBeInstanceOf(GiaGestitaError);
    expect(await idNuove()).toEqual([b.id]);
  });
});

describe("annulla", () => {
  it("annullato entro il tempo, il gesto non arriva al database: la prenotazione resta com'era", async () => {
    const b = await richiesta();

    // Il percorso del riquadro: il gesto entra in sospeso, «Annulla» lo toglie.
    const { inSospeso } = avviaAzione(null, { id: b.id, nome: "Francesca Rinaldi", azione: "conferma" }, Date.now());
    const annullato = annullaAzione(inSospeso, b.id);
    expect(annullato.ripristina).toBe(b.id);
    expect(annullato.inSospeso).toBeNull();

    const dopo = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(dopo.status).toBe("PENDING");
    expect(dopo.seenAt).toBeNull();
    expect(dopo.updatedAt).toEqual(b.updatedAt);
    expect(await idNuove()).toEqual([b.id]);
    expect(await db.auditLog.count({ where: { entityId: b.id, action: { not: "booking.create" } } })).toBe(0);
  });
});
