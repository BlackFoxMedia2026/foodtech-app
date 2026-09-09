import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MAX_PER_TIPO, MINIMO_LETTERE, cercaNelLocale } from "@/server/ricerca";
import { GIORNI_AVANTI, GIORNI_INDIETRO } from "@/lib/ricerca-tipi";

/**
 * La ricerca globale.
 *
 * Le prove guardano le quattro cose che, sbagliate, fanno concludere «non c'è»
 * a chi invece c'è:
 *
 * - **il telefono si cerca a cifre.** In archivio i numeri stanno come li ha
 *   scritti chi li ha scritti, con spazi e prefissi: cercare «3358842» con un
 *   `contains` non trova «+39 335 8842910»;
 * - **la finestra delle prenotazioni è dichiarata**, e fuori da quella non si
 *   trova niente — ma l'ospite sì, e da lì si arriva alla sua storia;
 * - **il tetto non nasconde il totale**;
 * - **i locali non si mescolano**, che qui vale doppio: una ricerca che
 *   attraversa i confini mostra i clienti di un altro ristorante.
 */

const db = new PrismaClient();
const PREFISSO = "test-ricerca-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
const ORA = new Date("2026-09-10T12:00:00+02:00");

async function ospite(v: string, dati: { nome: string; cognome?: string; tel?: string; email?: string; visite?: number }) {
  return db.guest.create({
    data: {
      venueId: v,
      firstName: dati.nome,
      lastName: dati.cognome ?? null,
      phone: dati.tel ?? null,
      email: dati.email ?? null,
      totalVisits: dati.visite ?? 0,
    },
  });
}

async function prenotazione(guestId: string, giorniDaOra: number) {
  return db.booking.create({
    data: {
      venueId,
      guestId,
      partySize: 2,
      startsAt: new Date(ORA.getTime() + giorniDaOra * 86_400_000),
      status: "CONFIRMED",
      source: "PHONE",
    },
  });
}

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
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function svuota() {
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.guest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
}

describe("cosa trova", () => {
  it("trova per nome e per cognome, senza badare alle maiuscole", async () => {
    await svuota();
    await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });

    for (const domanda of ["mar", "BIANCHI", "Bianc"]) {
      const e = await cercaNelLocale(venueId, domanda, { now: ORA });
      expect(e.ospiti.map((o) => o.nome), domanda).toContain("Marta Bianchi");
    }
  });

  it("trova un numero scritto con spazi e prefisso, cercando solo le cifre", async () => {
    await svuota();
    await ospite(venueId, { nome: "Chiara", tel: "+39 335 8842910" });

    // È il difetto che l'audit aveva segnalato: queste tre domande sono lo
    // stesso numero, e prima solo la prima funzionava.
    for (const domanda of ["+39 335 8842910", "3358842910", "3358842", "335 884"]) {
      const e = await cercaNelLocale(venueId, domanda, { now: ORA });
      expect(e.ospiti.map((o) => o.nome), domanda).toContain("Chiara");
    }
  });

  it("due cifre non sono un numero: non si cerca su tutto l'archivio", async () => {
    await svuota();
    await ospite(venueId, { nome: "Chiara", tel: "+39 335 8842910" });
    // «33» compare dentro quel numero, ma cercare due cifre restituirebbe
    // mezzo archivio: sotto le quattro cifre il telefono non si guarda.
    const e = await cercaNelLocale(venueId, "33", { now: ORA });
    expect(e.ospiti).toHaveLength(0);
  });

  it("sotto il minimo di lettere non cerca niente", async () => {
    await svuota();
    await ospite(venueId, { nome: "Anna" });
    const e = await cercaNelLocale(venueId, "a".repeat(MINIMO_LETTERE - 1), { now: ORA });
    expect(e.ospiti).toHaveLength(0);
    expect(e.prenotazioni).toHaveLength(0);
  });

  it("trova l'email", async () => {
    await svuota();
    await ospite(venueId, { nome: "Luca", email: "luca.rossi@example.com" });
    const e = await cercaNelLocale(venueId, "rossi@exa", { now: ORA });
    expect(e.ospiti.map((o) => o.nome)).toContain("Luca");
  });

  it("prima chi viene più spesso: fra due Rossi, quello che il locale conosce", async () => {
    await svuota();
    await ospite(venueId, { nome: "Primo", cognome: "Rossi", visite: 1 });
    await ospite(venueId, { nome: "Secondo", cognome: "Rossi", visite: 14 });

    const e = await cercaNelLocale(venueId, "Rossi", { now: ORA });
    expect(e.ospiti[0].nome).toBe("Secondo Rossi");
  });
});

