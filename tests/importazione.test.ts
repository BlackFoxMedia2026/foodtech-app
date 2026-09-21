import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { anteprimaImportazione, chiaveRiga, eseguiImportazione } from "@/server/importazione";

/**
 * Portare dentro i clienti di un altro gestionale.
 *
 * È la porta d'ingresso del prodotto: Quandoo spegne tutto il 31 dicembre 2026
 * e lascia seimila ristoranti italiani senza sistema. Chi cambia gestionale non
 * porta via le prenotazioni di domani — porta via **l'elenco dei clienti**, che
 * è l'unica cosa che non si ricompra.
 *
 * Quello che questi test difendono:
 *
 * - **l'anteprima non scrive niente.** Un'importazione che parte dal
 *   caricamento del file è un errore che non si annulla;
 * - **due volte lo stesso file non raddoppia niente.** Il vincolo sta nel
 *   database, non in un controllo prima della scrittura;
 * - **l'ora è quella del locale.** Una cena delle 20:30 importata col fuso del
 *   server compare alle 18:30 in agenda, per duemila righe;
 * - **il passato resta passato.** Mettere tutto «confermato» riempirebbe
 *   l'agenda di stasera con dieci anni di storia;
 * - **nessun consenso al marketing si eredita da un file.**
 */

const db = new PrismaClient();
const PREFISSO = "test-import-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";

/* Numeri e indirizzi inventati, e devono restarlo. */
const FILE = [
  "Nome;Cognome;Telefono;Email;Data;Ora;PAX;Note;Tavolo",
  "Mario;Rossi;333 111 2233;;25/12/2026;20:30;4;Niente pesce;12",
  "Giulia;Bianchi;;giulia@prova.test;10/01/2020;21:00;2;;",
  "Luca;Verdi;3339998877;;;;;;",
].join("\n");

