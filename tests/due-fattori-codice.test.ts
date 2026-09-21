import { describe, expect, it } from "vitest";
import {
  CIFRE,
  PASSO_SECONDI,
  codicePerPasso,
  daBase32,
  indirizzoOtpauth,
  nuovoSegreto,
  passoDi,
  verificaCodice,
} from "@/lib/totp";

/**
 * Il codice a sei cifre, provato contro i numeri dello standard.
 *
 * I vettori vengono dall'appendice B della RFC 6238: il segreto è la stringa
 * ASCII `12345678901234567890`, e per ogni istante lo standard pubblica il
 * codice atteso. Sono gli stessi numeri che qualunque altra implementazione
 * deve produrre — se questi passano, un'app di autenticazione vera leggerà i
 * nostri QR.
 */

/** `12345678901234567890` in base32, il segreto dei vettori ufficiali. */
const SEGRETO_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("i vettori della RFC 6238", () => {
  /* Istante (in secondi) → codice atteso, per SHA-1. */
  const casi: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [secondi, atteso] of casi) {
    it(`a ${secondi} secondi il codice è ${atteso}`, () => {
      const passo = Math.floor(secondi / PASSO_SECONDI);
      expect(codicePerPasso(SEGRETO_RFC, passo)).toBe(atteso);
    });
  }

  it("il contatore regge anche oltre i quattro miliardi di passi", () => {
    /* `20000000000` secondi è oltre il 2600: se il contatore fosse a 32 bit
       tornerebbe a zero e il codice sarebbe un altro. */
    expect(codicePerPasso(SEGRETO_RFC, Math.floor(20000000000 / 30))).toBe("353130");
  });
});

describe("il segreto", () => {
  it("nasce in base32 leggibile dalle app, e si rilegge", () => {
    const s = nuovoSegreto();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    // 20 byte → 32 caratteri base32: la lunghezza che tutte le app si aspettano.
    expect(s).toHaveLength(32);
    expect(daBase32(s)).toHaveLength(20);
  });

  it("due segreti non sono mai lo stesso", () => {
    const visti = new Set(Array.from({ length: 50 }, () => nuovoSegreto()));
    expect(visti.size).toBe(50);
  });

  it("si incolla anche con spazi e minuscole", () => {
    /* Un segreto si copia a mano da uno schermo: se la forma è rigida, chi lo
       incolla con uno spazio si sente dire «non valido» senza capire. */
    expect(daBase32("gezd gnbv gy3t qojq").equals(daBase32("GEZDGNBVGY3TQOJQ"))).toBe(true);
  });

  it("un segreto con caratteri impossibili viene rifiutato", () => {
    expect(() => daBase32("108!")).toThrow();
  });
});

describe("la verifica", () => {
  const ADESSO = new Date("2026-09-21T10:00:00.000Z");

  it("accetta il codice del momento", () => {
    const codice = codicePerPasso(SEGRETO_RFC, passoDi(ADESSO));
    expect(verificaCodice(SEGRETO_RFC, codice, { adesso: ADESSO })).toMatchObject({ ok: true });
  });

  it("perdona trenta secondi da una parte e dall'altra, non sessanta", () => {
    /**
     * Gli orologi non coincidono mai. Novanta secondi in tutto: più larga
     * vorrebbe dire un codice che vive due minuti, più stretta vorrebbe dire
     * gente chiusa fuori per un telefono desincronizzato.
     */
    const centro = passoDi(ADESSO);
    expect(verificaCodice(SEGRETO_RFC, codicePerPasso(SEGRETO_RFC, centro - 1), { adesso: ADESSO }).ok).toBe(true);
    expect(verificaCodice(SEGRETO_RFC, codicePerPasso(SEGRETO_RFC, centro + 1), { adesso: ADESSO }).ok).toBe(true);
    expect(verificaCodice(SEGRETO_RFC, codicePerPasso(SEGRETO_RFC, centro - 2), { adesso: ADESSO }).ok).toBe(false);
    expect(verificaCodice(SEGRETO_RFC, codicePerPasso(SEGRETO_RFC, centro + 2), { adesso: ADESSO }).ok).toBe(false);
  });

  it("dice in quale passo era, perché chi chiama deve poterlo bruciare", () => {
    const passo = passoDi(ADESSO);
    const esito = verificaCodice(SEGRETO_RFC, codicePerPasso(SEGRETO_RFC, passo), { adesso: ADESSO });
    expect(esito).toEqual({ ok: true, passo });
  });

  it("un codice già usato non vale più", () => {
    /**
     * Senza questo, un codice visto passare — su una spalla, in un registro,
     * in una schermata condivisa — resta valido per altri novanta secondi. È
     * la parte che la matematica dello standard non copre e che tocca a noi.
     */
    const passo = passoDi(ADESSO);
    const codice = codicePerPasso(SEGRETO_RFC, passo);
    expect(verificaCodice(SEGRETO_RFC, codice, { adesso: ADESSO, ultimoPassoUsato: passo }).ok).toBe(false);
    /* E nemmeno quelli prima: un orologio indietro non riapre una finestra
       già chiusa. */
    const primo = codicePerPasso(SEGRETO_RFC, passo - 1);
    expect(verificaCodice(SEGRETO_RFC, primo, { adesso: ADESSO, ultimoPassoUsato: passo }).ok).toBe(false);
  });

  it("scarta quello che non è un codice, prima di calcolare niente", () => {
    for (const brutto of ["", "12345", "1234567", "abcdef", "12 34 56 78"]) {
      expect(verificaCodice(SEGRETO_RFC, brutto, { adesso: ADESSO })).toEqual({
        ok: false,
        perche: "forma",
      });
    }
    /* Gli spazi dentro un codice giusto invece si perdonano: le app lo
       mostrano come «123 456». */
    const codice = codicePerPasso(SEGRETO_RFC, passoDi(ADESSO));
    const conSpazio = `${codice.slice(0, 3)} ${codice.slice(3)}`;
    expect(verificaCodice(SEGRETO_RFC, conSpazio, { adesso: ADESSO }).ok).toBe(true);
  });
});

describe("il QR per l'app", () => {
  it("porta il nome del locale e chi entra, non solo «Tavolo»", () => {
    /* Nell'app di autenticazione compaiono decine di righe: «Tavolo» da solo
       non dice a quale locale né a quale persona appartenga. */
    const url = indirizzoOtpauth({
      segreto: SEGRETO_RFC,
      email: "anna@trattoria.it",
      emittente: "Tavolo · Trattoria da Mario",
    });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Trattoria da Mario:anna@trattoria.it");
    expect(url).toContain(`secret=${SEGRETO_RFC}`);
    expect(url).toContain(`digits=${CIFRE}`);
    expect(url).toContain(`period=${PASSO_SECONDI}`);
  });
});
