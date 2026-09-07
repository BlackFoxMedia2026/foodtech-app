import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createExperience,
  deleteExperience,
  listExperiences,
  setExperiencePublished,
  slugDaTitolo,
  updateExperience,
} from "@/server/experiences";

/**
 * Le esperienze.
 *
 * La pagina esisteva con un pulsante «Nuova esperienza» che non faceva
 * niente. Queste prove coprono il pezzo che mancava, e soprattutto i due modi
 * in cui una funzione così fa danni: **pubblicare per sbaglio** un evento che
 * era una bozza, e **far sparire** un evento per cui qualcuno ha già un
 * biglietto.
 */

const db = new PrismaClient();
const PREFISSO = "test-esp-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

const INIZIO = new Date("2026-10-10T19:00:00.000Z");
const FINE = new Date("2026-10-10T23:00:00.000Z");

const base = (extra: Record<string, unknown> = {}) => ({
  title: "Cena con il produttore",
  startsAt: INIZIO.toISOString(),
  endsAt: FINE.toISOString(),
  capacity: 30,
  priceCents: 6500,
  ...extra,
});

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
  altroVenueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` } })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.experience.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("l'indirizzo si ricava dal titolo", () => {
  it("toglie accenti, spazi e punteggiatura", () => {
    expect(slugDaTitolo("Cena di San Valentino!")).toBe("cena-di-san-valentino");
    expect(slugDaTitolo("  Degustazione   Barolo  ")).toBe("degustazione-barolo");
  });

  it("un titolo di soli simboli non produce un indirizzo vuoto", () => {
    expect(slugDaTitolo("!!!")).toBe("esperienza");
  });

  it("due esperienze con lo stesso titolo non si sovrascrivono", async () => {
    const a = await createExperience(venueId, base());
    const b = await createExperience(venueId, base());
    expect(a.slug).not.toBe(b.slug);
    expect(b.slug).toContain(a.slug);
  });
});

describe("creare", () => {
  it("nasce bozza, non pubblicata", async () => {
    const e = await createExperience(venueId, base());
    // Un evento pubblicato per sbaglio è visibile a chiunque: il valore di
    // partenza deve essere quello che non fa danni.
    expect(e.published).toBe(false);
  });

  it("la fine deve venire dopo l'inizio", async () => {
    await expect(
      createExperience(venueId, base({ endsAt: new Date("2026-10-10T18:00:00.000Z").toISOString() })),
    ).rejects.toThrow();
  });

  it("un titolo vuoto non passa", async () => {
    await expect(createExperience(venueId, base({ title: "   " }))).rejects.toThrow();
  });

  it("un link ai biglietti che non è un indirizzo non passa", async () => {
    await expect(createExperience(venueId, base({ ticketUrl: "vieni-in-negozio" }))).rejects.toThrow();
    const buona = await createExperience(venueId, base({ ticketUrl: "https://biglietti.example/x" }));
    expect(buona.ticketUrl).toBe("https://biglietti.example/x");
  });

  it("i posti e il prezzo restano numeri sensati", async () => {
    await expect(createExperience(venueId, base({ capacity: 0 }))).rejects.toThrow();
    await expect(createExperience(venueId, base({ priceCents: -1 }))).rejects.toThrow();
  });
});

describe("modificare e pubblicare", () => {
  it("cambiare il titolo cambia l'indirizzo, non cambiarlo lo lascia stare", async () => {
    const e = await createExperience(venueId, base());
    const stesso = await updateExperience(venueId, e.id, base({ capacity: 40 }));
    expect(stesso.slug).toBe(e.slug);
    expect(stesso.capacity).toBe(40);

    const nuovo = await updateExperience(venueId, e.id, base({ title: "Serata Champagne" }));
    expect(nuovo.slug).toBe("serata-champagne");
  });

  it("l'interruttore pubblica e riporta in bozza senza toccare il resto", async () => {
    const e = await createExperience(venueId, base({ capacity: 25 }));
    const pubblicata = await setExperiencePublished(venueId, e.id, true);
    expect(pubblicata.published).toBe(true);
    expect(pubblicata.capacity).toBe(25);

    const bozza = await setExperiencePublished(venueId, e.id, false);
    expect(bozza.published).toBe(false);
  });

  it("l'esperienza di un altro locale non si modifica da qui", async () => {
    const altrui = await createExperience(altroVenueId, base());
    await expect(updateExperience(venueId, altrui.id, base())).rejects.toThrow("not_found");
    await expect(setExperiencePublished(venueId, altrui.id, true)).rejects.toThrow("not_found");
    await expect(deleteExperience(venueId, altrui.id)).rejects.toThrow("not_found");
  });
});

describe("eliminare", () => {
  it("un'esperienza senza biglietti si elimina", async () => {
    const e = await createExperience(venueId, base());
    await expect(deleteExperience(venueId, e.id)).resolves.toEqual({ deleted: true });
    expect(await db.experience.findUnique({ where: { id: e.id } })).toBeNull();
  });

  it("con biglietti registrati non si elimina: dietro c'è qualcuno che ha pagato", async () => {
    const e = await createExperience(venueId, base());
    await db.ticket.create({
      data: { experienceId: e.id, buyerName: "Mario", buyerEmail: `${PREFISSO}m@test.local`, quantity: 2 },
    });
    await expect(deleteExperience(venueId, e.id)).rejects.toThrow("has_tickets");
    expect(await db.experience.findUnique({ where: { id: e.id } })).not.toBeNull();
  });
});

describe("i biglietti venduti", () => {
  it("si contano quelli validi, non i rimborsati né gli annullati", async () => {
    const e = await createExperience(venueId, base());
    await db.ticket.createMany({
      data: [
        { experienceId: e.id, buyerName: "A", buyerEmail: `${PREFISSO}a@test.local`, quantity: 2, status: "PAID" },
        { experienceId: e.id, buyerName: "B", buyerEmail: `${PREFISSO}b@test.local`, quantity: 1, status: "CHECKED_IN" },
        { experienceId: e.id, buyerName: "C", buyerEmail: `${PREFISSO}c@test.local`, quantity: 5, status: "REFUNDED" },
        { experienceId: e.id, buyerName: "D", buyerEmail: `${PREFISSO}d@test.local`, quantity: 3, status: "CANCELLED" },
      ],
    });

    const elenco = await listExperiences(venueId);
    expect(elenco.find((x) => x.id === e.id)?.ticketsSold).toBe(3);
  });

  it("le esperienze si leggono in ordine di data, e solo quelle del locale", async () => {
    await createExperience(altroVenueId, base({ title: "Altrui" }));
    await createExperience(venueId, base({ title: "Seconda", startsAt: "2026-11-01T19:00:00.000Z", endsAt: "2026-11-01T23:00:00.000Z" }));
    await createExperience(venueId, base({ title: "Prima" }));

    const elenco = await listExperiences(venueId);
    expect(elenco.map((x) => x.title)).toEqual(["Prima", "Seconda"]);
  });
});
