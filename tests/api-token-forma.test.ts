import { describe, expect, it } from "vitest";
import {
  AMBITI,
  MARCHIO,
  PREFISSO_LUNGHEZZA,
  componiToken,
  dividiToken,
  haAmbito,
  tokenDaIntestazione,
} from "@/lib/api-token-forma";

/**
 * La forma del token, provata senza database.
 *
 * Il modello `ApiToken` stava nello schema dal primo giorno e non lo usava
 * nessuno: nessun codice ne emetteva uno né lo verificava. Questi test
 * fissano la forma, che è la parte su cui poggia tutto il resto.
 */

const PREFISSO = `${MARCHIO}_7c1f9a2b4d6e`;
const SEGRETO = "PBEr6yQ1sK9wX2zA4bC6dE8fG0hI2jK4lM6nO8pQ0rS";

describe("il prefisso", () => {
  it("è lungo quanto la colonna del database", () => {
    // `prefix` è VarChar(16): se questo test cade, cade anche l'inserimento
    expect(PREFISSO).toHaveLength(PREFISSO_LUNGHEZZA);
  });
});

describe("dividiToken", () => {
  it("divide sul primo punto: il segreto è base64url e non contiene punti", () => {
    expect(dividiToken(componiToken(PREFISSO, SEGRETO))).toEqual({
      prefisso: PREFISSO,
      segreto: SEGRETO,
    });
  });

  it("tollera gli spazi attorno, che arrivano da un copia-incolla", () => {
    expect(dividiToken(`  ${PREFISSO}.${SEGRETO}  `)?.segreto).toBe(SEGRETO);
  });

  it("rifiuta una forma che non torna, senza interrogare il database", () => {
    for (const brutto of [
      "",
      "   ",
      PREFISSO,                       // solo il prefisso
      `${PREFISSO}.`,                 // segreto vuoto
      `.${SEGRETO}`,                  // prefisso vuoto
      `altro_7c1f9a2b4d6e.${SEGRETO}`, // marchio sbagliato
      `${MARCHIO}_ZZZZZZZZZZZZ.${SEGRETO}`, // prefisso non esadecimale
      `${MARCHIO}_7c1f.${SEGRETO}`,   // prefisso corto
      `${PREFISSO}.corto`,            // segreto corto
      `${PREFISSO}.con spazio dentro il segreto xxxxxxxxxx`,
    ]) {
      expect(dividiToken(brutto), JSON.stringify(brutto)).toBeNull();
    }
  });

  it("su niente non solleva", () => {
    expect(dividiToken(null)).toBeNull();
    expect(dividiToken(undefined)).toBeNull();
  });
});

describe("tokenDaIntestazione", () => {
  it("accetta «Bearer <token>», come vuole lo standard", () => {
    expect(tokenDaIntestazione(`Bearer ${PREFISSO}.${SEGRETO}`)).toBe(`${PREFISSO}.${SEGRETO}`);
    expect(tokenDaIntestazione(`bearer  ${PREFISSO}.${SEGRETO}`)).toBe(`${PREFISSO}.${SEGRETO}`);
  });

  it("accetta anche il token nudo: è quello che si scrive con curl la prima volta", () => {
    expect(tokenDaIntestazione(`${PREFISSO}.${SEGRETO}`)).toBe(`${PREFISSO}.${SEGRETO}`);
  });

  it("su un'intestazione assente o vuota torna null", () => {
    expect(tokenDaIntestazione(null)).toBeNull();
    expect(tokenDaIntestazione("")).toBeNull();
    expect(tokenDaIntestazione("Bearer   ")).toBeNull();
  });
});

describe("haAmbito", () => {
  it("nessuna gerarchia: scrivere non comprende leggere", () => {
    expect(haAmbito(["telefonia:write"], "telefonia:read")).toBe(false);
    expect(haAmbito(["telefonia:read"], "telefonia:write")).toBe(false);
  });

  it("concede solo quello che è scritto", () => {
    expect(haAmbito(["telefonia:read"], "telefonia:read")).toBe(true);
    expect(haAmbito(["telefonia:read", "telefonia:write"], "telefonia:write")).toBe(true);
    expect(haAmbito([], "telefonia:read")).toBe(false);
  });

  it("nessun carattere jolly apre tutto", () => {
    expect(haAmbito(["*"], "telefonia:read")).toBe(false);
    expect(haAmbito(["telefonia:*"], "telefonia:read")).toBe(false);
  });

  it("gli ambiti dichiarati sono quelli che il codice conosce", () => {
    expect([...AMBITI]).toEqual(["telefonia:read", "telefonia:write"]);
  });
});
