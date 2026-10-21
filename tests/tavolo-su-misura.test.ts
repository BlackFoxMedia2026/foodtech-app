import { describe, expect, it } from "vitest";
import { dimensioneDisegnata, improntaTavolo, posizioniSedie, sedieCoperte } from "@/lib/tavolo-geometria";

describe("tavolo su misura", () => {
  it("un imperiale da 6 m e 13 posti ha 13 sedie, tutte sui lati lunghi", () => {
    const sedie = posizioniSedie("RECT", 600, 80, 13);
    expect(sedie).toHaveLength(13);
    // Sui lati lunghi la y è ± (metà profondità + sporgenza); in testa no.
    expect(sedie.every((s) => Math.abs(s.y) > 40)).toBe(true);
    expect(sedie.filter((s) => s.y < 0)).toHaveLength(7);
  });

  it("le sedie non si accavallano su un lato lungo", () => {
    const sopra = posizioniSedie("RECT", 600, 80, 13)
      .filter((s) => s.y < 0)
      .map((s) => s.x)
      .sort((a, b) => a - b);
    for (let i = 1; i < sopra.length; i++) expect(sopra[i] - sopra[i - 1]).toBeGreaterThanOrEqual(60);
  });

  it("se i lati lunghi non bastano, il resto va in testa", () => {
    const sedie = posizioniSedie("RECT", 130, 80, 6);
    // 130 cm: due coperti per lato lungo, gli altri due in testa.
    expect(sedie.filter((s) => Math.abs(s.x) > 65)).toHaveLength(2);
  });

  it("un tavolo della misura standard si apparecchia come prima", () => {
    const std = dimensioneDisegnata({ shape: "RECT", seats: 8 });
    const sedie = posizioniSedie("RECT", std.w, std.h, 8);
    // La regola di sempre: oltre quattro posti, le teste prendono il resto
    // fino a quante ne stanno (qui due per testa).
    expect(sedie.filter((s) => Math.abs(s.x) > std.w / 2)).toHaveLength(4);
  });

  it("il riquadro sulla mappa contiene sempre il piano", () => {
    expect(improntaTavolo({ shape: "RECT", seats: 13, width: 600, height: 80 })).toEqual({ w: 600, h: 100 });
    expect(improntaTavolo({ shape: "RECT", seats: 2 })).toEqual({ w: 220, h: 100 });
  });
});

describe("sedie solo su due lati", () => {
  it("le teste restano libere anche su un rettangolo da otto", () => {
    const std = dimensioneDisegnata({ shape: "RECT", seats: 8 });
    const sedie = posizioniSedie("RECT", std.w, std.h, 8, "LONG");
    expect(sedie).toHaveLength(8);
    expect(sedie.every((s) => Math.abs(s.x) <= std.w / 2)).toBe(true);
  });

  it("su tutti i lati resta com'era", () => {
    const std = dimensioneDisegnata({ shape: "RECT", seats: 8 });
    expect(posizioniSedie("RECT", std.w, std.h, 8, "ALL")).toEqual(posizioniSedie("RECT", std.w, std.h, 8));
  });
});

describe("tavoli accostati", () => {
  it("la sedia in testa che finirebbe sotto il vicino non si disegna", () => {
    // Due rettangoli da sei, testa contro testa: 150 di lunghezza ciascuno.
    const sedie = posizioniSedie("RECT", 150, 80, 6);
    const a = { cx: 0, cy: 0, w: 150, h: 80, rotazione: 0 };
    const b = { cx: 150, cy: 0, w: 150, h: 80, rotazione: 0 };
    const restano = sedieCoperte(sedie, a, [b]);
    expect(restano.length).toBe(sedie.length - 1);
    expect(restano.some((s) => s.x > 75)).toBe(false);
  });

  it("senza vicini restano tutte", () => {
    const sedie = posizioniSedie("RECT", 150, 80, 6);
    expect(sedieCoperte(sedie, { cx: 0, cy: 0, w: 150, h: 80, rotazione: 0 }, [])).toEqual(sedie);
  });

  it("vale anche con un tavolo girato di 90°", () => {
    const sedie = posizioniSedie("RECT", 150, 80, 6);
    // Girato: la testa che era a destra ora sta in basso.
    const a = { cx: 0, cy: 0, w: 150, h: 80, rotazione: 90 };
    const sotto = { cx: 0, cy: 150, w: 80, h: 150, rotazione: 0 };
    expect(sedieCoperte(sedie, a, [sotto]).length).toBe(sedie.length - 1);
  });
});

