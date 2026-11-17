import { describe, expect, it } from "vitest";
import { formattaIban, validaIban } from "@/lib/validazione/iban";
import { incoerenzeCf, validaCodiceFiscale } from "@/lib/validazione/codice-fiscale";

describe("codice fiscale", () => {
  it("accetta un codice corretto, anche minuscolo e con spazi", () => {
    expect(validaCodiceFiscale("rss mra 80a01 h501u")).toEqual({ valido: true, normalizzato: "RSSMRA80A01H501U" });
  });
  it("respinge un carattere di controllo sbagliato", () => {
    const e = validaCodiceFiscale("RSSMRA80A01H501X");
    expect(e.valido).toBe(false);
  });
  it("segnala cosa non torna con nome, cognome e nascita", () => {
    expect(incoerenzeCf("RSSMRA80A01H501U", { cognome: "Rossi", nome: "Mario", dataNascita: "1980-01-01" })).toEqual([]);
    expect(incoerenzeCf("RSSMRA80A01H501U", { cognome: "Bianchi", nome: "Mario", dataNascita: "1981-01-01" })).toEqual([
      "cognome",
      "data di nascita",
    ]);
  });
});

describe("IBAN", () => {
  it("accetta un IBAN italiano corretto scritto a gruppi", () => {
    expect(validaIban("it60 x054 2811 1010 0000 0123 456")).toMatchObject({ valido: true, paese: "IT" });
    expect(formattaIban("IT60X0542811101000000123456")).toBe("IT60 X054 2811 1010 0000 0123 456");
  });
  it("respinge cifra di controllo e lunghezza sbagliate", () => {
    expect(validaIban("IT61X0542811101000000123456").valido).toBe(false);
    expect(validaIban("IT60X054281110100000012345").valido).toBe(false);
  });
});
