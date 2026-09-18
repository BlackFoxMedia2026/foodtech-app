import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { componiLicenza, testoDaFirmare, type ContenutoLicenza } from "@/lib/licenza-centralino";
import { statoCentralino } from "@/server/licenza-centralino";
import { cambiaServizio, localiConServizi } from "@/server/admin/servizi";

/**
 * Accendere il telefono a un cliente **da Tavolo**.
 *
 * Prima si faceva emettendo una chiave firmata da un secondo gestionale e
 * incollandola qui: sei gesti in due applicazioni, con un codice da copiare in
 * mezzo. Per un cliente della nostra installazione era un giro inutile, perche
 * il database e nostro e chi accende siamo noi.
 *
 * La firma **non e stata buttata**, ed e la cosa che questi test difendono:
 * resta la strada delle installazioni che non gestiamo, dove un interruttore
 * nel database sarebbe un interruttore che il cliente si gira da solo. Le due
 * strade convivono, e nessuna deve indebolire l'altra.
 *
 * Quello che non deve succedere:
 *
 * - un nome di funzione scritto a mano nel pannello — o rimasto in tabella
 *   dopo un rinominamento — che accende qualcosa che non esiste;
 * - un elenco vuoto interpretato come «nessuna funzione» invece di «tutte»,
 *   che spegnerebbe il telefono a chi l'ha appena comprato;
 * - la storia di un servizio cancellata dallo spegnimento;
 * - chi ha deciso l'accensione sovrascritto da chi ha corretto una nota;
 * - una chiave scaduta che in elenco sembra un telefono acceso.
 */

const db = new PrismaClient();
const PREFISSO = "test-servizi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const nostra = generateKeyPairSync("ed25519");
const PUBBLICA = nostra.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

function chiavePer(venueId: string, scadenza?: string): string {
  const contenuto: ContenutoLicenza = {
    v: 1,
    l: venueId,
    n: "Locale di prova",
    ...(scadenza ? { e: scadenza } : {}),
  };
  const firma = sign(null, Buffer.from(testoDaFirmare(contenuto), "utf8"), nostra.privateKey).toString(
    "base64url",
  );
  return componiLicenza(contenuto, firma);
}

let venueId = "";
let orgId = "";
const ADMIN = "capo@blackfoxmedia.test";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  venueId = (await db.venue.create({ data: { orgId, name: "Nomad di prova", slug: unico } })).id;
});

beforeEach(async () => {
  process.env.CENTRALINO_CHIAVE_PUBBLICA = PUBBLICA;
  await db.venueServizio.deleteMany({ where: { venueId } });
  await db.venue.update({
    where: { id: venueId },
    data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
  });
});

afterEach(() => {
  if (originale === undefined) delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
  else process.env.CENTRALINO_CHIAVE_PUBBLICA = originale;
});

afterAll(async () => {
  await db.venueServizio.deleteMany({ where: { venueId } });
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

describe("l'interruttore della piattaforma", () => {
  it("accende il telefono senza nessuna chiave da incollare", async () => {
    expect((await statoCentralino(venueId)).attivo).toBe(false);

    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: true }, ADMIN);

    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(true);
    expect(stato.origine).toBe("piattaforma");
    /* Non scade: un servizio che accendiamo noi si spegne quando lo spegniamo
       noi, e una scadenza qui sarebbe un telefono che muore un sabato sera
       senza che nessuno l'abbia deciso. */
    expect(stato.scadeIl).toBeNull();
    expect(stato.chiaveLeggibile).toBeNull();
  });

  it("senza funzioni scelte le accende tutte", async () => {
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: true, funzioni: [] }, ADMIN);
    const stato = await statoCentralino(venueId);
    // Un elenco vuoto e un servizio completo, come nella chiave.
    expect(stato.funzioni).toEqual(["riconoscimento", "prenotazioni", "statistiche"]);
  });

  it("con le funzioni scelte accende solo quelle", async () => {
    await cambiaServizio(
      venueId,
      { servizio: "CENTRALINO", attivo: true, funzioni: ["riconoscimento"] },
      ADMIN,
    );
    expect((await statoCentralino(venueId)).funzioni).toEqual(["riconoscimento"]);
  });

  it("un nome di funzione che non esiste non accende niente", async () => {
    /* Puo arrivarci da un rinominamento o da una riga scritta a mano: passa
       dall'elenco chiuso, e quello che non ne fa parte cade. */
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: true }, ADMIN);
    await db.venueServizio.updateMany({
      where: { venueId },
      data: { funzioni: ["riconoscimento", "teletrasporto"] },
    });
    expect((await statoCentralino(venueId)).funzioni).toEqual(["riconoscimento"]);
  });

  it("spegnendolo il telefono si spegne, ma la storia resta", async () => {
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: true }, ADMIN);
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: false }, ADMIN);

    expect((await statoCentralino(venueId)).attivo).toBe(false);
    const riga = await db.venueServizio.findFirstOrThrow({ where: { venueId } });
    // La riga c'è ancora: davanti a «da ieri non va» la domanda è quando e chi.
    expect(riga.attivo).toBe(false);
    expect(riga.spentoIl).not.toBeNull();
    expect(riga.attivatoDa).toBe(ADMIN);
  });

  it("chi ha deciso non viene sovrascritto da chi corregge una nota", async () => {
    await cambiaServizio(
      venueId,
      { servizio: "CENTRALINO", attivo: true, nota: "prova di due settimane" },
      ADMIN,
    );
    const prima = await db.venueServizio.findFirstOrThrow({ where: { venueId } });

    await cambiaServizio(
      venueId,
      { servizio: "CENTRALINO", attivo: false, nota: "scaduta la prova" },
      "qualcunaltro@blackfoxmedia.test",
    );
    const dopo = await db.venueServizio.findFirstOrThrow({ where: { venueId } });

    expect(dopo.attivatoDa).toBe(prima.attivatoDa);
    expect(dopo.nota).toBe("scaduta la prova");
  });

  it("riaccendere è una decisione nuova: chi e quando si aggiornano", async () => {
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: true }, ADMIN);
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: false }, ADMIN);
    await cambiaServizio(
      venueId,
      { servizio: "CENTRALINO", attivo: true },
      "unaltro@blackfoxmedia.test",
    );
    const riga = await db.venueServizio.findFirstOrThrow({ where: { venueId } });
    expect(riga.attivatoDa).toBe("unaltro@blackfoxmedia.test");
    expect(riga.spentoIl).toBeNull();
  });

  it("su un locale che non esiste non scrive niente", async () => {
    await expect(
      cambiaServizio("locale-inventato", { servizio: "CENTRALINO", attivo: true }, ADMIN),
    ).rejects.toThrow("locale_non_trovato");
  });
});

