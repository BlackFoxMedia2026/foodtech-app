import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  componiLicenza,
  testoDaFirmare,
  type ContenutoLicenza,
} from "@/lib/licenza-centralino";
import {
  LicenzaError,
  attivaCentralino,
  richiediFunzioneCentralino,
  spegniCentralino,
  statoCentralino,
  verificaLicenza,
} from "@/server/licenza-centralino";

/**
 * La chiave che accende il centralino, contro firme **vere**.
 *
 * Qui si generano due coppie di chiavi Ed25519: una è «la nostra» (quella di
 * miocentralino), l'altra è quella di un impostore. Serve perché la domanda
 * che conta non è «una licenza buona funziona?» — quella funziona sempre — ma
 * «una licenza che *sembra* buona viene rifiutata?». Senza la seconda coppia
 * quel controllo non si può scrivere.
 */

const db = new PrismaClient();
const PREFISSO = "test-cent-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "I test del centralino scrivono sul database. DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

/** La coppia di miocentralino, e quella di chi prova a fabbricare licenze. */
const nostra = generateKeyPairSync("ed25519");
const impostore = generateKeyPairSync("ed25519");

const PUBBLICA_NOSTRA = nostra.publicKey.export({ format: "der", type: "spki" }).toString("base64");

function firmaCon(chiave: import("node:crypto").KeyObject, contenuto: ContenutoLicenza): string {
  const firma = sign(null, Buffer.from(testoDaFirmare(contenuto), "utf8"), chiave).toString(
    "base64url",
  );
  return componiLicenza(contenuto, firma);
}

let venueA = "";
let venueB = "";
const originale = process.env.CENTRALINO_CHIAVE_PUBBLICA;

