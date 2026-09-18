import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { LineaError, assegnaLinea } from "@/server/admin/linee";
import {
  CentralinoRemotoError,
  configurato,
  scordaSessione,
} from "@/server/admin/centralino-remoto";
import { dichiaraNumeri } from "@/server/voice/numeri-linea";

/**
 * Assegnare a un locale il numero a cui fara deviare le telefonate, **dal
 * pannello di Tavolo**.
 *
 * Il numero non e del ristoratore: e nostro, e sta nel centralino insieme al
 * trunk che lo consegna. Fino a ieri il gesto si faceva aprendo il secondo
 * gestionale.
 *
 * Quello che questi test difendono e l'**ordine dei due gesti**: prima il
 * centralino, poi Tavolo. Se l'assegnazione la` non riesce, qui non deve
 * comparire niente — un numero mostrato nella procedura di collegamento viene
 * dettato all'operatore telefonico, e una deviazione verso un numero che
 * nessuno riceve e un ristorante che perde le telefonate senza capire perche.
 *
 * E la forma del numero: quella che vale e **quella normalizzata dal
 * centralino**, perche e lui che lo deve riconoscere quando la chiamata entra.
 */

const db = new PrismaClient();
const PREFISSO = "test-linee-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const originali = {
  url: process.env.CENTRALINO_URL,
  utente: process.env.CENTRALINO_UTENTE,
  password: process.env.CENTRALINO_PASSWORD,
};
const fetchOriginale = globalThis.fetch;

let venueId = "";
let orgId = "";
const TENANT = "tenant-di-prova";

function collegamentoConfigurato() {
  process.env.CENTRALINO_URL = "https://centralino.test";
  process.env.CENTRALINO_UTENTE = "servizio@blackfoxmedia.test";
  process.env.CENTRALINO_PASSWORD = "non-e-una-password-vera";
}

/** Il centralino finto: un accesso, e poi le risposte che gli si danno. */
function centralinoFinto(risposte: { stato: number; corpo?: unknown }[]) {
  const chiamate: { url: string; opzioni: RequestInit }[] = [];
  let i = 0;
  globalThis.fetch = vi.fn(async (u: unknown, o?: RequestInit) => {
    const indirizzo = String(u);
    chiamate.push({ url: indirizzo, opzioni: o ?? {} });
    if (indirizzo.endsWith("/api/v1/auth/login")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: "token-di-prova", expiresInSeconds: 600 }),
      } as Response;
    }
    const r = risposte[Math.min(i++, risposte.length - 1)];
    return {
      ok: r.stato >= 200 && r.stato < 300,
      status: r.stato,
      json: async () => r.corpo ?? {},
      text: async () => JSON.stringify(r.corpo ?? {}),
    } as Response;
  }) as never;
  return chiamate;
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  venueId = (await db.venue.create({ data: { orgId, name: "Locale di prova", slug: unico } })).id;
});

beforeEach(async () => {
  scordaSessione();
  delete process.env.CENTRALINO_URL;
  delete process.env.CENTRALINO_UTENTE;
  delete process.env.CENTRALINO_PASSWORD;
  await db.voiceNumber.deleteMany({ where: { venueId } });
  await db.venue.update({ where: { id: venueId }, data: { centralinoTenantId: null } });
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  vi.restoreAllMocks();
  for (const [chiave, valore] of [
    ["CENTRALINO_URL", originali.url],
    ["CENTRALINO_UTENTE", originali.utente],
    ["CENTRALINO_PASSWORD", originali.password],
  ] as const) {
    if (valore === undefined) delete process.env[chiave];
    else process.env[chiave] = valore;
  }
});

