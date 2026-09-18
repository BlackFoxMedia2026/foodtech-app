import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { numeriTelefono } from "@/server/voice/numeri";

/**
 * I numeri del telefono.
 *
 * La prova che conta è quella sull'**ora**: il consiglio che ne esce — «fra le
 * 20 e le 21 se ne perdono tre, metti qualcuno vicino all'apparecchio» —
 * manda una persona a rispondere a un telefono che non squilla se l'ora è
 * calcolata nel fuso sbagliato. E su una macchina a UTC, che è dove girano le
 * prove in CI, il fuso sbagliato è il verso naturale.
 */

const db = new PrismaClient();
const PREFISSO = "test-numeri-tel-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";
const DA = new Date("2026-09-10T00:00:00.000Z");
const A = new Date("2026-09-20T23:59:59.000Z");

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
}, 60_000);

afterEach(async () => {
  await db.phoneCall.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

/** Una chiamata scritta a mano: qui interessa **quando** e com'è finita. */
async function chiamata(opts: {
  quando: string;
  stato?: "MISSED" | "ENDED";
  esito?: string | null;
  conPrenotazione?: boolean;
}) {
  let bookingId: string | null = null;
  if (opts.conPrenotazione) {
    const ospite = await db.guest.create({
      data: { venueId, firstName: "Chi", lastName: "Prenota" },
    });
    const b = await db.booking.create({
      data: {
        venueId,
        guestId: ospite.id,
        partySize: 2,
        startsAt: new Date(opts.quando),
        status: "CONFIRMED",
        source: "PHONE",
        reference: `N${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      },
      select: { id: true },
    });
    bookingId = b.id;
  }
  return db.phoneCall.create({
    data: {
      venueId,
      externalId: `${PREFISSO}${Math.random()}`,
      fromNumber: "+393471110000",
      status: opts.stato ?? "ENDED",
      startedAt: new Date(opts.quando),
      outcome: (opts.esito ?? null) as never,
      bookingId,
    },
  });
}

describe("i numeri del telefono", () => {
  it("l'ora è quella del locale, non quella della macchina", async () => {
    /* 18:40 UTC in settembre sono **20:40 a Torino**. Se l'ora si leggesse in
       UTC, questa chiamata finirebbe nella fascia delle 18: il locale è
       chiuso, nessuno la perderebbe, e il consiglio direbbe di mettere una
       persona al telefono due ore prima che squilli. */
    await chiamata({ quando: "2026-09-15T18:40:00.000Z", stato: "MISSED" });
    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.ore.find((o) => o.ora === 20)?.perse).toBe(1);
    expect(n.ore.find((o) => o.ora === 18)?.perse).toBe(0);
  });

  it("conta risposte, perse e conversione", async () => {
    await chiamata({
      quando: "2026-09-15T18:00:00.000Z",
      conPrenotazione: true,
    });
    await chiamata({ quando: "2026-09-15T18:10:00.000Z" });
    await chiamata({ quando: "2026-09-15T18:20:00.000Z", stato: "MISSED" });
    await chiamata({ quando: "2026-09-15T18:30:00.000Z", stato: "MISSED" });

    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.totale).toBe(4);
    expect(n.risposte).toBe(2);
    expect(n.perse).toBe(2);
    expect(n.prenotazioni).toBe(1);
    expect(n.conversione).toBe(25);

    await db.booking.deleteMany({ where: { venueId } });
    await db.guest.deleteMany({ where: { venueId } });
  });

  it("dice quante chiamate nessuno ha chiuso: senza, la percentuale sembra una misura", async () => {
    await chiamata({
      quando: "2026-09-15T18:00:00.000Z",
      esito: "INFORMATION",
    });
    await chiamata({ quando: "2026-09-15T18:10:00.000Z" });
    await chiamata({ quando: "2026-09-15T18:20:00.000Z" });
    /* Una persa **non** è «senza esito»: il suo esito c'è ed è «nessuno ha
       risposto». Contarla qui gonfierebbe l'ignoto con una cosa che si sa. */
    await chiamata({
      quando: "2026-09-15T18:30:00.000Z",
      stato: "MISSED",
      esito: "MISSED",
    });

    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.senzaEsito).toBe(2);
  });

  it("gli esiti vengono dal più frequente", async () => {
    await chiamata({ quando: "2026-09-15T18:00:00.000Z", esito: "NO_ACTION" });
    await chiamata({
      quando: "2026-09-15T18:05:00.000Z",
      esito: "INFORMATION",
    });
    await chiamata({
      quando: "2026-09-15T18:10:00.000Z",
      esito: "INFORMATION",
    });

    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.esiti[0]).toEqual({ esito: "INFORMATION", quante: 2 });
    expect(n.esiti[1]).toEqual({ esito: "NO_ACTION", quante: 1 });
  });

  it("l'ora peggiore si dice solo se non è un caso", async () => {
    await chiamata({ quando: "2026-09-15T18:00:00.000Z", stato: "MISSED" });
    /* Una sola persa in un'ora non è una fascia critica: è una telefonata
       persa. Un consiglio ricavato da un caso fa perdere fiducia in tutti gli
       altri consigli. */
    expect(
      (await numeriTelefono(venueId, DA, A, "Europe/Rome")).oraPeggiore,
    ).toBeNull();

    await chiamata({ quando: "2026-09-15T18:30:00.000Z", stato: "MISSED" });
    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.oraPeggiore).toEqual({ ora: 20, perse: 2 });
  });

  it("fuori dal periodo non si conta, e un altro locale nemmeno", async () => {
    await chiamata({ quando: "2026-08-01T18:00:00.000Z", stato: "MISSED" });
    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.totale).toBe(0);
    expect(n.conversione).toBeNull();

    await chiamata({ quando: "2026-09-15T18:00:00.000Z" });
    const altro = await numeriTelefono("un-altro-locale", DA, A, "Europe/Rome");
    expect(altro.totale).toBe(0);
  });

  it("senza chiamate non inventa una percentuale", async () => {
    const n = await numeriTelefono(venueId, DA, A, "Europe/Rome");
    expect(n.totale).toBe(0);
    /* Zero su zero non è «0%»: è «non si sa». Un grande zero percento in una
       schermata di numeri si legge come un risultato. */
    expect(n.conversione).toBeNull();
    expect(n.ore).toHaveLength(24);
  });
});
