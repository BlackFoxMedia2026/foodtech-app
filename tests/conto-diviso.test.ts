import { describe, expect, it } from "vitest";
import {
  centesimiDaTesto,
  dividiCentesimi,
  manciaPercentuale,
  quotaDivisa,
  quoteRimaste,
} from "@/lib/conto-diviso";

/**
 * L'aritmetica del conto diviso.
 *
 * La proprietà che conta è una sola e vale per tutti i casi: **la somma delle
 * parti è il totale**. Non «circa», non «a meno di un centesimo». Un conto
 * che perde un centesimo lascia un tavolo aperto per sempre; uno che ne crea
 * uno addebita al cliente denaro che non doveva.
 */
describe("dividiCentesimi", () => {
  it("divide esatto quando il conto è divisibile", () => {
    expect(dividiCentesimi(12000, 4)).toEqual([3000, 3000, 3000, 3000]);
  });

  it("dà i centesimi che avanzano ai primi, uno ciascuno", () => {
    // L'esempio del brief: 100 € in tre.
    expect(dividiCentesimi(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("somma sempre il totale, per ogni combinazione fino a 12 persone", () => {
    for (let totale = 0; totale <= 5000; totale += 7) {
      for (let parti = 1; parti <= 12; parti++) {
        const quote = dividiCentesimi(totale, parti);
        expect(quote).toHaveLength(parti);
        expect(quote.reduce((s, q) => s + q, 0)).toBe(totale);
        // Nessuna quota si discosta dalle altre di più di un centesimo.
        expect(Math.max(...quote) - Math.min(...quote)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rifiuta importi e parti che non hanno senso", () => {
    expect(() => dividiCentesimi(-1, 2)).toThrow(RangeError);
    expect(() => dividiCentesimi(100, 0)).toThrow(RangeError);
    expect(() => dividiCentesimi(10.5, 2)).toThrow(RangeError);
  });
});

describe("quotaDivisa", () => {
  it("arrotonda per eccesso, così il conto si chiude", () => {
    expect(quotaDivisa(10000, 3)).toBe(3334);
  });

  it("non chiede mai più del residuo", () => {
    expect(quotaDivisa(500, 8)).toBe(63);
    // Tre centesimi in otto: un centesimo a testa, e il conto si chiude al terzo.
    expect(quotaDivisa(3, 8)).toBe(1);
    expect(quotaDivisa(7, 1)).toBe(7);
  });

  /**
   * Il caso vero: le persone pagano una alla volta, e fra un pagamento e
   * l'altro il residuo cambia. Nessuno deve restare col centesimo orfano, e
   * il tavolo deve arrivare a zero esatto.
   */
  it("porta il residuo a zero esatto pagando una quota alla volta", () => {
    for (const totale of [10000, 9999, 1, 3, 12345, 100, 777]) {
      for (const persone of [2, 3, 4, 5, 6, 7, 11]) {
        let residuo = totale;
        let mancanti = persone;
        let incassato = 0;
        while (residuo > 0 && mancanti > 0) {
          const quota = quotaDivisa(residuo, mancanti);
          expect(quota).toBeGreaterThan(0);
          expect(quota).toBeLessThanOrEqual(residuo);
          residuo -= quota;
          incassato += quota;
          mancanti -= 1;
        }
        expect(residuo).toBe(0);
        expect(incassato).toBe(totale);
      }
    }
  });
});

describe("quoteRimaste", () => {
  it("racconta quante persone mancano", () => {
    expect(quoteRimaste(9000, 3000)).toBe(3);
    expect(quoteRimaste(0, 3000)).toBe(0);
    // Dopo la prima delle tre quote di 100 € il residuo è 6666, e ne restano due.
    expect(quoteRimaste(6666, 3334)).toBe(2);
    // Un resto che non è multiplo esatto conta comunque come una quota intera.
    expect(quoteRimaste(6700, 3334)).toBe(3);
  });
});

describe("manciaPercentuale", () => {
  it("calcola sul conto, non sul totale con la mancia dentro", () => {
    expect(manciaPercentuale(3000, 10)).toBe(300);
    expect(manciaPercentuale(3000, 0)).toBe(0);
  });

  it("arrotonda al centesimo più vicino", () => {
    expect(manciaPercentuale(1234, 15)).toBe(185); // 185,1 → 185
    expect(manciaPercentuale(999, 5)).toBe(50); // 49,95 → 50
  });
});

describe("centesimiDaTesto", () => {
  it("accetta quello che una persona scrive davvero", () => {
    expect(centesimiDaTesto("12,50")).toBe(1250);
    expect(centesimiDaTesto("12.50")).toBe(1250);
    expect(centesimiDaTesto(" € 12,5 ")).toBe(1250);
    expect(centesimiDaTesto("7")).toBe(700);
    expect(centesimiDaTesto("0,01")).toBe(1);
  });

  /** `parseFloat("12,50")` risponde 12: cinquanta centesimi persi in silenzio. */
  it("rifiuta invece di approssimare", () => {
    expect(centesimiDaTesto("")).toBeNull();
    expect(centesimiDaTesto("abc")).toBeNull();
    expect(centesimiDaTesto("-5")).toBeNull();
    expect(centesimiDaTesto("12,505")).toBeNull();
    expect(centesimiDaTesto("1e3")).toBeNull();
  });
});
