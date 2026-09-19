import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { componiLicenza, testoDaFirmare, type ContenutoLicenza } from "@/lib/licenza-centralino";
import {
  applicaRevoca,
  attivaCentralino,
  statoCentralino,
  LicenzaError,
} from "@/server/licenza-centralino";

/**
 * Accendere e **spegnere** il telefono di un locale da remoto.
 *
 * In questo prodotto Tavolo non si configura: nasce col telefono spento, e ad
 * accenderlo e una chiave firmata che solo ilmiocentralino puo fabbricare.
 * Spegnere e un comando come accendere — e quindi va firmato allo stesso modo:
 * una richiesta non firmata sarebbe un modo per spegnere il telefono di un
 * concorrente il sabato sera.
 *
 * Quello che questi test difendono e **quello che non deve succedere**:
 *
 * - una revoca che, letta come licenza, **accende** il telefono col comando
 *   che serve a spegnerlo (e il verso opposto: una licenza che spegne);
 * - una revoca di giugno riapplicata a settembre che spegne un cliente
 *   riattivato nel frattempo — la firma non scade, quindi un messaggio di
 *   spegnimento resta valido per sempre;
 * - una chiave o una revoca di un altro locale che tocca questo;
 * - una firma di un impostore che passa per buona.
 */

const db = new PrismaClient();
const PREFISSO = "test-licenza-remota-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/** La nostra coppia, e quella di chi prova a fabbricare comandi. */
const nostra = generateKeyPairSync("ed25519");
const impostore = generateKeyPairSync("ed25519");
const PUBBLICA = nostra.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

function giorno(d: Date) {
  return d.toISOString().slice(0, 10);
}

function firma(contenuto: ContenutoLicenza, chiave = nostra.privateKey) {
  const f = sign(null, Buffer.from(testoDaFirmare(contenuto), "utf8"), chiave).toString("base64url");
  return componiLicenza(contenuto, f);
}

const OGGI = new Date();

let venueId = "";
let altroId = "";
let orgId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  venueId = (await db.venue.create({ data: { orgId, name: "Locale A", slug: `${unico}-a` } })).id;
  altroId = (await db.venue.create({ data: { orgId, name: "Locale B", slug: `${unico}-b` } })).id;
});

beforeEach(async () => {
  process.env.CENTRALINO_CHIAVE_PUBBLICA = PUBBLICA;
  for (const id of [venueId, altroId]) {
    await db.venue.update({
      where: { id },
      data: {
        phoneLicenseKey: null,
        phoneLicenseActivatedAt: null,
        phoneLicenseExpiresAt: null,
        phoneLicenseFeatures: [],
      },
    });
  }
});

afterEach(() => {
  if (originale === undefined) delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
  else process.env.CENTRALINO_CHIAVE_PUBBLICA = originale;
});

afterAll(async () => {
  await db.venue.deleteMany({ where: { orgId } });
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

describe("accendere da remoto", () => {
  it("una chiave firmata accende, senza che nessuno incolli niente", async () => {
    await attivaCentralino(venueId, firma({ v: 1, l: venueId, n: "Locale A", d: giorno(OGGI) }));
    const stato = await statoCentralino(venueId);
    expect(stato.attivo).toBe(true);
    expect(stato.origine).toBe("chiave");
  });

  it("una chiave di un impostore non accende", async () => {
    await expect(
      attivaCentralino(venueId, firma({ v: 1, l: venueId }, impostore.privateKey)),
    ).rejects.toThrow(LicenzaError);
    expect((await statoCentralino(venueId)).attivo).toBe(false);
  });
});

describe("la revoca", () => {
  async function accendi(quando = OGGI) {
    await attivaCentralino(
      venueId,
      firma({ v: 1, l: venueId, n: "Locale A", d: giorno(quando) }),
      quando,
    );
  }

  it("spegne subito", async () => {
    await accendi();
    expect((await statoCentralino(venueId)).attivo).toBe(true);

    const esito = await applicaRevoca(firma({ v: 1, l: venueId, r: true, d: giorno(OGGI) }));
    expect(esito).toEqual({ ok: true, spento: true });
    expect((await statoCentralino(venueId)).attivo).toBe(false);
  });

  it("non cancella la storia: le prenotazioni prese al telefono restano", async () => {
    /* Spegnere toglie le funzioni, non quello che il telefono ha prodotto. */
    await accendi();
    const chiamata = await db.phoneCall.create({
      data: { venueId, externalId: `${PREFISSO}c1`, status: "ENDED", startedAt: new Date() },
    });
    await applicaRevoca(firma({ v: 1, l: venueId, r: true, d: giorno(OGGI) }));
    expect(await db.phoneCall.findUnique({ where: { id: chiamata.id } })).not.toBeNull();
    await db.phoneCall.delete({ where: { id: chiamata.id } });
  });

  it("su un locale già spento risponde bene, e dice che non c'era niente da spegnere", async () => {
    /* Un errore qui farebbe ritentare chi ha già ottenuto il risultato. */
    const esito = await applicaRevoca(firma({ v: 1, l: venueId, r: true, d: giorno(OGGI) }));
    expect(esito).toEqual({ ok: true, spento: false });
  });

  it("una revoca vecchia non spegne un locale riattivato dopo", async () => {
    /* La firma non scade: senza il confronto sulle date, la revoca di giugno
       riapplicata a settembre spegnerebbe un cliente che ha ripagato — e
       nessuno capirebbe perche. */
    const giugno = new Date(OGGI.getFullYear(), 5, 10);
    const revocaVecchia = firma({ v: 1, l: venueId, r: true, d: giorno(giugno) });

    await accendi(OGGI);
    const esito = await applicaRevoca(revocaVecchia, OGGI);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("vecchia");
    expect((await statoCentralino(venueId)).attivo).toBe(true);
  });

  it("una revoca di un impostore non spegne niente", async () => {
    await accendi();
    const esito = await applicaRevoca(
      firma({ v: 1, l: venueId, r: true, d: giorno(OGGI) }, impostore.privateKey),
    );
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("firma");
    expect((await statoCentralino(venueId)).attivo).toBe(true);
  });

  it("una revoca di un altro locale non tocca questo", async () => {
    await accendi();
    await applicaRevoca(firma({ v: 1, l: altroId, r: true, d: giorno(OGGI) }));
    expect((await statoCentralino(venueId)).attivo).toBe(true);
  });
});

describe("i due comandi non si scambiano", () => {
  it("una revoca **non accende**, nemmeno se la si manda all'accensione", async () => {
    /* E la stessa firma e lo stesso formato — cambia una parola dentro —
       quindi senza il controllo il telefono si accenderebbe col comando che
       serve a spegnerlo. */
    await expect(
      attivaCentralino(venueId, firma({ v: 1, l: venueId, r: true, d: giorno(OGGI) })),
    ).rejects.toThrow(LicenzaError);
    expect((await statoCentralino(venueId)).attivo).toBe(false);
  });

  it("una licenza **non spegne**, nemmeno se la si manda alla revoca", async () => {
    await attivaCentralino(venueId, firma({ v: 1, l: venueId, d: giorno(OGGI) }));
    const esito = await applicaRevoca(firma({ v: 1, l: venueId, d: giorno(OGGI) }));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("non_e_una_revoca");
    expect((await statoCentralino(venueId)).attivo).toBe(true);
  });
});