async function pulisci() {
  await db.auditLog.deleteMany({ where: { Organization: { name: { startsWith: PREFISSO } } } });
  await db.booking.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.guest.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

beforeEach(async () => {
  await pulisci();
  const unico = `${PREFISSO}${Date.now()}-${Math.random()}`;
  orgId = (await db.organization.create({ data: { name: `${PREFISSO}org`, slug: unico } })).id;
  venueId = (
    await db.venue.create({
      data: {
        orgId,
        name: `${PREFISSO}locale`,
        slug: `v-${unico}`,
        active: true,
        timezone: "Europe/Rome",
      },
    })
  ).id;
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

describe("l'anteprima", () => {
  it("dice cosa succederebbe e **non scrive niente**", async () => {
    const a = await anteprimaImportazione(venueId, FILE);

    expect(a.conteggi).toMatchObject({
      righeFile: 3,
      leggibili: 3,
      scartate: 0,
      /* Chi non ha una data e un cliente, non una prenotazione. */
      soloClienti: 1,
      prenotazioniPassate: 1,
      prenotazioniFuture: 1,
      ospitiNuovi: 3,
      ospitiGiaVisti: 0,
      giaImportate: 0,
    });

    /* Il controllo che conta: nel database non e entrato niente. */
    expect(await db.guest.count({ where: { venueId } })).toBe(0);
    expect(await db.booking.count({ where: { venueId } })).toBe(0);
  });

  it("mostra le date **nell'ora del locale**: è l'unico modo per accorgersi di un errore", async () => {
    const a = await anteprimaImportazione(venueId, FILE);
    /* Se qui comparisse «25/12/2026, 19:30» vorrebbe dire che stiamo leggendo
       col fuso sbagliato, e chi guarda l'anteprima potrebbe fermarsi prima di
       importare duemila righe. */
    expect(a.esempi[0]!.quando).toContain("25/12/2026");
    expect(a.esempi[0]!.quando).toContain("20:30");
  });

  it("dice quali colonne ha capito e quali no", async () => {
    const a = await anteprimaImportazione(venueId, FILE);
    expect(a.colonne.riconosciute).toContain("telefono");
    expect(a.colonne.ignorate).toEqual(["Tavolo"]);
  });

  it("riconosce chi è già in rubrica, invece di annunciare un doppione", async () => {
    await db.guest.create({
      data: { venueId, firstName: "Mario", lastName: "Rossi", phone: "+393331112233" },
    });

    const a = await anteprimaImportazione(venueId, FILE);
    expect(a.conteggi.ospitiGiaVisti).toBe(1);
    expect(a.conteggi.ospitiNuovi).toBe(2);
    expect(a.esempi[0]!.giaVisto).toBe(true);
  });
});

describe("l'importazione", () => {
  it("crea gli ospiti e le prenotazioni, con la fonte «importata»", async () => {
    const esito = await eseguiImportazione(venueId, FILE);

    expect(esito.creati).toEqual({ ospiti: 3, prenotazioni: 2 });

    const ospiti = await db.guest.findMany({ where: { venueId }, orderBy: { firstName: "asc" } });
    expect(ospiti.map((g) => g.firstName)).toEqual(["Giulia", "Luca", "Mario"]);

    const prenotazioni = await db.booking.findMany({ where: { venueId }, orderBy: { startsAt: "asc" } });
    expect(prenotazioni).toHaveLength(2);
    expect(prenotazioni.every((b) => b.source === "IMPORT")).toBe(true);
    expect(prenotazioni.every((b) => !!b.idempotencyKey)).toBe(true);
  });

  it("il passato resta passato, il futuro è da rispettare", async () => {
    /* Mettere tutto «confermato» riempirebbe l'agenda di stasera con dieci
       anni di storia; mettere tutto «completato» cancellerebbe le prenotazioni
       vere di venerdi. */
    await eseguiImportazione(venueId, FILE);
    const prenotazioni = await db.booking.findMany({ where: { venueId }, orderBy: { startsAt: "asc" } });

    expect(prenotazioni[0]!.status).toBe("COMPLETED");
    expect(prenotazioni[0]!.closedAt).not.toBeNull();
    expect(prenotazioni[1]!.status).toBe("CONFIRMED");
  });

  it("l'ora è quella del locale, non quella del server", async () => {
    await eseguiImportazione(venueId, FILE);
    const futura = await db.booking.findFirstOrThrow({
      where: { venueId, status: "CONFIRMED" },
    });
    /* 25 dicembre, ora solare: le 20:30 a Roma sono le 19:30 in tempo
       universale. D'estate sarebbero le 18:30 — ed e proprio il difetto che
       una formula fissa non prenderebbe mai. */
    expect(futura.startsAt.toISOString()).toBe("2026-12-25T19:30:00.000Z");
  });

  it("chi era già in rubrica non diventa un doppione, e si arricchisce", async () => {
    const esistente = await db.guest.create({
      data: { venueId, firstName: "Mario", phone: "+393331112233" },
    });

    await eseguiImportazione(venueId, FILE);

    expect(await db.guest.count({ where: { venueId } })).toBe(3);
    const mario = await db.guest.findUniqueOrThrow({ where: { id: esistente.id } });
    /* Il cognome mancava e il file lo aveva: si riempie quello che era vuoto,
       senza sovrascrivere quello che c'era. */
    expect(mario.lastName).toBe("Rossi");
  });

  it("**due volte lo stesso file non raddoppia niente**", async () => {
    const primo = await eseguiImportazione(venueId, FILE);
    const secondo = await eseguiImportazione(venueId, FILE);

    expect(primo.creati).toEqual({ ospiti: 3, prenotazioni: 2 });
    /* La seconda volta: nessun ospite nuovo (li riconosce) e nessuna
       prenotazione nuova (la chiave e nel database). */
    expect(secondo.creati).toEqual({ ospiti: 0, prenotazioni: 0 });
    expect(secondo.conteggi.giaImportate).toBe(2);

    expect(await db.guest.count({ where: { venueId } })).toBe(3);
    expect(await db.booking.count({ where: { venueId } })).toBe(2);
  });

  it("nessun consenso al marketing arriva da un file", async () => {
    /* Un consenso e una prova che una persona ha dato a qualcun altro: non si
       eredita con un CSV, nemmeno se il file ha una colonna che dice si. */
    await eseguiImportazione(
      venueId,
      "Nome;Telefono;Consenso marketing\nMario;3331112233;SI",
    );
    const ospiti = await db.guest.findMany({ where: { venueId } });
    expect(ospiti.every((g) => g.marketingOptIn === false)).toBe(true);
  });

  it("i contatori dell'ospite si rifanno: le visite importate contano", async () => {
    /* Sono i numeri su cui il locale decide come trattare un cliente: un
       cliente con dieci cene importate non deve risultare nuovo. */
    await eseguiImportazione(venueId, FILE);
    const giulia = await db.guest.findFirstOrThrow({ where: { venueId, firstName: "Giulia" } });
    expect(giulia.totalVisits).toBe(1);
    expect(giulia.lastVisitAt).not.toBeNull();
  });

  it("lascia una riga nel registro con i numeri e le colonne ignorate", async () => {
    const attore = { userId: "u-prova", email: null, orgId, venueId };
    await eseguiImportazione(venueId, FILE, { actor: attore });

    const riga = await db.auditLog.findFirstOrThrow({
      where: { action: "venue.import", venueId },
    });
    const diff = riga.diff as { ospitiCreati?: number; colonneIgnorate?: string[] };
    expect(diff.ospitiCreati).toBe(3);
    /* Il giorno in cui qualcuno chiede «e le allergie?», la risposta e gia
       scritta. */
    expect(diff.colonneIgnorate).toEqual(["Tavolo"]);
  });

  it("un file illeggibile non scrive niente e lo dice", async () => {
    const esito = await eseguiImportazione(venueId, "questo non e un csv");
    expect(esito.creati).toEqual({ ospiti: 0, prenotazioni: 0 });
    expect(await db.guest.count({ where: { venueId } })).toBe(0);
  });

  it("la chiave di una riga dipende dal locale: due ristoranti non si scontrano", async () => {
    const quando = new Date("2026-12-25T19:30:00.000Z");
    expect(chiaveRiga("locale-a", "3331112233", quando)).not.toBe(
      chiaveRiga("locale-b", "3331112233", quando),
    );
    /* E la stessa riga dello stesso locale fa la stessa chiave, sempre: e
       quello che rende sicuro ricaricare il file. */
    expect(chiaveRiga("locale-a", "3331112233", quando)).toBe(
      chiaveRiga("locale-a", "3331112233", quando),
    );
  });
});
