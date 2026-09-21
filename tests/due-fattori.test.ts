import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { codicePerPasso, passoDi } from "@/lib/totp";
import { decifra } from "@/lib/cifratura";
import {
  CODICI_RECUPERO,
  DueFattoriError,
  confermaDueFattori,
  iniziaDueFattori,
  spegniDueFattori,
  statoDueFattori,
  verificaSecondoFattore,
} from "@/server/due-fattori";

/**
 * L'accesso in due passi, dal lato che tocca il database.
 *
 * `totpEnabled`, `totpSecret` e `recoveryCodesHash` stavano nello schema dal
 * principio e nessuno li leggeva: una difesa dichiarata e mai messa. Le prove
 * guardano le cose che, sbagliate, la rendono **finta** — un codice che vale
 * due volte, un codice di recupero che ne apre due accessi, uno spegnimento
 * che non chiede niente.
 */

const db = new PrismaClient();
const PREFISSO = "test-due-fattori-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let userId = "";

async function utente() {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      totpEnabled: true,
      totpSecret: true,
      totpUltimoPasso: true,
      recoveryCodesHash: true,
    },
  });
}

/** Il codice giusto in questo istante, letto dal segreto salvato. */
async function codiceValido() {
  const u = await utente();
  return codicePerPasso(decifra(u.totpSecret)!, passoDi(new Date()));
}

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: `${PREFISSO}${Date.now()}@test.local`,
      passwordHash: await bcrypt.hash("password-di-prova", 10),
      name: "Prova",
    },
  });
  userId = u.id;
}, 60_000);

afterEach(async () => {
  await db.user.update({
    where: { id: userId },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpUltimoPasso: null,
      recoveryCodesHash: [],
    },
  });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("accendere i due fattori", () => {
  it("il primo passo non accende niente", async () => {
    /**
     * Se accendesse subito, chi ha sbagliato a inquadrare il QR resterebbe
     * chiuso fuori e per rientrare servirebbe un amministratore. Il segreto
     * nasce spento e si accende **col primo codice giusto**.
     */
    const { segreto, indirizzo } = await iniziaDueFattori(userId);
    expect(segreto).toMatch(/^[A-Z2-7]{32}$/);
    expect(indirizzo).toContain("otpauth://totp/");

    const stato = await statoDueFattori(userId);
    expect(stato).toMatchObject({ attivo: false, inAttesa: true, codiciRimasti: 0 });
  });

  it("il segreto in database non è quello mostrato a schermo", async () => {
    /* Cifrato a riposo: chi legge il database non deve poter generare i codici
       di nessuno. Senza `CHIAVE_CIFRATURA` resta in chiaro col prefisso
       dichiarato, e lo stato lo dice invece di tacere. */
    const { segreto } = await iniziaDueFattori(userId);
    const u = await utente();
    expect(u.totpSecret).not.toBe(segreto);
    expect(decifra(u.totpSecret)).toBe(segreto);
  });

  it("il codice giusto accende e consegna i codici di recupero, una volta sola", async () => {
    await iniziaDueFattori(userId);
    const { codiciRecupero } = await confermaDueFattori(userId, await codiceValido());

    expect(codiciRecupero).toHaveLength(CODICI_RECUPERO);
    /* Leggibili ad alta voce: nessuna lettera che si confonda con un numero. */
    for (const c of codiciRecupero) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);

    const stato = await statoDueFattori(userId);
    expect(stato).toMatchObject({ attivo: true, codiciRimasti: CODICI_RECUPERO });

    // In database solo le impronte: nessun percorso li restituisce.
    const u = await utente();
    for (const c of codiciRecupero) expect(u.recoveryCodesHash).not.toContain(c);
  });

  it("un codice sbagliato non accende", async () => {
    await iniziaDueFattori(userId);
    await expect(confermaDueFattori(userId, "000000")).rejects.toBeInstanceOf(DueFattoriError);
    expect((await statoDueFattori(userId)).attivo).toBe(false);
  });

  it("confermare senza aver cominciato non si può", async () => {
    await expect(confermaDueFattori(userId, "123456")).rejects.toMatchObject({
      code: "non_iniziato",
    });
  });
});

