import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { componiLicenza, testoDaFirmare, type ContenutoLicenza } from "@/lib/licenza-centralino";
import { statoCentralino } from "@/server/licenza-centralino";
import { localiConServizi } from "@/server/admin/servizi";

/**
 * Chi ha il telefono acceso, e chi lo accende.
 *
 * Per un giorno c'e stato un interruttore nel pannello di Tavolo. E stato
 * togliuto, e queste prove difendono la ragione: **in questo prodotto Tavolo
 * non si configura.** Nasce col telefono spento, e ad accenderlo e una chiave
 * firmata che solo ilmiocentralino puo fabbricare — una cosa che non si
 * falsifica, al contrario di un booleano che chiunque arrivi al database si
 * gira da solo.
 *
 * Quello che non deve succedere:
 *
 * - una **chiave scaduta** che in elenco sembra un telefono acceso;
 * - una riga scritta a mano nel database che accende qualcosa;
 * - un elenco che mostra solo i locali col telefono, e quindi non risponde
 *   alla domanda «a chi lo accendo?».
 */

const db = new PrismaClient();
const PREFISSO = "test-servizi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const nostra = generateKeyPairSync("ed25519");
const PUBBLICA = nostra.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const impostore = generateKeyPairSync("ed25519");
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

function chiavePer(
  venueId: string,
  opzioni: { scadenza?: string; conChiave?: import("node:crypto").KeyObject } = {},
): string {
  const contenuto: ContenutoLicenza = {
    v: 1,
    l: venueId,
    n: "Locale di prova",
    ...(opzioni.scadenza ? { e: opzioni.scadenza } : {}),
  };
  const firma = sign(
    null,
    Buffer.from(testoDaFirmare(contenuto), "utf8"),
    opzioni.conChiave ?? nostra.privateKey,
  ).toString("base64url");
  return componiLicenza(contenuto, firma);
}

let venueId = "";
let orgId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  venueId = (await db.venue.create({ data: { orgId, name: "Nomad di prova", slug: unico } })).id;
});

beforeEach(async () => {
  process.env.CENTRALINO_CHIAVE_PUBBLICA = PUBBLICA;
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
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

describe("cosa accende il telefono", () => {
  it("nasce spento", async () => {
    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(false);
    expect(stato.origine).toBeNull();
  });

  it("la chiave firmata lo accende, e si vede che viene da lì", async () => {
    await db.venue.update({
      where: { id: venueId },
      data: { phoneLicenseKey: chiavePer(venueId), phoneLicenseActivatedAt: new Date() },
    });
    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(true);
    expect(stato.origine).toBe("chiave");
  });

  it("una chiave di un altro non accende niente", async () => {
    /* La prova che conta non e «una chiave buona funziona» — quella funziona
       sempre — ma «una chiave che *sembra* buona viene rifiutata». */
    await db.venue.update({
      where: { id: venueId },
      data: {
        phoneLicenseKey: chiavePer(venueId, { conChiave: impostore.privateKey }),
        phoneLicenseActivatedAt: new Date(),
      },
    });
    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(false);
    expect(stato.motivoSpento).toBe("non_piu_valida");
  });

  it("una chiave scaduta non accende, e lo dice in un modo diverso", async () => {
    await db.venue.update({
      where: { id: venueId },
      data: {
        phoneLicenseKey: chiavePer(venueId, { scadenza: "2020-01-01" }),
        phoneLicenseActivatedAt: new Date(),
      },
    });
    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(false);
    /* «Ce l'avevi e adesso no» e diverso da «non l'hai mai comprato»: sono due
       schermate diverse, la prima spiega e la seconda offre. */
    expect(stato.motivoSpento).toBe("scaduta");
  });
});

describe("l'elenco del pannello", () => {
  it("mostra tutti i locali, non solo quelli col telefono", async () => {
    /* La domanda di quella schermata e «a chi lo accendo?», e un elenco dei
       soli accesi non la puo rispondere. */
    const elenco = await localiConServizi();
    expect(elenco.some((l) => l.venueId === venueId)).toBe(true);
  });

  it("dice «ha una chiave», non «attivo»", async () => {
    /* La firma non si riverifica riga per riga su una schermata che elenca
       tutti i locali: dichiararlo acceso farebbe passare una chiave scaduta per
       un telefono che funziona. */
    await db.venue.update({
      where: { id: venueId },
      data: {
        phoneLicenseKey: chiavePer(venueId, { scadenza: "2020-01-01" }),
        phoneLicenseActivatedAt: new Date(),
      },
    });
    const riga = (await localiConServizi()).find((l) => l.venueId === venueId);
    expect(riga?.centralino.haChiave).toBe(true);
    expect(riga?.centralino.attivo).toBe(false);
  });
});
