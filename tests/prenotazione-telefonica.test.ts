import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { componiLicenza, testoDaFirmare, type ContenutoLicenza } from "@/lib/licenza-centralino";
import { registraPrenotazioneTelefonica } from "@/server/prenotazione-telefonica";
import { registraEventoChiamata } from "@/server/chiamate";

/**
 * La prenotazione raccolta dal risponditore che diventa una prenotazione vera.
 *
 * Le cose che contano e che qui si provano: arriva **da confermare**, si crea
 * **anche se non ci sta** (con il motivo scritto), non si duplica se il
 * centralino ritenta, e riconosce l'ospite dal numero come fa il telefono —
 * altrimenti la stessa persona sarebbe riconosciuta mentre chiama e
 * sconosciuta nella prenotazione che nasce da quella chiamata.
 */

const db = new PrismaClient();
const PREFISSO = "test-pren-tel-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const coppia = generateKeyPairSync("ed25519");
const PUBBLICA = coppia.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

let venueId = "";
let ospiteId = "";

function licenza(venue: string): string {
  const contenuto: ContenutoLicenza = { v: 1, l: venue, n: "Prova" };
  const firma = sign(null, Buffer.from(testoDaFirmare(contenuto), "utf8"), coppia.privateKey).toString(
    "base64url",
  );
  return componiLicenza(contenuto, firma);
}

/** Domani alle 20, che è dentro qualunque orario ragionevole. */
function domaniAlle20(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: {
      orgId: org.id,
      name: unico,
      slug: unico,
      timezone: "Europe/Rome",
      phoneLicenseKey: "",
      phoneLicenseActivatedAt: new Date(),
    },
  });
  venueId = v.id;
  await db.venue.update({ where: { id: venueId }, data: { phoneLicenseKey: licenza(venueId) } });

  /*
    Il locale ha degli orari, e non è un dettaglio del preparativo.

    Senza nessun turno definito, `checkAvailability` **salta** la domanda «il
    locale è aperto?» — giustamente, perché un locale che non ha dichiarato
    gli orari non si può dire chiuso. La prima versione di questi test non
    creava turni, e la prova «alle quattro del mattino non ci sta» passava
    verde senza poter diventare rossa: non c'era nessuna regola da violare.
  */
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: {
        venueId,
        name: "Cena",
        weekday,
        startMinute: 19 * 60,
        endMinute: 23 * 60,
        capacity: 12,
      },
    });
  }

  const room = await db.room.create({ data: { venueId, name: "Sala" } });
  for (const label of ["T1", "T2", "T3"]) {
    await db.table.create({ data: { venueId, roomId: room.id, label, seats: 4 } });
  }

  const g = await db.guest.create({
    data: { venueId, firstName: "Giulia", lastName: "Abituale", phone: "+39 333 7654321" },
  });
  ospiteId = g.id;
}, 60_000);

beforeEach(() => {
  process.env.CENTRALINO_CHIAVE_PUBBLICA = PUBBLICA;
});

afterEach(async () => {
  if (originale === undefined) delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
  else process.env.CENTRALINO_CHIAVE_PUBBLICA = originale;
  await db.phoneCall.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("una prenotazione dal risponditore", () => {
  it("nasce da confermare, non confermata", async () => {
    /* L'ha presa una macchina a tasti: segnarla confermata vorrebbe dire
       tenere un tavolo vuoto il sabato la prima volta che uno sbaglia un
       tasto. */
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-1",
      persone: 2,
      quando: domaniAlle20(),
      phone: "+393337654321",
    });
    const b = await db.booking.findUniqueOrThrow({ where: { id: esito.id } });
    expect(b.status).toBe("PENDING");
    expect(b.source).toBe("PHONE");
  });

  it("riconosce l'ospite dal numero, come fa il telefono", async () => {
    // scritto in una forma diversa da quella salvata, che è come succede
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-2",
      persone: 4,
      quando: domaniAlle20(),
      phone: "3337654321",
    });
    expect(esito.ospite?.id).toBe(ospiteId);
    const b = await db.booking.findUniqueOrThrow({ where: { id: esito.id } });
    expect(b.guestId).toBe(ospiteId);
  });

  it("dice nelle note che va confermata richiamando", async () => {
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-3",
      persone: 2,
      quando: domaniAlle20(),
      phone: "+393337654321",
    });
    const b = await db.booking.findUniqueOrThrow({ where: { id: esito.id } });
    expect(b.internalNotes).toContain("risponditore");
    expect(b.internalNotes).toContain("confermare");
  });

  it("la nota del chiamante finisce nelle note interne", async () => {
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-4",
      persone: 2,
      quando: domaniAlle20(),
      nota: "Ha digitato 2 alla domanda sul seggiolone",
    });
    const b = await db.booking.findUniqueOrThrow({ where: { id: esito.id } });
    expect(b.internalNotes).toContain("seggiolone");
  });
});

describe("quando non ci sta", () => {
  it("si crea comunque, col motivo scritto", async () => {
    /* Rifiutarla vorrebbe dire perdere una persona che ha già telefonato, e
       che a quel punto chiama il ristorante di fianco. */
    const dopodomaniAlle4 = new Date();
    dopodomaniAlle4.setDate(dopodomaniAlle4.getDate() + 2);
    dopodomaniAlle4.setHours(4, 0, 0, 0);

    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-5",
      persone: 2,
      quando: dopodomaniAlle4,
      phone: "+393337654321",
    });
    expect(esito.id).toBeTruthy();
    expect(esito.avvertimenti.length).toBeGreaterThan(0);

    const b = await db.booking.findUniqueOrThrow({ where: { id: esito.id } });
    expect(b.internalNotes).toContain("Da guardare");
  });

  it("un gruppo più grande di ogni tavolo non fa perdere la prenotazione", async () => {
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-6",
      persone: 40,
      quando: domaniAlle20(),
    });
    expect(esito.id).toBeTruthy();
    expect(esito.avvertimenti.length).toBeGreaterThan(0);
  });
});

describe("il centralino che ritenta", () => {
  it("due volte la stessa non fanno due prenotazioni", async () => {
    const dati = {
      idCentralino: "r-7",
      persone: 3,
      quando: domaniAlle20(),
      phone: "+393337654321",
    };
    const prima = await registraPrenotazioneTelefonica(venueId, dati);
    const seconda = await registraPrenotazioneTelefonica(venueId, dati);

    expect(seconda.id).toBe(prima.id);
    expect(prima.giaEsistente).toBe(false);
    expect(seconda.giaEsistente).toBe(true);
    expect(await db.booking.count({ where: { venueId } })).toBe(1);
  });
});

describe("il collegamento con la chiamata", () => {
  it("la chiamata da cui nasce smette di essere «nessuno ha risposto»", async () => {
    await registraEventoChiamata(venueId, {
      externalId: "c-1",
      phone: "+393337654321",
      stato: "MISSED",
    });
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-8",
      idChiamata: "c-1",
      persone: 2,
      quando: domaniAlle20(),
      phone: "+393337654321",
    });

    const chiamata = await db.phoneCall.findFirstOrThrow({ where: { venueId, externalId: "c-1" } });
    expect(chiamata.bookingId).toBe(esito.id);
  });

  it("un identificativo di chiamata che non esiste non fa perdere la prenotazione", async () => {
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: "r-9",
      idChiamata: "non-esiste",
      persone: 2,
      quando: domaniAlle20(),
    });
    expect(esito.id).toBeTruthy();
  });
});
