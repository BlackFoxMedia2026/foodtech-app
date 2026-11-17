import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Le registrazioni di «Nuova persona» salvate a metà: si salvano senza
 * controlli di merito, si aggiornano, restano del locale che le ha create.
 */

// `lib/api-auth` (per ApiError) tira dentro la sessione e `react.cache`, che fuori da Next non c'è.
vi.mock("@/lib/tenant", () => ({ resolveActiveVenue: async () => ({ state: "unauthenticated" }) }));
const { aggiornaBozza, creaBozza, eliminaBozza, getBozza, listBozze } = await import("@/server/staff-bozze");

const db = new PrismaClient();
const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const create: string[] = [];
afterAll(async () => {
  await db.staffBozza.deleteMany({ where: { id: { in: create } } });
  await db.$disconnect();
});

describe("bozze di Nuova persona", () => {
  it("si salva a metà, si aggiorna, si elimina", async () => {
    const venue = await db.venue.findFirst({ select: { id: true } });
    expect(venue).toBeTruthy();
    const venueId = venue!.id;

    const b = await creaBozza(
      venueId,
      {
        passo: "contatti",
        // Codice fiscale sbagliato e niente telefono: una bozza li tiene così.
        dati: { valori: { firstName: " Mario ", lastName: "Rossi", fiscalCode: "XXX" }, contratto: { noExpiry: false, workingDays: [1, 2], contractType: null } },
      },
      null,
    );
    create.push(b.id);
    expect(b.nome).toBe("Mario Rossi");
    expect(b.passo).toBe("contatti");

    const u = await aggiornaBozza(venueId, b.id, { passo: "residenza", dati: { valori: { firstName: "Maria", lastName: "Rossi" } } });
    expect(u.nome).toBe("Maria Rossi");
    expect(u.passo).toBe("residenza");
    expect((await listBozze(venueId)).some((x) => x.id === b.id)).toBe(true);

    // Un altro locale non la vede e non la tocca.
    expect(await getBozza("altro-locale", b.id)).toBeNull();
    await expect(aggiornaBozza("altro-locale", b.id, { passo: "ruolo", dati: { valori: {} } })).rejects.toThrow();
    await eliminaBozza("altro-locale", b.id);
    expect(await getBozza(venueId, b.id)).not.toBeNull();

    await eliminaBozza(venueId, b.id);
    expect(await getBozza(venueId, b.id)).toBeNull();
  });

  it("rifiuta dati fuori misura", async () => {
    const venue = await db.venue.findFirst({ select: { id: true } });
    await expect(creaBozza(venue!.id, { passo: "anagrafica", dati: { valori: { firstName: "x".repeat(5000) } } }, null)).rejects.toThrow();
  });
});