afterAll(async () => {
  await db.voiceNumber.deleteMany({ where: { venueId } });
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

describe("quando non si può fare, non si fa e si dice perché", () => {
  it("senza collegamento configurato non scrive niente", async () => {
    expect(configurato()).toBe(false);
    await expect(assegnaLinea(venueId, { numero: "0110000031" })).rejects.toThrow(LineaError);
    expect(await db.voiceNumber.count({ where: { venueId } })).toBe(0);
  });

  it("un indirizzo http non conta come configurato: qui viaggiano credenziali", () => {
    process.env.CENTRALINO_URL = "http://centralino.test";
    process.env.CENTRALINO_UTENTE = "x@y.test";
    process.env.CENTRALINO_PASSWORD = "z";
    expect(configurato()).toBe(false);
  });

  it("se il centralino non si è presentato non si indovina il cliente", async () => {
    /* Assegnare al cliente sbagliato manda le telefonate di un ristorante nel
       gestionale di un altro: si rifiuta invece di provare col nome. */
    collegamentoConfigurato();
    const chiamate = centralinoFinto([{ stato: 201 }]);
    await expect(assegnaLinea(venueId, { numero: "0110000032" })).rejects.toThrow(
      /non si è ancora presentato/,
    );
    expect(chiamate).toHaveLength(0);
    expect(await db.voiceNumber.count({ where: { venueId } })).toBe(0);
  });
});

describe("l'assegnazione", () => {
  beforeEach(async () => {
    collegamentoConfigurato();
    await db.venue.update({ where: { id: venueId }, data: { centralinoTenantId: TENANT } });
  });

  it("chiede al centralino, e poi scrive la forma che lui ha riconosciuto", async () => {
    const chiamate = centralinoFinto([
      { stato: 201, corpo: { ok: true, numero: { e164: "+390110000033" } } },
    ]);

    const esito = await assegnaLinea(venueId, { numero: "011 0000033", etichetta: "Il menu" });
    expect(esito.numero).toBe("+390110000033");

    // Prima l'accesso, poi l'assegnazione sul cliente giusto.
    expect(chiamate[0].url).toBe("https://centralino.test/api/v1/auth/login");
    expect(chiamate[1].url).toBe(
      `https://centralino.test/api/v1/piattaforma/clienti/${TENANT}/numeri`,
    );
    expect(JSON.parse(String(chiamate[1].opzioni.body))).toEqual({
      numero: "011 0000033",
      etichetta: "Il menu",
    });

    /* La riga locale porta il numero **del centralino**, non quello digitato:
       e quella la forma che riconoscera quando la chiamata entra. */
    const riga = await db.voiceNumber.findFirstOrThrow({ where: { venueId } });
    expect(riga.numeroEsterno).toBe("+390110000033");
    expect(riga.attivo).toBe(true);
  });

  it("se il centralino rifiuta, in Tavolo non compare nessun numero", async () => {
    /* L'ordine dei due gesti e tutto: un numero che compare qui viene dettato
       all'operatore, e se la` non esiste il ristorante perde le telefonate. */
    centralinoFinto([
      {
        stato: 409,
        corpo: { error: { code: "NUMERO_OCCUPATO", message: "Il numero è già di un altro." } },
      },
    ]);
    await expect(assegnaLinea(venueId, { numero: "0110000034" })).rejects.toThrow(
      CentralinoRemotoError,
    );
    expect(await db.voiceNumber.count({ where: { venueId } })).toBe(0);
  });

  it("il messaggio del centralino arriva a chi ha premuto", async () => {
    centralinoFinto([
      { stato: 400, corpo: { error: { message: "Questo non è un numero componibile." } } },
    ]);
    await expect(assegnaLinea(venueId, { numero: "pippo" })).rejects.toThrow(
      /non è un numero componibile/,
    );
  });

  it("un 404 di piattaforma vuol dire «non ti riconosco», non «cliente assente»", async () => {
    /* Le rotte di piattaforma rispondono 404 a chi non e amministratore: non
       raccontano la propria esistenza. Tradurlo in «cliente non trovato»
       manderebbe a cercare la cosa sbagliata. */
    centralinoFinto([{ stato: 404, corpo: {} }]);
    await expect(assegnaLinea(venueId, { numero: "0110000035" })).rejects.toThrow(
      /non ci riconosce come amministratori/,
    );
  });

  it("l'accesso non si rifà a ogni assegnazione", async () => {
    const chiamate = centralinoFinto([
      { stato: 201, corpo: { ok: true, numero: { e164: "+390110000036" } } },
      { stato: 201, corpo: { ok: true, numero: { e164: "+390110000037" } } },
    ]);
    await assegnaLinea(venueId, { numero: "0110000036" });
    await assegnaLinea(venueId, { numero: "0110000037" });

    const accessi = chiamate.filter((c) => c.url.endsWith("/auth/login"));
    expect(accessi).toHaveLength(1);
    // E il secondo numero non spegne il primo: sono due linee dello stesso locale.
    expect(await db.voiceNumber.count({ where: { venueId, attivo: true } })).toBe(2);
  });
});

describe("chi è questo locale nel centralino", () => {
  it("lo impara da chi dichiara le linee", async () => {
    expect(
      (await db.venue.findUniqueOrThrow({ where: { id: venueId } })).centralinoTenantId,
    ).toBeNull();

    await dichiaraNumeri(venueId, "blackfox", {
      tenant: TENANT,
      numeri: [{ numero: "+390110000038" }],
    });

    expect(
      (await db.venue.findUniqueOrThrow({ where: { id: venueId } })).centralinoTenantId,
    ).toBe(TENANT);
  });

  it("non lo dimentica se una dichiarazione arriva senza", async () => {
    /* Un fornitore che smette di mandarlo non ci fa dimenticare a chi
       appartiene il locale la` dentro. */
    await dichiaraNumeri(venueId, "blackfox", { tenant: TENANT, numeri: [] });
    await dichiaraNumeri(venueId, "blackfox", { numeri: [] });
    expect(
      (await db.venue.findUniqueOrThrow({ where: { id: venueId } })).centralinoTenantId,
    ).toBe(TENANT);
  });
});
