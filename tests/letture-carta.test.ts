import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GIORNI_LETTURE, lettureCarta, segnaLetturaCarta } from "@/server/menu-letture";

/**
 * Quante volte la carta viene letta.
 *
 * `MenuScan` era una tabella dichiarata e mai scritta. Le prove guardano le
 * tre cose che, sbagliate, la rendono un numero **falso** invece di mancante:
 * un tavolo che riapre la carta quattro volte contato come quattro clienti,
 * un indirizzo di rete salvato senza motivo, e il QR indistinguibile dal link.
 */

const db = new PrismaClient();
const PREFISSO = "test-letture-carta-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
const TELEFONO = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 (iPhone)" };

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
    })
  ).id;
}, 60_000);

afterEach(async () => {
  await db.menuScan.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("segnare una lettura", () => {
  it("la prima volta conta, le altre dello stesso giorno no", async () => {
    /**
     * Chi legge la carta la riapre quattro volte durante la cena — antipasti,
     * secondi, dolci, il vino. Contarle quattro volte trasformerebbe «quante
     * persone l'hanno letta» in «quante volte è stata aperta», che è un numero
     * che gonfia da solo: un tavolo che ricarica non fa quattro clienti.
     */
    expect(await segnaLetturaCarta({ venueId, ...TELEFONO })).toEqual({ segnata: true });
    expect(await segnaLetturaCarta({ venueId, ...TELEFONO })).toEqual({ segnata: false });
    expect(await segnaLetturaCarta({ venueId, ...TELEFONO })).toEqual({ segnata: false });

    expect((await lettureCarta(venueId)).totale).toBe(1);
  });

  it("domani la stessa persona conta di nuovo", async () => {
    /* Perché è un'altra visita: l'impronta contiene il giorno, di proposito. */
    const oggi = new Date("2026-09-21T12:00:00.000Z");
    const domani = new Date("2026-09-22T12:00:00.000Z");
    expect(await segnaLetturaCarta({ venueId, ...TELEFONO, adesso: oggi })).toMatchObject({
      segnata: true,
    });
    expect(await segnaLetturaCarta({ venueId, ...TELEFONO, adesso: domani })).toMatchObject({
      segnata: true,
    });
    expect((await lettureCarta(venueId)).totale).toBe(2);
  });

  it("due telefoni diversi sono due letture", async () => {
    await segnaLetturaCarta({ venueId, ...TELEFONO });
    await segnaLetturaCarta({ venueId, ip: "203.0.113.8", userAgent: "Mozilla/5.0 (Android)" });
    expect((await lettureCarta(venueId)).totale).toBe(2);
  });

  it("non salva l'indirizzo di rete, ma un'impronta da cui non si torna indietro", async () => {
    /**
     * Un indirizzo IP è un dato personale, e per contare le letture non serve:
     * serve solo distinguere due letture della stessa persona da due letture
     * di due persone. L'impronta cambia ogni giorno e per ogni locale, quindi
     * non permette di seguire nessuno.
     */
    await segnaLetturaCarta({ venueId, ...TELEFONO });
    const riga = await db.menuScan.findFirstOrThrow({ where: { venueId } });
    expect(riga.ipHash).toBeTruthy();
    expect(riga.ipHash).not.toContain("203.0.113.7");
    expect(JSON.stringify(riga)).not.toContain("203.0.113.7");
    /* E i campi del marketing restano vuoti: raccogliere contatti è un'altra
       funzione, con dentro il consenso, e non si fa di straforo. */
    expect(riga.email).toBeNull();
    expect(riga.phone).toBeNull();
    expect(riga.consentMarketing).toBe(false);
    expect(riga.guestId).toBeNull();
  });

  it("distingue il QR sul tavolo dal link", async () => {
    /* Sono due domande diverse — «la gente inquadra il codice?» e «il link su
       Instagram funziona?» — e un totale unico non risponde a nessuna. */
    await segnaLetturaCarta({ venueId, ...TELEFONO, source: "QR" });
    await segnaLetturaCarta({
      venueId,
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0 (Android)",
      source: "LINK",
    });

    const letture = await lettureCarta(venueId);
    expect(letture.totale).toBe(2);
    expect(letture.dalQr).toBe(1);
  });

  it("non solleva mai: una statistica non deve impedire di leggere il menù", async () => {
    /* Locale inesistente: la scrittura fallisce sul vincolo, e la funzione
       risponde «non segnata» invece di far cadere la pagina di chi è seduto al
       tavolo col telefono in mano. */
    await expect(
      segnaLetturaCarta({ venueId: "non-esiste", ...TELEFONO }),
    ).resolves.toEqual({ segnata: false });
  });
});

describe("il numero da mostrare", () => {
  it("guarda una finestra di giorni, non tutta la storia", async () => {
    await db.menuScan.create({
      data: {
        venueId,
        ipHash: "vecchia",
        source: "QR",
        createdAt: new Date(Date.now() - (GIORNI_LETTURE + 5) * 86_400_000),
      },
    });
    await segnaLetturaCarta({ venueId, ...TELEFONO });

    const letture = await lettureCarta(venueId);
    expect(letture.totale).toBe(1);
    expect(letture.giorni).toBe(GIORNI_LETTURE);
  });

  it("senza letture risponde zero, non un errore", async () => {
    expect(await lettureCarta(venueId)).toMatchObject({ totale: 0, dalQr: 0 });
  });
});