describe("entrare col secondo fattore", () => {
  it("il codice dell'app vale una volta, e una sola", async () => {
    /**
     * È la parte che lo standard lascia a chi lo implementa: senza, un codice
     * visto passare — su una spalla, in una schermata condivisa — resta valido
     * per altri novanta secondi.
     */
    await iniziaDueFattori(userId);
    await confermaDueFattori(userId, await codiceValido());

    /* Il codice usato per accendere è già bruciato: si prende quello del passo
       successivo, come farebbe un'app trenta secondi dopo. */
    const u = await utente();
    const dopo = codicePerPasso(decifra(u.totpSecret)!, passoDi(new Date()) + 1);

    expect(await verificaSecondoFattore(await utente(), dopo)).toEqual({
      ok: true,
      usato: "codice",
    });
    expect(await verificaSecondoFattore(await utente(), dopo)).toMatchObject({ ok: false });
  });

  it("un codice di recupero apre un accesso solo, e poi è consumato", async () => {
    await iniziaDueFattori(userId);
    const { codiciRecupero } = await confermaDueFattori(userId, await codiceValido());
    const uno = codiciRecupero[0]!;

    expect(await verificaSecondoFattore(await utente(), uno)).toEqual({
      ok: true,
      usato: "recupero",
    });
    expect((await statoDueFattori(userId)).codiciRimasti).toBe(CODICI_RECUPERO - 1);

    expect(await verificaSecondoFattore(await utente(), uno)).toMatchObject({ ok: false });
  });

  it("due accessi con lo stesso codice di recupero non passano entrambi", async () => {
    /**
     * La condizione sta **dentro** la scrittura: due richieste in parallelo
     * leggono entrambe «c'è», e con un `if (c'è) allora (togli)` passerebbero
     * tutte e due. Con `updateMany` la valuta Postgres, e una sola trova
     * l'impronta da togliere.
     */
    await iniziaDueFattori(userId);
    const { codiciRecupero } = await confermaDueFattori(userId, await codiceValido());
    const uno = codiciRecupero[0]!;

    const u = await utente();
    const esiti = await Promise.all([
      verificaSecondoFattore(u, uno),
      verificaSecondoFattore(u, uno),
    ]);
    expect(esiti.filter((e) => e.ok)).toHaveLength(1);
    expect((await statoDueFattori(userId)).codiciRimasti).toBe(CODICI_RECUPERO - 1);
  });

  it("senza codice si dice «manca», non «sbagliato»", async () => {
    /* Sono due schermate diverse: «serve il codice» e «il codice è sbagliato».
       Confonderle manda chi ha i due fattori a cambiare una password che va
       benissimo. */
    await iniziaDueFattori(userId);
    await confermaDueFattori(userId, await codiceValido());
    expect(await verificaSecondoFattore(await utente(), "")).toEqual({
      ok: false,
      perche: "mancante",
    });
    expect(await verificaSecondoFattore(await utente(), "   ")).toMatchObject({
      perche: "mancante",
    });
  });
});

describe("i codici di recupero si ribattono a mano", () => {
  it("valgono anche senza trattini, in minuscolo o con spazi", async () => {
    /**
     * Il difetto che avevo scritto io: l'impronta si calcolava **con** i
     * trattini e il confronto **senza**, quindi nessun codice di recupero
     * funzionava. Due forme per la stessa cosa, in due punti diversi.
     *
     * Un codice si detta al telefono e si ribatte a mano: maiuscole, spazi e
     * trattini non devono contare.
     */
    await iniziaDueFattori(userId);
    const { codiciRecupero } = await confermaDueFattori(userId, await codiceValido());

    const senzaTrattini = codiciRecupero[2]!.replace(/-/g, "");
    expect(await verificaSecondoFattore(await utente(), senzaTrattini)).toMatchObject({ ok: true });

    const minuscolo = codiciRecupero[3]!.toLowerCase();
    expect(await verificaSecondoFattore(await utente(), minuscolo)).toMatchObject({ ok: true });

    const conSpazi = codiciRecupero[4]!.replace(/-/g, " ");
    expect(await verificaSecondoFattore(await utente(), conSpazi)).toMatchObject({ ok: true });

    expect((await statoDueFattori(userId)).codiciRimasti).toBe(CODICI_RECUPERO - 3);
  });
});

describe("spegnere i due fattori", () => {
  it("chiede un codice: una sessione rubata non basta", async () => {
    /**
     * Un tablet dimenticato in sala è dentro. Se spegnere non chiedesse
     * niente, quel tablet toglierebbe la protezione senza sapere nulla del
     * telefono — e i due fattori proteggerebbero solo chi non è già entrato.
     */
    await iniziaDueFattori(userId);
    await confermaDueFattori(userId, await codiceValido());

    await expect(spegniDueFattori(userId, "000000")).rejects.toMatchObject({
      code: "codice_non_valido",
    });
    expect((await statoDueFattori(userId)).attivo).toBe(true);
  });

  it("con un codice di recupero si spegne, e non resta niente in giro", async () => {
    await iniziaDueFattori(userId);
    const { codiciRecupero } = await confermaDueFattori(userId, await codiceValido());

    await spegniDueFattori(userId, codiciRecupero[1]!);

    const stato = await statoDueFattori(userId);
    expect(stato).toMatchObject({ attivo: false, inAttesa: false, codiciRimasti: 0 });
    const u = await utente();
    expect(u.totpSecret).toBeNull();
    expect(u.totpUltimoPasso).toBeNull();
  });

  it("spegnere quando non è accesso non si può", async () => {
    await expect(spegniDueFattori(userId, "123456")).rejects.toMatchObject({
      code: "non_attivo",
    });
  });
});
