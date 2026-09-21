import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { disdiciDalTelefono, prenotazioneDaDisdire } from "@/server/voice/disdetta-telefono";

/**
 * Disdire al telefono.
 *
 * È la telefonata che vale più di tutte: chi prova a disdire e non riesce
 * **diventa un no-show**, il tavolo resta bloccato, e il locale dà la colpa al
 * cliente che invece aveva chiamato.
 *
 * Quello che questi test difendono è soprattutto quel che **non** deve
 * succedere:
 *
 * - disdire la cena di uno sconosciuto conoscendo un identificativo;
 * - rifiutare come «numero diverso» chi disdice la propria, perché in famiglia
 *   il numero è uno e le schede sono due;
 * - liberare in Tavolo un tavolo dove la gente è appena entrata;
 * - due disdette per la stessa prenotazione, cioè due messaggi al cliente;
 * - dire il motivo sbagliato, che al telefono è una frase sbagliata.
 */

const db = new PrismaClient();
const PREFISSO = "test-disdetta-";

// Questi test scrivono e cancellano: non devono poter girare su un database vero.
const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/* Numeri inventati, e devono restarlo: nessun numero vero entra nel codice.
   Salvati in una forma e ricevuti in un'altra, perché è così che succede. */
const IN_SCHEDA = "333 1110001"; // come lo scrive l'operatore
const CHIAMA = "+393331110001"; // come arriva dal centralino
const ALTRO = "+393339990009";

// Orologio fisso: «oggi» dentro un test lo fa passare a maggio e cadere a ottobre.
const ADESSO = new Date("2026-09-21T18:00:00.000Z");
const DOMANI = new Date("2026-09-22T19:30:00.000Z");
const DOPODOMANI = new Date("2026-09-23T19:30:00.000Z");
const IERI = new Date("2026-09-20T19:30:00.000Z");

let orgId = "";
let venueId = "";
let mario = "";
let moglie = "";
let estraneo = "";

async function prenota(
  guestId: string,
  quando: Date,
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "ARRIVED" = "CONFIRMED",
  persone = 2,
) {
  return db.booking.create({
    data: { venueId, guestId, partySize: persone, startsAt: quando, status },
    select: { id: true },
  });
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  orgId = (await db.organization.create({ data: { name: unico, slug: unico } })).id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: "Locale di prova", slug: unico, active: true, timezone: "Europe/Rome" },
    })
  ).id;

  mario = (
    await db.guest.create({
      data: { venueId, firstName: "Mario", lastName: "Di Prova", phone: IN_SCHEDA },
    })
  ).id;
  /* La seconda scheda con **lo stesso numero**: è il caso della famiglia, non
     un dato sporco. `lastVisitAt` più vecchia, così non è quella scelta. */
  moglie = (
    await db.guest.create({
      data: {
        venueId,
        firstName: "Anna",
        lastName: "Di Prova",
        phone: CHIAMA,
        lastVisitAt: new Date("2026-01-01T12:00:00.000Z"),
      },
    })
  ).id;
  estraneo = (
    await db.guest.create({
      data: { venueId, firstName: "Estraneo", lastName: "Di Prova", phone: ALTRO },
    })
  ).id;
});

