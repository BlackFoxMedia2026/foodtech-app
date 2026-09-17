import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  TelefonoBrowserError,
  credenzialiTelefonoBrowser,
  salvaTelefonoBrowser,
  statoTelefonoBrowser,
} from "@/server/telefono-browser";

/**
 * I dati con cui il browser diventa il telefono del locale.
 *
 * Quello che si può provare senza un centralino vero è la parte che sbaglia
 * davvero: la password che si cancella per sbaglio, l'indirizzo non sicuro che
 * il browser non aprirebbe mai, e il fatto che la password torni indietro
 * **solo** dalla funzione che deve farla uscire.
 */

const db = new PrismaClient();
const PREFISSO = "test-sip-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
const chiaveOriginale = process.env.CHIAVE_CIFRATURA;

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
}, 60_000);

beforeEach(() => {
  // 32 byte in base64: la forma che `openssl rand -base64 32` produce.
  process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 7).toString("base64");
});

afterEach(async () => {
  if (chiaveOriginale === undefined) delete process.env.CHIAVE_CIFRATURA;
  else process.env.CHIAVE_CIFRATURA = chiaveOriginale;
  await db.venue.update({
    where: { id: venueId },
    data: { phoneSipServer: null, phoneSipUser: null, phoneSipPassword: null },
  });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const DATI = {
  server: "wss://sip.esempio.test:8089/ws",
  utente: "locale-prova",
  password: "segreto-di-prova",
};

describe("salvare i dati del telefono", () => {
  it("li salva e dice che è pronto, senza restituire la password", async () => {
    const stato = await salvaTelefonoBrowser(venueId, DATI);
    expect(stato.pronto).toBe(true);
    expect(stato.server).toBe(DATI.server);
    expect(stato.utente).toBe(DATI.utente);
    expect(stato.passwordPresente).toBe(true);
    // Lo stato non contiene la password in nessuna forma.
    expect(JSON.stringify(stato)).not.toContain(DATI.password);
  });

  it("la password nel database non è leggibile", async () => {
    await salvaTelefonoBrowser(venueId, DATI);
    const riga = await db.venue.findUnique({
      where: { id: venueId },
      select: { phoneSipPassword: true },
    });
    expect(riga?.phoneSipPassword).not.toBeNull();
    expect(riga?.phoneSipPassword).not.toContain(DATI.password);
    expect(riga?.phoneSipPassword?.startsWith("v1:")).toBe(true);
  });

  it("torna leggibile solo dalla funzione che deve farla uscire", async () => {
    await salvaTelefonoBrowser(venueId, DATI);
    const cred = await credenzialiTelefonoBrowser(venueId);
    expect(cred?.password).toBe(DATI.password);
    expect(cred?.server).toBe(DATI.server);
  });

  it("un campo password vuoto NON cancella quella salvata", async () => {
    /* È il difetto che scollegherebbe il telefono a chi voleva solo
       correggere l'utenza: il modulo non mostra la password, quindi vuoto
       significa «non cambiarla». */
    await salvaTelefonoBrowser(venueId, DATI);
    await salvaTelefonoBrowser(venueId, { utente: "altro-utente" });
    const dopo = await statoTelefonoBrowser(venueId);
    expect(dopo.utente).toBe("altro-utente");
    expect(dopo.passwordPresente).toBe(true);
    expect((await credenzialiTelefonoBrowser(venueId))?.password).toBe(DATI.password);
  });

  it("per cancellarla si manda esplicitamente il vuoto", async () => {
    await salvaTelefonoBrowser(venueId, DATI);
    const dopo = await salvaTelefonoBrowser(venueId, { password: null });
    expect(dopo.passwordPresente).toBe(false);
    expect(dopo.pronto).toBe(false);
    expect(await credenzialiTelefonoBrowser(venueId)).toBeNull();
  });

  it("rifiuta un indirizzo che il browser non aprirebbe", async () => {
    /* `ws://` da una pagina sicura il browser non lo apre, e non c'è modo di
       forzarlo: accettarlo vorrebbe dire salvare una configurazione che non
       funzionerà mai, e scoprirlo la prima volta che squilla. */
    await expect(
      salvaTelefonoBrowser(venueId, { ...DATI, server: "ws://sip.esempio.test/ws" }),
    ).rejects.toThrow(TelefonoBrowserError);
    await expect(
      salvaTelefonoBrowser(venueId, { ...DATI, server: "https://sip.esempio.test/ws" }),
    ).rejects.toThrow(/wss:\/\//);
  });

  it("senza tutti e tre i dati non è pronto", async () => {
    expect((await salvaTelefonoBrowser(venueId, { server: DATI.server })).pronto).toBe(false);
    expect((await salvaTelefonoBrowser(venueId, { utente: DATI.utente })).pronto).toBe(false);
    expect((await salvaTelefonoBrowser(venueId, { password: DATI.password })).pronto).toBe(true);
  });

  it("senza chiave di cifratura si salva in chiaro, e lo dice", async () => {
    /* Non è una scorciatoia nascosta: è la stessa scelta della password del
       Wi-Fi. Rifiutare vorrebbe dire che un locale non può rispondere al
       telefono finché non si configura una chiave. */
    delete process.env.CHIAVE_CIFRATURA;
    const stato = await salvaTelefonoBrowser(venueId, DATI);
    expect(stato.pronto).toBe(true);
    expect(stato.sottoChiave).toBe(false);
    // e resta leggibile, che è il punto da dichiarare
    expect((await credenzialiTelefonoBrowser(venueId))?.password).toBe(DATI.password);
  });
});