async function creaLocale(nome: string): Promise<string> {
  const unico = `${PREFISSO}${nome}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: { orgId: org.id, name: `Trattoria ${nome}`, slug: unico, timezone: "Europe/Rome" },
  });
  return v.id;
}

beforeAll(async () => {
  venueA = await creaLocale("alfa");
  venueB = await creaLocale("beta");
}, 60_000);

beforeEach(() => {
  process.env.CENTRALINO_CHIAVE_PUBBLICA = PUBBLICA_NOSTRA;
});

afterEach(() => {
  if (originale === undefined) delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
  else process.env.CENTRALINO_CHIAVE_PUBBLICA = originale;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const DOMANI = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const IERI = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("una licenza autentica", () => {
  it("accende il locale per cui è stata emessa", () => {
    const chiave = firmaCon(nostra.privateKey, { v: 1, l: venueA, n: "Trattoria alfa" });
    const esito = verificaLicenza(chiave, venueA);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.funzioni).toContain("riconoscimento");
      expect(esito.scadeIl).toBeNull();
    }
  });

  it("accende solo le funzioni che nomina", () => {
    const chiave = firmaCon(nostra.privateKey, { v: 1, l: venueA, f: ["riconoscimento"] });
    const esito = verificaLicenza(chiave, venueA);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.funzioni).toEqual(["riconoscimento"]);
      expect(esito.funzioni).not.toContain("prenotazioni");
    }
  });
});

describe("una licenza che non deve entrare", () => {
  it("firmata da un altro non entra, anche se il contenuto è giusto", () => {
    /* È la prova che regge tutto il disegno: il contenuto è identico a quello
       di una licenza buona — stesso locale, stesso formato — e cambia solo chi
       ha firmato. */
    const contenuto: ContenutoLicenza = { v: 1, l: venueA, n: "Trattoria alfa" };
    expect(verificaLicenza(firmaCon(nostra.privateKey, contenuto), venueA).ok).toBe(true);

    const falsa = verificaLicenza(firmaCon(impostore.privateKey, contenuto), venueA);
    expect(falsa.ok).toBe(false);
    if (!falsa.ok) expect(falsa.motivo).toBe("firma");
  });

  it("una licenza vera con il contenuto ritoccato non entra", () => {
    // si prende una licenza buona per B e le si cambia il locale in A: la
    // firma non copre più il contenuto
    const buona = firmaCon(nostra.privateKey, { v: 1, l: venueB });
    const [marchio, , firma] = buona.split(".");
    const corpoRitoccato = Buffer.from(JSON.stringify({ v: 1, l: venueA }), "utf8").toString(
      "base64url",
    );
    const ritoccata = `${marchio}.${corpoRitoccato}.${firma}`;

    const esito = verificaLicenza(ritoccata, venueA);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("firma");
  });

  it("la licenza di un altro locale non accende questo, e lo dice", () => {
    const diB = firmaCon(nostra.privateKey, { v: 1, l: venueB, n: "Trattoria beta" });
    const esito = verificaLicenza(diB, venueA);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.motivo).toBe("altro_locale");
      // il messaggio nomina il locale giusto: chi l'ha incollata capisce subito
      expect(esito.messaggio).toContain("Trattoria beta");
    }
  });

  it("una licenza scaduta non accende", () => {
    const vecchia = firmaCon(nostra.privateKey, { v: 1, l: venueA, e: IERI });
    const esito = verificaLicenza(vecchia, venueA);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.motivo).toBe("scaduta");
      expect(esito.messaggio).toContain(IERI);
    }
  });

  it("l'ultimo giorno scritto è ancora buono", () => {
    // «scade il 17» vuol dire che il 17 funziona: la mezzanotte è quella dopo
    const oggi = new Date().toISOString().slice(0, 10);
    expect(verificaLicenza(firmaCon(nostra.privateKey, { v: 1, l: venueA, e: oggi }), venueA).ok).toBe(
      true,
    );
    expect(verificaLicenza(firmaCon(nostra.privateKey, { v: 1, l: venueA, e: DOMANI }), venueA).ok).toBe(
      true,
    );
  });

  it("senza la chiave pubblica nessuna licenza è valida, nemmeno la vera", () => {
    /* Il verso sbagliato sarebbe «non so verificare, quindi accendo». Qui
       senza la chiave pubblica si resta spenti, ed è l'unica risposta onesta. */
    delete process.env.CENTRALINO_CHIAVE_PUBBLICA;
    const buona = firmaCon(nostra.privateKey, { v: 1, l: venueA });
    const esito = verificaLicenza(buona, venueA);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("non_configurato");
  });

  it("una chiave pubblica illeggibile non diventa un via libera", () => {
    process.env.CENTRALINO_CHIAVE_PUBBLICA = "questo-non-e-una-chiave";
    const buona = firmaCon(nostra.privateKey, { v: 1, l: venueA });
    expect(verificaLicenza(buona, venueA).ok).toBe(false);
  });
});

describe("accendere e spegnere nel locale", () => {
  it("il locale nasce spento", async () => {
    const stato = await statoCentralino(venueB);
    expect(stato.attivo).toBe(false);
    expect(stato.chiaveLeggibile).toBeNull();
    // spento e mai comprato: nessun motivo da spiegare
    expect(stato.motivoSpento).toBeNull();
  });

  it("incollare la chiave accende, e resta acceso alla lettura dopo", async () => {
    const chiave = firmaCon(nostra.privateKey, { v: 1, l: venueA, e: DOMANI });
    const subito = await attivaCentralino(venueA, chiave);
    expect(subito.attivo).toBe(true);

    const poi = await statoCentralino(venueA);
    expect(poi.attivo).toBe(true);
    expect(poi.scadeIl).not.toBeNull();
    expect(poi.attivatoIl).not.toBeNull();
    expect(poi.chiaveLeggibile).toBe(`…${chiave.slice(-8)}`);
  });

  it("gli spazi del copia e incolla non impediscono di accendere", async () => {
    const chiave = firmaCon(nostra.privateKey, { v: 1, l: venueA });
    const sporca = `  ${chiave.slice(0, 30)}\n${chiave.slice(30)}  `;
    const stato = await attivaCentralino(venueA, sporca);
    expect(stato.attivo).toBe(true);
    // in archivio ci finisce pulita, o la si mostrerebbe con un capo a riga
    const riga = await db.venue.findUnique({
      where: { id: venueA },
      select: { phoneLicenseKey: true },
    });
    expect(riga?.phoneLicenseKey).toBe(chiave);
  });

  it("una chiave che non va non accende e dice cosa fare", async () => {
    const falsa = firmaCon(impostore.privateKey, { v: 1, l: venueA });
    await expect(attivaCentralino(venueA, falsa)).rejects.toThrow(LicenzaError);
    await expect(attivaCentralino(venueA, falsa)).rejects.toThrow(/non è autentica/);
    // e non ha toccato quello che c'era
    expect((await statoCentralino(venueA)).attivo).toBe(true);
  });

  it("una licenza che scade smette di accendere, senza che nessuno la tocchi", async () => {
    const chiave = firmaCon(nostra.privateKey, { v: 1, l: venueA, e: DOMANI });
    await attivaCentralino(venueA, chiave);
    expect((await statoCentralino(venueA)).attivo).toBe(true);

    // due giorni dopo, senza nessuna scrittura nel database
    const dopo = await statoCentralino(venueA, new Date(Date.now() + 2 * 86_400_000));
    expect(dopo.attivo).toBe(false);
    expect(dopo.motivoSpento).toBe("scaduta");
    // la chiave resta visibile: serve a capire *quale* licenza è scaduta
    expect(dopo.chiaveLeggibile).not.toBeNull();
  });

  it("cambiare le chiavi di firma spegne le licenze già emesse", async () => {
    const chiave = firmaCon(nostra.privateKey, { v: 1, l: venueA });
    await attivaCentralino(venueA, chiave);
    expect((await statoCentralino(venueA)).attivo).toBe(true);

    /* Non è un difetto, è la conseguenza voluta: se la privata finisse in giro,
       cambiarla toglie di mezzo tutte le licenze fabbricate con quella. Il
       prezzo è che vanno riemesse anche quelle buone, e va saputo prima. */
    process.env.CENTRALINO_CHIAVE_PUBBLICA = impostore.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    const dopo = await statoCentralino(venueA);
    expect(dopo.attivo).toBe(false);
    expect(dopo.motivoSpento).toBe("non_piu_valida");
  });

  it("togliere la chiave spegne e non cancella niente", async () => {
    await attivaCentralino(venueA, firmaCon(nostra.privateKey, { v: 1, l: venueA }));
    await spegniCentralino(venueA);
    const stato = await statoCentralino(venueA);
    expect(stato.attivo).toBe(false);
    expect(stato.chiaveLeggibile).toBeNull();
    expect(stato.motivoSpento).toBeNull();
  });
});

describe("il guardiano delle funzioni", () => {
  it("lascia passare una funzione accesa", async () => {
    await attivaCentralino(venueA, firmaCon(nostra.privateKey, { v: 1, l: venueA }));
    await expect(richiediFunzioneCentralino(venueA, "riconoscimento")).resolves.toBeUndefined();
  });

  it("ferma una funzione che la licenza non comprende", async () => {
    await attivaCentralino(
      venueA,
      firmaCon(nostra.privateKey, { v: 1, l: venueA, f: ["riconoscimento"] }),
    );
    await expect(richiediFunzioneCentralino(venueA, "prenotazioni")).rejects.toThrow(LicenzaError);
  });

  it("ferma tutto su un locale spento", async () => {
    /* Nascondere un pulsante non è spegnere una funzione: chi conosce
       l'indirizzo la chiama comunque, e il guardiano è l'unica cosa che conta. */
    await expect(richiediFunzioneCentralino(venueB, "riconoscimento")).rejects.toThrow(
      /non è attivo/,
    );
  });
});