describe("le prenotazioni, in una finestra dichiarata", () => {
  it("trova quelle nella finestra e non quelle fuori", async () => {
    await svuota();
    const g = await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });
    const dentro = await prenotazione(g.id, 3);
    await prenotazione(g.id, GIORNI_AVANTI + 5);
    await prenotazione(g.id, -(GIORNI_INDIETRO + 5));

    const e = await cercaNelLocale(venueId, "Bianchi", { now: ORA });
    expect(e.prenotazioni.map((p) => p.id)).toEqual([dentro.id]);
    // L'ospite però si trova sempre: la sua storia completa è nella scheda.
    expect(e.ospiti).toHaveLength(1);
  });

  it("una prenotazione cancellata dal cestino non si trova", async () => {
    await svuota();
    const g = await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });
    const b = await prenotazione(g.id, 2);
    await db.booking.update({ where: { id: b.id }, data: { deletedAt: new Date() } });

    const e = await cercaNelLocale(venueId, "Bianchi", { now: ORA });
    expect(e.prenotazioni).toHaveLength(0);
  });

  it("le prenotazioni arrivano in ordine di quando sono", async () => {
    await svuota();
    const g = await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });
    const dopo = await prenotazione(g.id, 6);
    const prima = await prenotazione(g.id, 1);

    const e = await cercaNelLocale(venueId, "Bianchi", { now: ORA });
    expect(e.prenotazioni.map((p) => p.id)).toEqual([prima.id, dopo.id]);
  });
});

describe("i confini", () => {
  it("il tetto non nasconde il totale", async () => {
    await svuota();
    for (let i = 0; i < MAX_PER_TIPO + 4; i++) {
      await ospite(venueId, { nome: `Rossi${i}`, cognome: "Rossi" });
    }
    const e = await cercaNelLocale(venueId, "Rossi", { now: ORA });
    expect(e.ospiti).toHaveLength(MAX_PER_TIPO);
    expect(e.ospitiTotali).toBe(MAX_PER_TIPO + 4);
  });

  it("non mescola i locali, né per nome né per numero", async () => {
    await svuota();
    await ospite(altroVenueId, { nome: "Altrui", cognome: "Bianchi", tel: "+39 335 8842910" });

    const perNome = await cercaNelLocale(venueId, "Bianchi", { now: ORA });
    expect(perNome.ospiti).toHaveLength(0);
    expect(perNome.ospitiTotali).toBe(0);

    const perNumero = await cercaNelLocale(venueId, "3358842", { now: ORA });
    expect(perNumero.ospiti).toHaveLength(0);
  });

  it("restituisce la domanda ripulita, per scartare le risposte in ritardo", async () => {
    await svuota();
    const e = await cercaNelLocale(venueId, "  Bianchi  ", { now: ORA });
    expect(e.q).toBe("Bianchi");
  });
});

describe("il riferimento della prenotazione", () => {
  /*
    Il cliente riceve il riferimento per intero — nella pagina di conferma e
    nell'email — e quando telefona legge quello. Prima non si poteva cercare, e
    la scheda della prenotazione lo mostrava **troncato a dieci caratteri**:
    chi in sala confrontava la stringa letta al telefono con quella sullo
    schermo confrontava due cose diverse.
  */
  it("trova una prenotazione dal suo riferimento, anche solo un pezzo", async () => {
    await svuota();
    const g = await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });
    const b = await prenotazione(g.id, 2);
    const pezzo = b.reference.slice(-8);

    const e = await cercaNelLocale(venueId, pezzo, { now: ORA });
    expect(e.prenotazioni.map((p) => p.id)).toContain(b.id);
    // E la riga dice perché è lì.
    expect(e.prenotazioni.find((p) => p.id === b.id)?.perRiferimento).toBe(true);
  });

  it("il riferimento non ha finestra: vale anche per una prenotazione fra due mesi", async () => {
    await svuota();
    const g = await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });
    const lontana = await prenotazione(g.id, GIORNI_AVANTI + 30);

    // Per nome non si trova — è fuori dalla finestra dichiarata…
    expect((await cercaNelLocale(venueId, "Bianchi", { now: ORA })).prenotazioni).toHaveLength(0);
    // …per riferimento sì, perché è una corrispondenza precisa.
    const e = await cercaNelLocale(venueId, lontana.reference.slice(-10), { now: ORA });
    expect(e.prenotazioni.map((p) => p.id)).toEqual([lontana.id]);
  });

  it("una stringa corta non è un riferimento", async () => {
    await svuota();
    const g = await ospite(venueId, { nome: "Marta", cognome: "Bianchi" });
    const b = await prenotazione(g.id, 2);
    // Cinque caratteri del riferimento non bastano: sotto la soglia un
    // frammento di identificativo corrisponderebbe a mezzo archivio.
    const e = await cercaNelLocale(venueId, b.reference.slice(0, 5), { now: ORA });
    expect(e.prenotazioni.find((p) => p.perRiferimento)).toBeUndefined();
  });

  it("il riferimento di un altro locale non si trova", async () => {
    await svuota();
    const g = await ospite(altroVenueId, { nome: "Altrui" });
    const b = await db.booking.create({
      data: {
        venueId: altroVenueId,
        guestId: g.id,
        partySize: 2,
        startsAt: ORA,
        status: "CONFIRMED",
        source: "PHONE",
      },
    });
    const e = await cercaNelLocale(venueId, b.reference.slice(-10), { now: ORA });
    expect(e.prenotazioni).toHaveLength(0);
  });
});
