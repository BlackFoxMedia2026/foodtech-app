import { describe, expect, it } from "vitest";
import { generateLShape, generateRectangle, tracciatoDi } from "@/components/floor/editor/perimetro";

const muro = (id: string, startX: number, startY: number, endX: number, endY: number, type = "WALL") => ({
  id,
  type,
  startX,
  startY,
  endX,
  endY,
});

describe("il tracciato dei muri", () => {
  it("una stanza rettangolare è un tracciato solo, da qualunque muro si parta", () => {
    const muri = generateRectangle(10, 6);
    for (const m of muri) expect(tracciatoDi(muri, m.id)).toHaveLength(4);
  });

  it("anche una stanza a elle", () => {
    const muri = generateLShape(12, 8, 4, 3);
    expect(tracciatoDi(muri, muri[0].id)).toHaveLength(6);
  });

  it("un muro che non tocca gli altri sta da solo", () => {
    const muri = [...generateRectangle(10, 6), muro("isolato", 2000, 2000, 2200, 2000)];
    expect(tracciatoDi(muri, "isolato").map((m) => m.id)).toEqual(["isolato"]);
  });

  it("un divisorio che tocca una parete non entra nel tracciato", () => {
    const muri = [muro("a", 0, 0, 100, 0), muro("d", 100, 0, 100, 80, "DIVIDER")];
    expect(tracciatoDi(muri, "a").map((m) => m.id)).toEqual(["a"]);
  });

  it("i collegamenti passano anche attraverso altri muri", () => {
    const muri = [muro("a", 0, 0, 100, 0), muro("b", 100, 0, 100, 100), muro("c", 100, 100, 200, 100)];
    expect(tracciatoDi(muri, "a").map((m) => m.id).sort()).toEqual(["a", "b", "c"]);
  });
});
