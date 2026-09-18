import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OPERATORI } from "@/lib/operatori-telefonici";
import { salvaIngresso, vistaIngresso } from "@/server/voice/ingresso";
import { MAX_RIMANDI, chiediRimando } from "@/server/voice/rimando";

/**
 * Da dove entrano le chiamate, e il cerchio.
 *
 * Due strade: la scatoletta attaccata alla linea, e la deviazione che
 * l'operatore telefonico imposta sulla SIM del locale. La seconda esiste
 * perche a una SIM non si attacca nessuna scatoletta — ed e quella che usa il
 * ristorante che paga il concorrente.
 *
 * Quello che questi test difendono non e il salvataggio: e **quello che non
 * deve succedere**.
 *
 * - una spunta verde sulla prova della deviazione messa da una telefonata
 *   arrivata **prima** che la deviazione fosse chiesta: direbbe «funziona» di
 *   una cosa che nessuno ha attivato;
 * - la stessa spunta che **sparisce** per un salvataggio che non ha cambiato
 *   niente, mandando a richiamare l'operatore per un problema che non c'e;
 * - una chiamata che gira per sempre fra il locale occupato e noi;
 * - istruzioni per la SIM che nessuno ha provato.
 */

const db = new PrismaClient();
const PREFISSO = "test-ingresso-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";

/**
 * L'orologio della prova, fisso.
 *
 * Le date di questa funzione si confrontano fra loro al millisecondo: con
 * `new Date()` dentro ogni chiamata, due salvataggi di seguito cadono nello
 * stesso istante e la prova che deve diventare rossa resta verde per caso.
 */
const T0 = new Date("2026-09-18T18:00:00.000Z").getTime();

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;
});

