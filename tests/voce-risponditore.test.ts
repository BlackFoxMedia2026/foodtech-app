import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  SALUTO_MAX,
  benvenutoPredefinito,
  risponditorePerCentralino,
  salvaBenvenuto,
  vistaBenvenuto,
} from "@/server/voice/benvenuto";
import { aggiornaRisposta, creaRisposta } from "@/server/voice/conoscenza";
import { disponibilitaPerTelefono } from "@/server/voice/disponibilita-telefono";
import { testoConferma, avvisaConfermaWhatsapp } from "@/server/voice/conferma-whatsapp";
import { registraPrenotazioneTelefonica } from "@/server/prenotazione-telefonica";
import { zonedTimeToInstant } from "@/server/availability";

/**
 * Il risponditore che parla a nome del locale.
 *
 * Tre cose, e ognuna è una promessa a chi chiama: si sente il nome del posto
 * che ha chiamato, gli si propone un orario che esiste davvero, e non gli si
 * dice «confermata» prima che qualcuno l'abbia confermata.
 */

const db = new PrismaClient();
const PREFISSO = "test-voce-risp-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";
let nomeLocale = "";
const FUSO = "Europe/Rome";

/**
 * Domani a quell'ora **nel fuso del locale**, non in quello della macchina.
 *
 * `setHours(20)` dà le 20 di chi esegue il test: su una macchina a UTC sono le
 * 22 a Roma, e la prova «a quell'ora e pieno, proponi un altro orario»
 * chiedeva un orario diverso da quello che credeva. Ci ho perso un giro: il
 * sospetto era un difetto nel motore della disponibilita, ed era il test.
 */
function domaniAlle(ore: number, minuti = 0): Date {
  const domani = new Date(Date.now() + 86_400_000);
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(domani);
  const p = (t: string) => Number(parti.find((x) => x.type === t)?.value ?? "0");
  return zonedTimeToInstant(
    { year: p("year"), month: p("month"), day: p("day") },
    ore * 60 + minuti,
    FUSO,
  );
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  nomeLocale = unico;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: FUSO },
  });
  venueId = v.id;

  /* Un turno di cena e **un tavolo solo da due**: serve per la prova che
     conta, quella in cui a quell'ora non ci sta e il risponditore deve
     proporre un altro orario. Con dieci tavoli non ci sarebbe niente da
     provare. */
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: {
        venueId,
        name: "Cena",
        weekday,
        startMinute: 19 * 60,
        endMinute: 23 * 60,
        capacity: 2,
        slotMinutes: 30,
      },
    });
  }
  const room = await db.room.create({ data: { venueId, name: "Sala" } });
  await db.table.create({ data: { venueId, roomId: room.id, label: "T1", seats: 2 } });
}, 60_000);

