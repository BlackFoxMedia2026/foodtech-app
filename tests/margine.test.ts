import { describe, expect, it } from "vitest";
import { fraseMargine, statoMargine } from "@/lib/margine";

const euro = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

/**
 * Il difetto: «margine -5,00 € · -25%» era scritto nello stesso grigio tenue
 * di «margine 25,84 € · 68%». Un piatto venduto in perdita aveva l'aspetto di
 * un piatto che rende — e il costo lo scrive il locale a mano.
 */
describe("statoMargine", () => {
  it("distingue guadagno, pari e perdita", () => {
    expect(statoMargine(2584)).toBe("guadagno");
    expect(statoMargine(0)).toBe("pari");
    expect(statoMargine(-500)).toBe("perdita");
  });

  it("un centesimo basta a cambiare lo stato", () => {
    expect(statoMargine(1)).toBe("guadagno");
    expect(statoMargine(-1)).toBe("perdita");
  });
});

describe("fraseMargine", () => {
  it("un margine positivo si legge come prima", () => {
    expect(fraseMargine(2584, 68, euro)).toBe("margine 25,84 € · 68%");
  });

  it("in perdita lo dice a parole, e senza il segno meno", () => {
    // «margine -5,00 €» chiede di notare un segno alto due pixel
    expect(fraseMargine(-500, -25, euro)).toBe("in perdita 5,00 € · 25%");
  });

  it("venduto esattamente a costo non è né guadagno né perdita", () => {
    expect(fraseMargine(0, 0, euro)).toBe("venduto a costo, nessun margine");
  });

  it("senza percentuale dice solo gli euro", () => {
    expect(fraseMargine(2584, null, euro)).toBe("margine 25,84 €");
    expect(fraseMargine(-500, null, euro)).toBe("in perdita 5,00 €");
  });
});
