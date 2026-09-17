import { describe, expect, it } from "vitest";
import {
  FIRMA_LUNGHEZZA,
  FUNZIONI_CENTRALINO,
  MARCHIO_LICENZA,
  componiLicenza,
  dividiLicenza,
  fineValidita,
  funzioniDi,
  inBase64url,
  licenzaLeggibile,
  testoDaFirmare,
  type ContenutoLicenza,
} from "@/lib/licenza-centralino";

/**
 * La forma della chiave che accende il centralino.
 *
 * Qui non si prova la crittografia — quella sta in `tests/centralino.test.ts`,
 * contro chiavi Ed25519 vere. Qui si prova la parte che una persona rompe
 * davvero: una chiave incollata male, tagliata, con uno spazio in mezzo, o di
 * un altro locale.
 */

const CONTENUTO: ContenutoLicenza = {
  v: 1,
  l: "cm0locale000000000000000",
  n: "Trattoria di prova",
  e: "2027-09-17",
  d: "2026-09-17",
};

const FIRMA_FINTA = "a".repeat(FIRMA_LUNGHEZZA);
const CHIAVE = componiLicenza(CONTENUTO, FIRMA_FINTA);

describe("come è composta", () => {
  it("il marchio col numero di formato sta davanti", () => {
    expect(CHIAVE.startsWith(`${MARCHIO_LICENZA}.`)).toBe(true);
  });

  it("il testo firmato è marchio e contenuto, senza la firma", () => {
    // Se le due parti lo costruissero diverso, le firme non tornerebbero mai
    expect(testoDaFirmare(CONTENUTO)).toBe(
      `${MARCHIO_LICENZA}.${inBase64url(JSON.stringify(CONTENUTO))}`,
    );
    expect(CHIAVE.startsWith(testoDaFirmare(CONTENUTO))).toBe(true);
  });

  it("il contenuto si rilegge tale e quale", () => {
    const d = dividiLicenza(CHIAVE);
    expect(d?.contenuto).toEqual(CONTENUTO);
    expect(d?.firma).toBe(FIRMA_FINTA);
    expect(d?.firmato).toBe(testoDaFirmare(CONTENUTO));
  });
});

describe("una chiave incollata da una persona", () => {
  it("sopporta spazi, capi a riga e uno spazio in mezzo", () => {
    const meta = Math.floor(CHIAVE.length / 2);
    for (const sporca of [
      ` ${CHIAVE} `,
      `\n${CHIAVE}\n`,
      `${CHIAVE.slice(0, meta)} ${CHIAVE.slice(meta)}`,
      CHIAVE.replace(/(.{20})/g, "$1\n"),
    ]) {
      expect(dividiLicenza(sporca)?.contenuto).toEqual(CONTENUTO);
    }
  });

  it("rifiuta quello che non è una chiave, senza scomodare la firma", () => {
    for (const no of [
      "",
      "   ",
      null,
      undefined,
      "buongiorno",
      CHIAVE.replace("tvlc1", "tvlc2"), // formato che non conosciamo
      `${MARCHIO_LICENZA}.soloDuePezzi`,
      `${MARCHIO_LICENZA}.${inBase64url("{non json")}.${FIRMA_FINTA}`,
      `${MARCHIO_LICENZA}.${inBase64url('{"v":2,"l":"x"}')}.${FIRMA_FINTA}`, // contenuto futuro
      `${MARCHIO_LICENZA}.${inBase64url('{"v":1}')}.${FIRMA_FINTA}`, // senza locale
      `${MARCHIO_LICENZA}.${inBase64url('{"v":1,"l":""}')}.${FIRMA_FINTA}`,
      `${MARCHIO_LICENZA}.${inBase64url('{"v":1,"l":"x","e":"17/09/2027"}')}.${FIRMA_FINTA}`,
      `${MARCHIO_LICENZA}.${inBase64url('{"v":1,"l":"x","f":"tutto"}')}.${FIRMA_FINTA}`,
      `${MARCHIO_LICENZA}.abc!def.${FIRMA_FINTA}`, // caratteri non base64url
      CHIAVE.slice(0, -10), // tagliata nell'incollarla: la firma è corta
      componiLicenza(CONTENUTO, "a".repeat(FIRMA_LUNGHEZZA + 1)), // firma troppo lunga
    ]) {
      expect(dividiLicenza(no as string)).toBeNull();
    }
  });

  it("la lunghezza della firma è quella di Ed25519, non un numero a caso", () => {
    // 64 byte firmati = 86 caratteri in base64url: è una proprietà
    // dell'algoritmo, e serve a distinguere «chiave rotta» da «chiave non tua»
    expect(FIRMA_LUNGHEZZA).toBe(86);
    expect(dividiLicenza(CHIAVE)?.firma).toHaveLength(FIRMA_LUNGHEZZA);
  });

  it("una chiave tagliata a metà del contenuto non passa per buona", () => {
    const d = dividiLicenza(CHIAVE.slice(0, CHIAVE.indexOf(".", 6) - 5) + `.${FIRMA_FINTA}`);
    expect(d).toBeNull();
  });
});

describe("quando scade", () => {
  it("il giorno scritto è ancora valido per tutto il giorno", () => {
    // «scade il 17» per una persona vuol dire che il 17 funziona: se la fine
    // fosse la mezzanotte del 17, il telefono si spegnerebbe la notte del 16
    const fine = fineValidita("2027-09-17")!;
    expect(fine.toISOString()).toBe("2027-09-18T00:00:00.000Z");
    expect(new Date("2027-09-17T23:59:00.000Z") < fine).toBe(true);
    expect(new Date("2027-09-18T00:01:00.000Z") < fine).toBe(false);
  });

  it("senza data non scade", () => {
    expect(fineValidita(null)).toBeNull();
    expect(fineValidita(undefined)).toBeNull();
    expect(fineValidita("")).toBeNull();
  });

  it("una data impossibile non diventa una data", () => {
    expect(fineValidita("2027-13-45")).toBeNull();
  });
});

describe("cosa accende", () => {
  it("senza elenco accende tutto quello che esiste oggi", () => {
    expect(funzioniDi({ v: 1, l: "x" })).toEqual([...FUNZIONI_CENTRALINO]);
    expect(funzioniDi({ v: 1, l: "x", f: [] })).toEqual([...FUNZIONI_CENTRALINO]);
  });

  it("con l'elenco accende solo quelle", () => {
    expect(funzioniDi({ v: 1, l: "x", f: ["riconoscimento"] })).toEqual(["riconoscimento"]);
  });

  it("una funzione che non esiste non accende niente di nascosto", () => {
    // una licenza vecchia che nomina una funzione che abbiamo tolto non deve
    // accendere «tutto» per effetto collaterale
    expect(funzioniDi({ v: 1, l: "x", f: ["telepatia"] })).toEqual([]);
  });
});

describe("come si mostra", () => {
  it("solo le ultime otto lettere: una schermata che la ripete è una da cui si copia", () => {
    const mostrata = licenzaLeggibile(CHIAVE)!;
    expect(mostrata).toBe(`…${CHIAVE.slice(-8)}`);
    expect(mostrata.length).toBe(9);
    expect(CHIAVE).toContain(mostrata.slice(1));
  });

  it("su niente, o su troppo poco, non mostra niente", () => {
    expect(licenzaLeggibile(null)).toBeNull();
    expect(licenzaLeggibile("abc")).toBeNull();
  });
});