afterAll(async () => {
  await db.messageLog.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("il saluto del risponditore", () => {
  it("senza niente di scritto nomina il locale", async () => {
    /* Un saluto che non dice dove sei lascia chi chiama senza la prima
       informazione che gli serve: ha chiamato il posto giusto? */
    const vista = await vistaBenvenuto(venueId);
    expect(vista.testo).toBeNull();
    expect(vista.inUso).toContain(nomeLocale);
    expect(vista.inUso).toBe(benvenutoPredefinito(nomeLocale));
  });

  it("il locale lo scrive, e il centralino sente quello", async () => {
    await salvaBenvenuto(venueId, { testo: "  Salve, benvenuti al Nomad!  " });

    const vista = await vistaBenvenuto(venueId);
    expect(vista.testo).toBe("Salve, benvenuti al Nomad!");
    expect(vista.inUso).toBe("Salve, benvenuti al Nomad!");

    /* La stessa frase che legge la schermata la sente chi chiama: una seconda
       formula qui si scollerebbe dalla prima al primo ritocco. */
    const perIlCentralino = await risponditorePerCentralino(venueId);
    expect(perIlCentralino.saluto).toBe("Salve, benvenuti al Nomad!");
    expect(perIlCentralino.locale).toBe(nomeLocale);
    expect(perIlCentralino.fuso).toBe("Europe/Rome");
  });

  it("svuotarlo torna al predefinito, non a una voce muta", async () => {
    await salvaBenvenuto(venueId, { testo: "Qualcosa" });
    await salvaBenvenuto(venueId, { testo: "   " });

    const vista = await vistaBenvenuto(venueId);
    expect(vista.testo).toBeNull();
    const perIlCentralino = await risponditorePerCentralino(venueId);
    expect(perIlCentralino.saluto).toBe(benvenutoPredefinito(nomeLocale));
    expect(perIlCentralino.saluto.length).toBeGreaterThan(0);
  });

  it("porta al centralino le risposte che il locale ha scritto", async () => {
    /*
      Sono l'unica cosa che la voce puo dire su orari, parcheggio e cani: senza
      queste, alla domanda piu frequente che le fanno la risposta onesta e
      «non lo so» — e chi chiama riattacca e chiama un altro ristorante.

      Arrivano con il saluto perche e la stessa domanda, e perche il momento in
      cui servono e lo stesso: mentre il telefono squilla.
    */
    const attiva = await creaRisposta(venueId, {
      categoria: "ORARI",
      argomenti: ["a che ora chiudete", "orario di chiusura"],
      risposta: "La cucina chiude alle 23.",
    });
    const spenta = await creaRisposta(venueId, {
      categoria: "ALTRO",
      argomenti: ["si porta il cane"],
      risposta: "Non piu: e cambiata la regola.",
    });
    await aggiornaRisposta(venueId, spenta.id, { attivo: false });

    const perIlCentralino = await risponditorePerCentralino(venueId);
    /* L'argomento e quello scritto dal locale, non la nostra categoria:
       «ORARI» e meno utile di «a che ora chiudete» a un modello che deve
       capire se la domanda e questa. */
    expect(perIlCentralino.risposte).toContainEqual({
      argomento: "a che ora chiudete",
      risposta: "La cucina chiude alle 23.",
    });
    /* Una risposta spenta e una risposta che il locale ha deciso di non dare
       piu: ripeterla al telefono sarebbe peggio che non averla. */
    expect(perIlCentralino.risposte.map((r) => r.risposta)).not.toContain(
      "Non piu: e cambiata la regola.",
    );

    await db.voiceKnowledgeItem.delete({ where: { id: attiva.id } });
    await db.voiceKnowledgeItem.delete({ where: { id: spenta.id } });
  });

  it("senza risposte scritte non manda un elenco finto", async () => {
    const perIlCentralino = await risponditorePerCentralino(venueId);
    expect(perIlCentralino.risposte).toEqual([]);
  });

  it("rifiuta un testo più lungo della colonna", async () => {
    await expect(
      salvaBenvenuto(venueId, { testo: "x".repeat(SALUTO_MAX + 1) }),
    ).rejects.toThrow();
  });
});

describe("la disponibilità che il risponditore guarda", () => {
  it("dice sì quando a quell'ora c'è posto", async () => {
    const esito = await disponibilitaPerTelefono(venueId, {
      persone: 2,
      quando: domaniAlle(20),
    });
    expect(esito.controllato).toBe(true);
    expect(esito.libero).toBe(true);
    expect(esito.alternative).toEqual([]);
  });

  it("quando il tavolo è occupato propone gli orari che ci stanno", async () => {
    /* Si riempie l'unico tavolo alle 20, e si richiede proprio le 20. */
    await registraPrenotazioneTelefonica(venueId, {
      idCentralino: `occupa-${Date.now()}`,
      phone: "+39 333 9990001",
      persone: 2,
      quando: domaniAlle(20),
    });

    const esito = await disponibilitaPerTelefono(venueId, {
      persone: 2,
      quando: domaniAlle(20),
    });

    expect(esito.controllato).toBe(true);
    expect(esito.libero).toBe(false);
    expect(esito.motivi.length).toBeGreaterThan(0);
    expect(esito.alternative.length).toBeGreaterThan(0);

    /*
      La pretesa che conta: **un orario proposto deve essere prenotabile**.

      Non «è l'orario che mi aspettavo»: la prima versione di questo test
      pretendeva le 19:30, e le 19:30 erano occupate — una cena da 105 minuti
      cominciata lì finisce dentro quella già prenotata. Aveva torto il test,
      non il motore. Rimandare indietro la proposta e richiederla è l'unica
      verifica che non dipende da quanto dura una cena in questo locale.
    */
    for (const alt of esito.alternative) {
      const verifica = await disponibilitaPerTelefono(venueId, {
        persone: 2,
        quando: new Date(alt.quando),
      });
      expect(verifica.libero, `l'orario proposto ${alt.ora} non è prenotabile`).toBe(true);
    }

    /* E il più vicino per primo: chi ha chiesto le otto preferisce le dieci a
       mezzanotte, non il contrario. */
    const distanze = esito.alternative.map((a) =>
      Math.abs(new Date(a.quando).getTime() - domaniAlle(20).getTime()),
    );
    expect(distanze).toEqual([...distanze].sort((a, b) => a - b));
  });

  it("per quaranta persone non inventa un sì", async () => {
    const esito = await disponibilitaPerTelefono(venueId, {
      persone: 40,
      quando: domaniAlle(20),
    });
    expect(esito.libero).toBe(false);
  });
});

describe("l'avviso quando la sala conferma", () => {
  it("il testo dice locale, giorno, ora e persone", () => {
    const testo = testoConferma({
      locale: "Nomad",
      nome: "Laura",
      persone: 4,
      quando: new Date("2026-09-25T18:30:00.000Z"),
      fuso: "Europe/Rome",
    });
    expect(testo).toContain("Laura");
    expect(testo).toContain("Nomad");
    expect(testo).toContain("20:30");
    expect(testo).toContain("4 persone");
  });

  it("non usa il segnaposto come nome della persona", () => {
    /* «Da richiamare, la sua prenotazione è confermata» si legge come un
       messaggio scritto da una macchina rotta. */
    const testo = testoConferma({
      locale: "Nomad",
      nome: null,
      persone: 2,
      quando: new Date("2026-09-25T18:30:00.000Z"),
      fuso: "Europe/Rome",
    });
    expect(testo).not.toContain("Da richiamare");
    expect(testo.startsWith("la sua")).toBe(false);
  });

  it("senza canale WhatsApp resta la traccia col testo che sarebbe partito", async () => {
    /* È la differenza fra «non era previsto nessun messaggio» e «era previsto
       e non è partito»: due cose molto diverse per chi aspetta una conferma. */
    const pren = await registraPrenotazioneTelefonica(venueId, {
      idCentralino: `conferma-${Date.now()}`,
      phone: "+39 333 9990002",
      persone: 2,
      quando: domaniAlle(21, 30),
      nome: "Marco Rossi",
    });

    const esito = await avvisaConfermaWhatsapp(venueId, pren.id);
    expect(esito.mandato).toBe(false);
    expect(esito).toMatchObject({ perche: "senza_canale" });

    const riga = await db.messageLog.findFirst({
      where: { bookingId: pren.id },
      select: { channel: true, status: true, toAddress: true, bodyPreview: true },
    });
    expect(riga?.channel).toBe("WHATSAPP");
    expect(riga?.status).toBe("SKIPPED");
    expect(riga?.bodyPreview).toContain("confermata");
    expect(riga?.bodyPreview).toContain("Marco");
  });

  it("non manda niente per una prenotazione che non viene dal telefono", async () => {
    const guest = await db.guest.create({
      data: { venueId, firstName: "Chi", lastName: "Sia", phone: "+39 333 9990003" },
    });
    const b = await db.booking.create({
      data: {
        venueId,
        guestId: guest.id,
        partySize: 2,
        startsAt: domaniAlle(22),
        durationMin: 90,
        status: "CONFIRMED",
        source: "WIDGET",
        reference: `T${Date.now()}`,
      },
    });

    const esito = await avvisaConfermaWhatsapp(venueId, b.id);
    expect(esito).toMatchObject({ mandato: false, perche: "non_telefonica" });
  });
});
