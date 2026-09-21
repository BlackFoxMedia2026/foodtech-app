import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { calendarioIcal, istanteIcal, piegaRiga, proteggiTesto } from "@/lib/ical";
import {
  feedCalendario,
  linkCalendario,
  rigeneraLinkCalendario,
  vistaCalendario,
} from "@/server/calendario";

/**
 * Le prenotazioni nel calendario del telefono.
 *
 * `Venue.calendarToken` stava nello schema col vincolo di unicità e nessuno
 * lo leggeva né lo scriveva: una funzione dichiarata e mai fatta. Le prove
 * guardano le cose che, sbagliate, si vedono solo sul telefono di chi si è
 * abbonato — cioè troppo tardi.
 */

const db = new PrismaClient();
const PREFISSO = "test-calendario-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let bookingId = "";

const DOMANI_ALLE_20 = new Date(Date.now() + 86_400_000);
DOMANI_ALLE_20.setUTCHours(18, 30, 0, 0);

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: {
      orgId: org.id,
      name: "Trattoria, da Mario",
      slug: unico,
      timezone: "Europe/Rome",
      address: "Via Roma 1; Torino",
    },
  });
  venueId = v.id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: "Altro", slug: `${unico}-altro`, timezone: "Europe/Rome" },
    })
  ).id;

  const ospite = await db.guest.create({
    data: { venueId, firstName: "Anna", lastName: "Bianchi; Rossi", phone: "+39 333 1112223" },
  });
  const sala = await db.room.create({ data: { venueId, name: "Sala" } });
  const tavolo = await db.table.create({
    data: { venueId, roomId: sala.id, label: "T7", seats: 4 },
  });
  bookingId = (
    await db.booking.create({
      data: {
        venueId,
        guestId: ospite.id,
        tableId: tavolo.id,
        partySize: 4,
        startsAt: DOMANI_ALLE_20,
        durationMin: 105,
        status: "CONFIRMED",
        source: "WIDGET",
        reference: `${PREFISSO}rif`,
        internalNotes: "Tavolo vicino alla finestra, e torta alla fine",
      },
    })
  ).id;

  // Una disdetta, che non deve comparire.
  await db.booking.create({
    data: {
      venueId,
      guestId: ospite.id,
      partySize: 2,
      startsAt: DOMANI_ALLE_20,
      durationMin: 105,
      status: "CANCELLED",
      source: "WIDGET",
      reference: `${PREFISSO}disdetta`,
    },
  });
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("il testo del calendario", () => {
  it("scrive gli istanti in tempo universale", () => {
    /* Senza lo `Z` finale ogni lettore li interpreta nel proprio fuso, ed è il
       modo classico di far comparire una cena alle due del pomeriggio. */
    expect(istanteIcal(new Date("2026-09-21T18:30:00.000Z"))).toBe("20260921T183000Z");
  });

  it("protegge virgole, punti e virgola e capi a riga", () => {
    /* «Rossi, 4 persone» senza protezione diventa due campi, e il nome si
       perde per strada. */
    expect(proteggiTesto("Rossi, 4 persone")).toBe("Rossi\\, 4 persone");
    expect(proteggiTesto("Via Roma 1; Torino")).toBe("Via Roma 1\; Torino");
    expect(proteggiTesto("prima\nseconda")).toBe("prima\\nseconda");
    expect(proteggiTesto("barra \\ rovesciata")).toBe("barra \\\\ rovesciata");
  });

  it("piega le righe lunghe contando i byte, non i caratteri", () => {
    /**
     * Il limite dello standard è in **ottetti**: una riga di nomi accentati
     * sta sotto i 75 caratteri e sopra i 75 byte. Piegare nel posto sbagliato
     * spezza una lettera a metà, e allora al ristoratore arriva un carattere
     * strano — o non arriva l'appuntamento.
     */
    const accentata = `DESCRIPTION:${"è".repeat(60)}`;
    const pezzi = piegaRiga(accentata);
    expect(pezzi.length).toBeGreaterThan(1);
    for (const p of pezzi) expect(Buffer.from(p, "utf8").length).toBeLessThanOrEqual(75);
    // Le righe di continuazione cominciano con uno spazio, e il testo si ricompone.
    expect(pezzi.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(pezzi.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(accentata);
    // E nessuna lettera è stata spezzata a metà.
    expect(pezzi.join("")).not.toContain("�");
  });

  it("una riga corta non si tocca", () => {
    expect(piegaRiga("BEGIN:VEVENT")).toEqual(["BEGIN:VEVENT"]);
  });

  it("chiude le righe con CRLF, come pretende il formato", () => {
    /* Con i soli `\n` alcuni lettori — Outlook fra questi — rifiutano il file
       senza dire perché. */
    const testo = calendarioIcal({ nome: "Prova", eventi: [] });
    expect(testo).toContain("BEGIN:VCALENDAR\r\n");
    expect(testo.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(testo.split("\n").every((r) => r === "" || r.endsWith("\r"))).toBe(true);
  });
});

describe("il calendario di un locale", () => {
  it("il segreto nasce quando qualcuno chiede il link, non prima", async () => {
    /* Un segreto che esiste senza che nessuno l'abbia chiesto è una porta
       aperta che nessuno sorveglia. */
    expect(await vistaCalendario(venueId)).toEqual({ attivo: false, percorso: null });

    const { percorso } = await linkCalendario(venueId);
    expect(percorso).toMatch(/^\/api\/calendario\/[\w-]{40,}$/);
    expect((await vistaCalendario(venueId)).attivo).toBe(true);

    // Chiederlo di nuovo non cambia l'indirizzo: chi si è abbonato resta.
    expect((await linkCalendario(venueId)).percorso).toBe(percorso);
  });

  it("porta le prenotazioni vere, e non le disdette", async () => {
    const { percorso } = await linkCalendario(venueId);
    const token = percorso.split("/").pop()!;
    const ical = await feedCalendario(token);

    expect(ical).toBeTruthy();
    expect(ical).toContain("BEGIN:VEVENT");
    expect(ical).toContain(`UID:prenotazione-${bookingId}@tavolo`);
    expect(ical).toContain("SUMMARY:Anna Bianchi\; Rossi · 4 persone · T7");
    expect(ical).toContain("DTSTART:20");
    // Un solo appuntamento: la disdetta non compare.
    expect((ical!.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it("non porta il telefono del cliente né la sua email", async () => {
    /* Chi ha il link non deve ritrovarsi in mano la rubrica del locale: il
       segreto sta in un indirizzo, e un indirizzo si condivide per sbaglio. */
    const { percorso } = await linkCalendario(venueId);
    const ical = (await feedCalendario(percorso.split("/").pop()!))!;
    expect(ical).not.toContain("333");
    expect(ical).not.toContain("@test");
    expect(ical).not.toMatch(/\+39/);
  });

  it("rigenerare spegne il vecchio indirizzo", async () => {
    /* È l'unico modo di togliere le prenotazioni dal telefono di chi non
       lavora più qui. */
    const vecchio = (await linkCalendario(venueId)).percorso.split("/").pop()!;
    expect(await feedCalendario(vecchio)).toBeTruthy();

    const nuovo = (await rigeneraLinkCalendario(venueId)).percorso.split("/").pop()!;
    expect(nuovo).not.toBe(vecchio);
    expect(await feedCalendario(vecchio)).toBeNull();
    expect(await feedCalendario(nuovo)).toBeTruthy();
  });

  it("un segreto inventato non esiste, e non dice di esistere", async () => {
    expect(await feedCalendario("x".repeat(43))).toBeNull();
    expect(await feedCalendario("")).toBeNull();
    expect(await feedCalendario("corto")).toBeNull();
  });

  it("il calendario di un locale non contiene le prenotazioni di un altro", async () => {
    const altro = (await linkCalendario(altroVenueId)).percorso.split("/").pop()!;
    const ical = (await feedCalendario(altro))!;
    expect(ical).not.toContain(bookingId);
    expect((ical.match(/BEGIN:VEVENT/g) ?? []).length).toBe(0);
  });
});
