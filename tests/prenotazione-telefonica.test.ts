import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  componiLicenza,
  testoDaFirmare,
  type ContenutoLicenza,
} from "@/lib/licenza-centralino";
import {
  dividiNomeParlato,
  registraPrenotazioneTelefonica,
} from "@/server/prenotazione-telefonica";
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
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

const coppia = generateKeyPairSync("ed25519");
const PUBBLICA = coppia.publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

let venueId = "";
let ospiteId = "";

function licenza(venue: string): string {
  const contenuto: ContenutoLicenza = { v: 1, l: venue, n: "Prova" };
  const firma = sign(
    null,
    Buffer.from(testoDaFirmare(contenuto), "utf8"),
    coppia.privateKey,
  ).toString("base64url");
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
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
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
  await db.venue.update({
    where: { id: venueId },
    data: { phoneLicenseKey: licenza(venueId) },
  });

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
    await db.table.create({
      data: { venueId, roomId: room.id, label, seats: 4 },
    });
  }

  const g = await db.guest.create({
    data: {
      venueId,
      firstName: "Giulia",
      lastName: "Abituale",
      phone: "+39 333 7654321",
    },
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
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
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
    /* `VOICE` e non `PHONE`, da quando la fonte esiste: `PHONE` significa «ha
       risposto una persona che ha parlato col cliente» — e per questo si
       autoconferma. Questa l'ha raccolta una macchina, a tasti. Le due cose
       stavano sotto la stessa etichetta, e il ristoratore non poteva sapere
       quante gliene prende il risponditore. */
    expect(b.source).toBe("VOICE");
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

    const chiamata = await db.phoneCall.findFirstOrThrow({
      where: { venueId, externalId: "c-1" },
    });
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

/* ────────────────────────────────────────────────────────────────────────────
   Dare un nome a un numero che ha chiamato.

   Era il gesto che mancava: un numero non riconosciuto restava una riga nello
   storico, e in Tavolo non esisteva **nessun** modo di creare un contatto
   dall'interfaccia — la rotta c'era e nessuna schermata la chiamava.
   ──────────────────────────────────────────────────────────────────────────── */

describe("dare un nome a un numero", () => {
  it("crea il contatto e attacca la chiamata", async () => {
    const { registraEventoChiamata: registra } =
      await import("@/server/chiamate");
    const { collegaChiamataAContatto } = await import("@/server/chiamate");
    const evento = await registra(venueId, {
      externalId: "nome-1",
      phone: "+393401112233",
      stato: "MISSED",
    });

    const esito = await collegaChiamataAContatto(venueId, evento.id, {
      firstName: "Elena",
      lastName: "Nuova",
    });
    expect(esito.giaConosciuto).toBe(false);

    const chiamata = await db.phoneCall.findUniqueOrThrow({
      where: { id: evento.id },
    });
    expect(chiamata.guestId).toBe(esito.guestId);

    const g = await db.guest.findUniqueOrThrow({
      where: { id: esito.guestId },
    });
    expect(g.firstName).toBe("Elena");
    expect(g.phone).toBe("+393401112233");
  });

  it("non fa doppioni se quel numero è già di qualcuno", async () => {
    /* Passa da `trovaOCreaOspite`: se quel numero è già di una scheda — anche
       scritto in un'altra forma — si attacca a quella. Senza, chi dà un nome a
       un numero già noto creerebbe la seconda copia della stessa persona. */
    const { registraEventoChiamata: registra, collegaChiamataAContatto } =
      await import("@/server/chiamate");
    const evento = await registra(venueId, {
      externalId: "nome-2",
      phone: "333 7654321", // lo stesso di Giulia, scritto diverso
      stato: "MISSED",
    });
    const prima = await db.guest.count({ where: { venueId } });

    const esito = await collegaChiamataAContatto(venueId, evento.id, {
      firstName: "Qualcuno",
    });
    expect(esito.giaConosciuto).toBe(true);
    expect(esito.guestId).toBe(ospiteId);
    expect(await db.guest.count({ where: { venueId } })).toBe(prima);
  });

  it("attacca anche le altre chiamate dello stesso numero", async () => {
    /* Sono della stessa persona: lasciare le altre «non riconosciute»
       vorrebbe dire ridare il nome per ogni riga. */
    const { registraEventoChiamata: registra, collegaChiamataAContatto } =
      await import("@/server/chiamate");
    const a = await registra(venueId, {
      externalId: "nome-3a",
      phone: "+393405556677",
      stato: "MISSED",
    });
    const b = await registra(venueId, {
      externalId: "nome-3b",
      phone: "340 555 6677",
      stato: "MISSED",
    });

    const esito = await collegaChiamataAContatto(venueId, a.id, {
      firstName: "Paolo",
    });

    const altra = await db.phoneCall.findUniqueOrThrow({ where: { id: b.id } });
    expect(altra.guestId).toBe(esito.guestId);
  });

  it("una chiamata di un altro locale non si tocca", async () => {
    const { collegaChiamataAContatto } = await import("@/server/chiamate");
    await expect(
      collegaChiamataAContatto(venueId, "non-esiste", { firstName: "Nessuno" }),
    ).rejects.toThrow("not_found");
  });
});

describe("le telefonate sulla scheda del cliente", () => {
  it("si leggono dalla relazione, non dal numero", async () => {
    /* Se domani quella scheda cambia numero, queste restano le sue chiamate:
       sono quelle che le erano state attribuite quando sono arrivate. */
    const { registraEventoChiamata: registra, chiamateDiOspite } =
      await import("@/server/chiamate");
    await registra(venueId, {
      externalId: "sched-1",
      phone: "+393337654321",
      stato: "MISSED",
    });
    const elenco = await chiamateDiOspite(venueId, ospiteId);
    expect(elenco.length).toBeGreaterThan(0);
    expect(elenco[0]?.stato).toBe("MISSED");
  });
});

describe("il nome detto alla voce", () => {
  /**
   * Il nome arrivava fino a metà strada.
   *
   * La voce lo chiede e lo capisce, ma il ponte non lo mandava e Tavolo non lo
   * accettava: la prenotazione nasceva intestata a «Da richiamare» anche
   * quando la persona aveva detto come si chiama. Il ristoratore leggeva un
   * segnaposto e non sapeva chi aspettare.
   */
  it("si divide al primo spazio, e un nome vuoto non diventa una scheda senza nome", () => {
    expect(dividiNomeParlato("Laura")).toEqual({
      firstName: "Laura",
      lastName: null,
    });
    expect(dividiNomeParlato("  Laura   Bianchi ")).toEqual({
      firstName: "Laura",
      lastName: "Bianchi",
    });
    expect(dividiNomeParlato("Anna Maria Rossi")).toEqual({
      firstName: "Anna",
      lastName: "Maria Rossi",
    });
    expect(dividiNomeParlato("   ")).toBeNull();
    expect(dividiNomeParlato(null)).toBeNull();
  });

  it("intesta il tavolo alla persona invece che a «Da richiamare»", async () => {
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: `voce-${Date.now()}`,
      phone: "+39 333 1112223",
      persone: 4,
      quando: domaniAlle20(),
      nome: "Laura Bianchi",
    });

    const creata = await db.booking.findUnique({
      where: { id: esito.id },
      select: { guest: { select: { firstName: true, lastName: true } } },
    });
    expect(creata?.guest?.firstName).toBe("Laura");
    expect(creata?.guest?.lastName).toBe("Bianchi");
  });

  it("senza nome resta il segnaposto: il risponditore a tasti non può chiederlo", async () => {
    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: `tasti-${Date.now()}`,
      phone: "+39 333 1112224",
      persone: 2,
      quando: domaniAlle20(),
    });

    const creata = await db.booking.findUnique({
      where: { id: esito.id },
      select: { guest: { select: { firstName: true } } },
    });
    expect(creata?.guest?.firstName).toBe("Da richiamare");
  });

  it("scrive il nome sopra un segnaposto nostro, e non sopra un nome vero", async () => {
    /* Le due metà della stessa regola. Sovrascrivere «Giulia Abituale» con
       quello che una voce ha capito al telefono rovinerebbe la scheda di un
       cliente: «Bianchi» diventa «Bianche» e non si trova più. */
    const senzaNome = await db.guest.create({
      data: {
        venueId,
        firstName: "Da richiamare",
        lastName: null,
        phone: "+39 333 5550001",
      },
    });

    await registraPrenotazioneTelefonica(venueId, {
      idCentralino: `voce-sopra-${Date.now()}`,
      phone: "+39 333 5550001",
      persone: 2,
      quando: domaniAlle20(),
      nome: "Marco Verdi",
    });
    const aggiornato = await db.guest.findUnique({
      where: { id: senzaNome.id },
      select: { firstName: true, lastName: true },
    });
    expect(aggiornato).toEqual({ firstName: "Marco", lastName: "Verdi" });

    const esito = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: `voce-abituale-${Date.now()}`,
      phone: "+39 333 7654321",
      persone: 2,
      quando: domaniAlle20(),
      nome: "Giulietta Sbagliata",
    });
    const abituale = await db.guest.findUnique({
      where: { id: ospiteId },
      select: { firstName: true, lastName: true },
    });
    expect(abituale).toEqual({ firstName: "Giulia", lastName: "Abituale" });
    expect(esito.ospite?.nome).toBe("Giulia Abituale");

    await db.booking.deleteMany({ where: { guestId: senzaNome.id } });
    await db.guest.delete({ where: { id: senzaNome.id } });
  });
});
