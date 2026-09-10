import { describe, expect, it } from "vitest";
import { computeDelta } from "@/lib/period-delta";

/**
 * `computeDelta` risponde a **due domande separate**, e tenerle separate è la
 * cosa che questo file protegge:
 *
 *   `value`  → di quanto e **in che direzione** si è mosso (col segno);
 *   `isGood` → se quel movimento è una **buona notizia**.
 *
 * Schiacciarle in una sola era il difetto delle schede di Analytics: la
 * freccia veniva da `isGood`, così le assenze salite dal 9% al 12% mostravano
 * «▼ 3%» — una freccia in giù su un numero salito — mentre la fascia di
 * confronto sotto scriveva «↑ 3 pt». La freccia viene dal segno, il colore dal
 * giudizio.
 */
describe("computeDelta: direzione e giudizio non sono la stessa cosa", () => {
  it("una metrica che sale ed è meglio se scende: segno positivo, giudizio negativo", () => {
    // le assenze dal 9% al 12%
    const d = computeDelta(12, 9, { higherIsBetter: false, kind: "rate" });
    expect(d).toMatchObject({ available: true, value: 3, isGood: false });
  });

  it("una metrica che scende ed è meglio se scende: segno negativo, giudizio positivo", () => {
    // le cancellazioni dall'8% al 4%
    const d = computeDelta(4, 8, { higherIsBetter: false, kind: "rate" });
    expect(d).toMatchObject({ available: true, value: -4, isGood: true });
  });

  it("una metrica che scende ed è meglio se sale: entrambi negativi", () => {
    const d = computeDelta(363, 445, { kind: "count" });
    expect(d).toMatchObject({ available: true, isGood: false });
    expect((d as { value: number }).value).toBeLessThan(0);
  });

  it("le percentuali si confrontano in punti, i conteggi in percentuale", () => {
    expect(computeDelta(12, 9, { kind: "rate" })).toMatchObject({ value: 3, kind: "rate" });
    expect(computeDelta(12, 9, { kind: "count" })).toMatchObject({ value: 33, kind: "count" });
  });

  it("invariato non è né buono né cattivo: il giudizio è nullo", () => {
    expect(computeDelta(10, 10)).toMatchObject({ available: true, value: 0, isGood: null });
  });

  it("senza un periodo prima non si confronta, invece di inventare uno zero", () => {
    expect(computeDelta(10, 0)).toEqual({ available: false });
    expect(computeDelta(0, 0)).toEqual({ available: false });
  });

  it("il segno di value non dipende mai da higherIsBetter", () => {
    for (const [c, p] of [[12, 9], [9, 12], [100, 50], [50, 100]] as const) {
      const su = computeDelta(c, p, { higherIsBetter: true });
      const giu = computeDelta(c, p, { higherIsBetter: false });
      expect((su as { value: number }).value).toBe((giu as { value: number }).value);
      expect((su as { isGood: boolean }).isGood).toBe(!(giu as { isGood: boolean }).isGood);
    }
  });
});
