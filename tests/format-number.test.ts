import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/utils";

/**
 * In italiano il separatore decimale è la **virgola**, e il punto separa le
 * migliaia. «1.6 giri per tavolo» si legge male su una schermata che due
 * centimetri più su scrive «3.904,00 €».
 */
describe("formatNumber", () => {
  it("usa la virgola per i decimali", () => {
    expect(formatNumber(1.6)).toBe("1,6");
    expect(formatNumber(2.4)).toBe("2,4");
  });

  it("non aggiunge zeri inutili", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.0)).toBe("2");
  });

  it("arrotonda a una cifra per difetto e per eccesso", () => {
    expect(formatNumber(1.64)).toBe("1,6");
    expect(formatNumber(1.66)).toBe("1,7");
  });

  it("con più decimali richiesti li mostra, sempre con la virgola", () => {
    expect(formatNumber(1.234, 2)).toBe("1,23");
    expect(formatNumber(1.5, 0)).toBe("2");
  });

  it("il punto delle migliaia segue l'italiano vero, che a quattro cifre non lo mette", () => {
    // Misurato, non assunto: per l'italiano il raggruppamento parte da cinque
    // cifre («1234,5» ma «12.345,6»). Su questi numeri — giri per tavolo — non
    // capita mai, ma il test dice qual è il comportamento e non un'ipotesi.
    expect(formatNumber(1234.5)).toBe("1234,5");
    expect(formatNumber(12345.6)).toBe("12.345,6");
  });

  it("lo zero e i negativi non diventano strani", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-1.6)).toBe("-1,6");
  });
});