afterEach(async () => {
  await db.notification.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

describe("trovare la prenotazione di chi chiama", () => {
  it("la trova anche se il numero è scritto in un'altra forma", async () => {
    const p = await prenota(mario, DOMANI, "CONFIRMED", 4);
    const trovata = await prenotazioneDaDisdire(venueId, CHIAMA, ADESSO);
    expect(trovata?.id).toBe(p.id);
    expect(trovata?.persone).toBe(4);
    // Il nome serve alla voce per farlo ripetere prima di disdire.
    expect(trovata?.nome).toBe("Mario Di Prova");
  });

  it("prende la più vicina, non una qualunque", async () => {
    const vicina = await prenota(mario, DOMANI);
    await prenota(mario, DOPODOMANI);
    expect((await prenotazioneDaDisdire(venueId, CHIAMA, ADESSO))?.id).toBe(vicina.id);
  });

  it("trova anche quella intestata all'altra scheda con lo stesso numero", async () => {
    /* In famiglia il numero è uno. Se qui si guardasse solo la scheda scelta,
       chi chiama per disdire la cena prenotata a nome della moglie si
       sentirebbe dire che non risulta nessuna prenotazione. */
    const p = await prenota(moglie, DOMANI);
    expect((await prenotazioneDaDisdire(venueId, CHIAMA, ADESSO))?.id).toBe(p.id);
  });

  it("non offre di disdire una cena già passata", async () => {
    await prenota(mario, IERI);
    expect(await prenotazioneDaDisdire(venueId, CHIAMA, ADESSO)).toBeNull();
  });

  it("non offre di disdire a chi è già seduto", async () => {
    /* «Arrivato» non sta disdicendo: offrirgli di disdire vorrebbe dire
       liberare in Tavolo un tavolo occupato. */
    await prenota(mario, DOMANI, "ARRIVED");
    expect(await prenotazioneDaDisdire(venueId, CHIAMA, ADESSO)).toBeNull();
  });

  it("non offre niente a un numero nascosto", async () => {
    expect(await prenotazioneDaDisdire(venueId, null, ADESSO)).toBeNull();
    expect(await prenotazioneDaDisdire(venueId, "", ADESSO)).toBeNull();
    // Un troncone di tre cifre non identifica nessuno.
    expect(await prenotazioneDaDisdire(venueId, "412", ADESSO)).toBeNull();
  });
});

describe("disdire", () => {
  it("disdice, e lo scrive nel registro dicendo che è dal telefono", async () => {
    const p = await prenota(mario, DOMANI, "CONFIRMED", 3);
    const esito = await disdiciDalTelefono(
      venueId,
      { bookingId: p.id, telefono: CHIAMA },
      { adesso: ADESSO },
    );

    expect(esito).toMatchObject({ ok: true, persone: 3 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CANCELLED");

    /* Nel registro ci deve essere, e deve dire da dove viene: senza un attore
       `recordAudit` non scrive niente e non lo dice a nessuno — una disdetta
       invisibile proprio dove si va a cercarla. */
    const riga = await db.auditLog.findFirst({
      where: { action: "booking.cancel", entityId: p.id },
      orderBy: { createdAt: "desc" },
    });
    expect((riga?.diff as { da?: string } | null)?.da).toBe("telefono");
    expect(riga?.actorId).toBe("centralino");

    /* E la sala lo deve vedere: un tavolo disdetto che nessuno annuncia resta
       apparecchiato tutta la sera. */
    const avviso = await db.notification.findFirst({
      where: { venueId, kind: "BOOKING_CANCELLED" },
      orderBy: { createdAt: "desc" },
    });
    expect(avviso?.title).toContain("Mario Di Prova");
    expect(avviso?.title).toContain("3 coperti");
  });

  it("non disdice la prenotazione di un altro", async () => {
    const sua = await prenota(estraneo, DOMANI);
    const esito = await disdiciDalTelefono(
      venueId,
      { bookingId: sua.id, telefono: CHIAMA },
      { adesso: ADESSO },
    );

    expect(esito).toEqual({ ok: false, perche: "numero_diverso" });
    // E soprattutto: la cena dell'altro è ancora in piedi.
    expect((await db.booking.findUniqueOrThrow({ where: { id: sua.id } })).status).toBe("CONFIRMED");
  });

  it("non disdice niente a chi chiama da nascosto", async () => {
    const p = await prenota(mario, DOMANI);
    expect(
      await disdiciDalTelefono(venueId, { bookingId: p.id, telefono: null }, { adesso: ADESSO }),
    ).toEqual({ ok: false, perche: "numero_diverso" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CONFIRMED");
  });

  it("non tocca la prenotazione di un altro locale", async () => {
    const unico = `${PREFISSO}altro-${Date.now()}`;
    const org2 = await db.organization.create({ data: { name: unico, slug: unico } });
    const v2 = await db.venue.create({
      data: { orgId: org2.id, name: "Altro", slug: unico, active: true, timezone: "Europe/Rome" },
    });
    const g2 = await db.guest.create({
      data: { venueId: v2.id, firstName: "Mario", phone: IN_SCHEDA },
    });
    const p = await db.booking.create({
      data: { venueId: v2.id, guestId: g2.id, partySize: 2, startsAt: DOMANI, status: "CONFIRMED" },
    });

    const esito = await disdiciDalTelefono(
      venueId,
      { bookingId: p.id, telefono: CHIAMA },
      { adesso: ADESSO },
    );
    expect(esito).toEqual({ ok: false, perche: "non_trovata" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CONFIRMED");

    await db.booking.deleteMany({ where: { venueId: v2.id } });
    await db.guest.deleteMany({ where: { venueId: v2.id } });
    await db.venue.delete({ where: { id: v2.id } });
    await db.organization.delete({ where: { id: org2.id } });
  });

  it("due telefonate insieme disdicono una volta sola", async () => {
    /* Il vincolo sta nella scrittura, non in un controllo prima: due `if (si
       può)` non si vedono a vicenda e manderebbero due messaggi al cliente. */
    const p = await prenota(mario, DOMANI);
    const [a, b] = await Promise.all([
      disdiciDalTelefono(venueId, { bookingId: p.id, telefono: CHIAMA }, { adesso: ADESSO }),
      disdiciDalTelefono(venueId, { bookingId: p.id, telefono: CHIAMA }, { adesso: ADESSO }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const fallita = a.ok ? b : a;
    expect(fallita).toEqual({ ok: false, perche: "gia_disdetta" });
  });

  it("dice «è in sala», non «era già disdetta»", async () => {
    /* Il motivo giusto è tutto: al telefono «l'hanno già disdetta» manda il
       cliente a credere di non avere più il tavolo, quando invece qualcuno dei
       suoi è appena entrato. */
    const p = await prenota(mario, DOMANI, "ARRIVED");
    expect(
      await disdiciDalTelefono(venueId, { bookingId: p.id, telefono: CHIAMA }, { adesso: ADESSO }),
    ).toEqual({ ok: false, perche: "gia_in_sala" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ARRIVED");
  });

  it("non disdice una cena di ieri", async () => {
    const p = await prenota(mario, IERI);
    expect(
      await disdiciDalTelefono(venueId, { bookingId: p.id, telefono: CHIAMA }, { adesso: ADESSO }),
    ).toEqual({ ok: false, perche: "gia_passata" });
  });

  it("su una già disdetta risponde «già disdetta» e non riscrive niente", async () => {
    const p = await prenota(mario, DOMANI, "CANCELLED");
    expect(
      await disdiciDalTelefono(venueId, { bookingId: p.id, telefono: CHIAMA }, { adesso: ADESSO }),
    ).toEqual({ ok: false, perche: "gia_disdetta" });
  });
});