describe("la chiave firmata resta una strada", () => {
  it("accende anche senza interruttore, e si vede che viene da lì", async () => {
    await db.venue.update({
      where: { id: venueId },
      data: { phoneLicenseKey: chiavePer(venueId), phoneLicenseActivatedAt: new Date() },
    });
    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(true);
    expect(stato.origine).toBe("chiave");
  });

  it("l'interruttore spento non spegne una chiave valida", async () => {
    /* Sono due strade, non una con precedenza: un cliente può aver comprato
       la chiave prima e poi essere passato a noi, e il telefono non deve
       spegnersi nel mezzo perché una riga dice «false». */
    await db.venue.update({
      where: { id: venueId },
      data: { phoneLicenseKey: chiavePer(venueId), phoneLicenseActivatedAt: new Date() },
    });
    await cambiaServizio(venueId, { servizio: "CENTRALINO", attivo: false }, ADMIN);
    expect((await statoCentralino(venueId)).attivo).toBe(true);
  });

  it("una chiave scaduta, in elenco, non passa per un telefono acceso", async () => {
    await db.venue.update({
      where: { id: venueId },
      data: {
        phoneLicenseKey: chiavePer(venueId, "2020-01-01"),
        phoneLicenseActivatedAt: new Date(),
      },
    });
    expect((await statoCentralino(venueId)).attivo).toBe(false);

    const riga = (await localiConServizi()).find((l) => l.venueId === venueId);
    /* In elenco si dice **chiave presente**, non «attivo»: la firma non si
       riverifica riga per riga, e dichiararlo acceso sarebbe la solita spunta
       che afferma un fatto invece di leggerlo. */
    expect(riga?.centralino.attivo).toBe(false);
    expect(riga?.centralino.haChiave).toBe(true);
  });
});

describe("l'elenco per il pannello", () => {
  it("mostra tutti i locali, non solo quelli accesi", async () => {
    /* La domanda di quella schermata è «a chi lo accendo?», e un elenco dei
       soli accesi non la può rispondere. */
    const elenco = await localiConServizi();
    expect(elenco.some((l) => l.venueId === venueId)).toBe(true);
  });

  it("dice chi l'ha acceso e cosa comprende", async () => {
    await cambiaServizio(
      venueId,
      { servizio: "CENTRALINO", attivo: true, funzioni: ["prenotazioni"], nota: "pagato" },
      ADMIN,
    );
    const riga = (await localiConServizi()).find((l) => l.venueId === venueId);
    expect(riga?.centralino.attivo).toBe(true);
    expect(riga?.centralino.origine).toBe("piattaforma");
    expect(riga?.centralino.funzioni).toEqual(["prenotazioni"]);
    expect(riga?.centralino.attivatoDa).toBe(ADMIN);
    expect(riga?.centralino.nota).toBe("pagato");
  });
});