afterAll(async () => {
  await db.phoneCall.deleteMany({ where: { venueId } });
  await db.voiceConfiguration.deleteMany({ where: { venueId } });
  await db.voiceNumber.deleteMany({ where: { venueId } });
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

beforeEach(async () => {
  await db.phoneCall.deleteMany({ where: { venueId } });
  await db.voiceConfiguration.deleteMany({ where: { venueId } });
  await db.voiceNumber.deleteMany({ where: { venueId } });
});

/** Una chiamata arrivata in un certo momento. */
async function chiamataIl(quando: Date, externalId = `c-${Date.now()}-${Math.random()}`) {
  return db.phoneCall.create({
    data: { venueId, externalId, startedAt: quando, status: "MISSED" },
  });
}

describe("la scelta della strada", () => {
  it("si salva da sola, senza pretendere il numero", async () => {
    /* La prima domanda della procedura si risponde con un clic: pretendere il
       numero qui rimetterebbe un modulo davanti a una scelta. */
    const vista = await salvaIngresso(venueId, { ingresso: "DEVIAZIONE" });
    expect(vista.ingresso).toBe("DEVIAZIONE");
    expect(vista.numeroPubblico).toBeNull();
    expect(vista.provata).toBe(false);
  });

  it("parte da «non scelto», e non da una strada indovinata", async () => {
    const vista = await vistaIngresso(venueId);
    expect(vista.ingresso).toBeNull();
  });

  it("la scatoletta cancella quello che riguarda solo la deviazione", async () => {
    await salvaIngresso(venueId, {
      ingresso: "DEVIAZIONE",
      numeroPubblico: "3471234567",
      operatore: "tim",
      squilliChiesti: 4,
    });
    const vista = await salvaIngresso(venueId, { ingresso: "GATEWAY" });
    expect(vista.operatore).toBeNull();
    expect(vista.squilliChiesti).toBeNull();
    expect(vista.chiestaIl).toBeNull();
  });

  it("scrive il numero in forma internazionale", async () => {
    const vista = await salvaIngresso(venueId, {
      ingresso: "DEVIAZIONE",
      numeroPubblico: "347 123 4567",
    });
    expect(vista.numeroPubblico).toBe("+393471234567");
  });

  it("rifiuta un operatore che non è nell'elenco", async () => {
    await expect(
      salvaIngresso(venueId, { ingresso: "DEVIAZIONE", operatore: "operatore-inventato" }),
    ).rejects.toThrow();
  });

  it("mostra il numero a cui deviare solo quando gliene abbiamo assegnato uno", async () => {
    expect((await vistaIngresso(venueId)).numeroTavolo).toBeNull();
    await db.voiceNumber.create({
      data: { venueId, fornitore: "blackfox", numeroEsterno: "+390110000001" },
    });
    expect((await vistaIngresso(venueId)).numeroTavolo).toBe("+390110000001");
  });
});

describe("la prova della deviazione", () => {
  it("una telefonata di prima non la prova", async () => {
    await chiamataIl(new Date(T0 - 60 * 60_000));
    const vista = await salvaIngresso(
      venueId,
      { ingresso: "DEVIAZIONE", numeroPubblico: "3471234567", operatore: "tim" },
      undefined,
      new Date(T0),
    );
    // C'è una chiamata, e la prova resta rossa: era arrivata da un'altra strada.
    expect(vista.ultimaChiamata).not.toBeNull();
    expect(vista.provata).toBe(false);
  });

  it("una telefonata dopo la richiesta la prova", async () => {
    await salvaIngresso(
      venueId,
      { ingresso: "DEVIAZIONE", numeroPubblico: "3471234567", operatore: "tim" },
      undefined,
      new Date(T0),
    );
    await chiamataIl(new Date(T0 + 5 * 60_000));
    expect((await vistaIngresso(venueId)).provata).toBe(true);
  });

  it("salvare due volte la stessa cosa non spegne la spunta", async () => {
    const dati = {
      ingresso: "DEVIAZIONE" as const,
      numeroPubblico: "3471234567",
      operatore: "tim",
      squilliChiesti: 4,
    };
    await salvaIngresso(venueId, dati, undefined, new Date(T0));
    await chiamataIl(new Date(T0 + 5 * 60_000));
    expect((await vistaIngresso(venueId)).provata).toBe(true);

    /* La prova che poteva diventare rossa: con la data riscritta a ogni
       salvataggio, qui `provata` tornava falsa e il ristoratore andava a
       richiamare l'operatore per niente. L'orologio e dieci minuti dopo, cioe
       il caso vero: si rientra nella schermata e si risalva. */
    const dopo = await salvaIngresso(venueId, dati, undefined, new Date(T0 + 10 * 60_000));
    expect(dopo.provata).toBe(true);
  });

  it("cambiare operatore o numero spegne la spunta, perché la richiesta è un'altra", async () => {
    await salvaIngresso(
      venueId,
      { ingresso: "DEVIAZIONE", numeroPubblico: "3471234567", operatore: "tim" },
      undefined,
      new Date(T0),
    );
    await chiamataIl(new Date(T0 + 5 * 60_000));
    expect((await vistaIngresso(venueId)).provata).toBe(true);

    const dopo = await salvaIngresso(
      venueId,
      { ingresso: "DEVIAZIONE", numeroPubblico: "3471234567", operatore: "vodafone" },
      undefined,
      new Date(T0 + 10 * 60_000),
    );
    expect(dopo.provata).toBe(false);
  });
});

describe("il cerchio dei rimandi", () => {
  beforeEach(async () => {
    await salvaIngresso(venueId, {
      ingresso: "DEVIAZIONE",
      numeroPubblico: "3471234567",
      operatore: "tim",
    });
  });

  it("la prima volta si rimanda, e si dice a quale numero", async () => {
    const chiamata = await chiamataIl(new Date(), "giro-1");
    const esito = await chiediRimando(venueId, chiamata.externalId);
    expect(esito).toEqual({ rimanda: true, numero: "+393471234567" });
  });

  it("la seconda no, e il motivo si dice", async () => {
    const chiamata = await chiamataIl(new Date(), "giro-2");
    await chiediRimando(venueId, chiamata.externalId);
    expect(await chiediRimando(venueId, chiamata.externalId)).toEqual({
      rimanda: false,
      motivo: "gia_rimandata",
    });
  });

  it("due richieste insieme: una sola passa", async () => {
    /* Il caso che un `if` prima della scrittura non copre: due eventi che
       arrivano nello stesso istante lo passerebbero entrambi, e la chiamata
       partirebbe due volte. La condizione sta dentro l'UPDATE. */
    const chiamata = await chiamataIl(new Date(), "giro-3");
    const esiti = await Promise.all([
      chiediRimando(venueId, chiamata.externalId),
      chiediRimando(venueId, chiamata.externalId),
    ]);
    expect(esiti.filter((e) => e.rimanda)).toHaveLength(1);
    const riga = await db.phoneCall.findUniqueOrThrow({ where: { id: chiamata.id } });
    expect(riga.rimandi).toBe(MAX_RIMANDI);
  });

  it("una chiamata che non conosciamo non si rimanda", async () => {
    expect(await chiediRimando(venueId, "mai-vista")).toEqual({
      rimanda: false,
      motivo: "chiamata_sconosciuta",
    });
  });

  it("senza un numero non si manda la chiamata nel vuoto", async () => {
    await db.voiceConfiguration.update({
      where: { venueId },
      data: { numeroPubblico: null, numeroInoltro: null },
    });
    const chiamata = await chiamataIl(new Date(), "giro-4");
    expect(await chiediRimando(venueId, chiamata.externalId)).toEqual({
      rimanda: false,
      motivo: "nessun_numero",
    });
  });

  it("il numero scelto per i rimandi vince su quello pubblico", async () => {
    await db.voiceConfiguration.update({
      where: { venueId },
      data: { numeroInoltro: "+390110000009" },
    });
    const chiamata = await chiamataIl(new Date(), "giro-5");
    expect(await chiediRimando(venueId, chiamata.externalId)).toEqual({
      rimanda: true,
      numero: "+390110000009",
    });
  });
});

describe("le istruzioni per la SIM", () => {
  it("nessun operatore porta istruzioni che non sono state provate", () => {
    /* La regola del file, resa una prova: il giorno che qualcuno scrive dei
       passi senza averli provati con una SIM, questo diventa rosso. Un codice
       sbagliato non fa perdere le nostre chiamate: fa perdere le sue. */
    for (const o of OPERATORI) {
      expect(!!o.istruzioni).toBe(o.provato);
    }
  });

  it("gli identificativi sono unici", () => {
    expect(new Set(OPERATORI.map((o) => o.id)).size).toBe(OPERATORI.length);
  });
});
