import { describe, expect, it } from "vitest";
import { calamitaAngolo, calamitaCapo, calamitaLinea } from "@/components/floor/editor/aggancio";
import { calcolaGuideBordi } from "@/components/floor/editor/guide";

describe("calamita delle linee", () => {
  it("attira l'angolo verso 0°, 45°, 90° entro la soglia", () => {
    expect(calamitaAngolo(3)).toBe(0);
    expect(calamitaAngolo(357)).toBe(0);
    expect(calamitaAngolo(-2)).toBe(0);
    expect(calamitaAngolo(48)).toBe(45);
    expect(calamitaAngolo(93)).toBe(90);
  });

  it("fuori dalla soglia lascia l'angolo libero", () => {
    expect(calamitaAngolo(30)).toBe(30);
    expect(calamitaAngolo(68)).toBe(68);
    expect(calamitaAngolo(-20)).toBe(340);
  });

  it("un muro quasi orizzontale diventa orizzontale, lungo uguale", () => {
    const p = calamitaCapo({ x: 0, y: 0 }, { x: 200, y: 7 }, []);
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(Math.hypot(200, 7));
  });

  it("un muro quasi a 45° diventa obliquo esatto", () => {
    const p = calamitaCapo({ x: 0, y: 0 }, { x: 100, y: 108 }, []);
    expect(p.x).toBeCloseTo(p.y);
  });

  it("un muro a 30° resta a 30°", () => {
    const grezzo = { x: 200 * Math.cos(Math.PI / 6), y: 200 * Math.sin(Math.PI / 6) };
    expect(calamitaCapo({ x: 0, y: 0 }, grezzo, [])).toEqual(grezzo);
  });

  it("il capo di un altro muro vince sulla direzione", () => {
    const p = calamitaCapo({ x: 0, y: 0 }, { x: 205, y: 5 }, [{ x: 210, y: 12 }]);
    expect(p).toEqual({ x: 210, y: 12 });
  });

  it("una linea spostata intera si incolla al capo più vicino", () => {
    const extra = calamitaLinea(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [{ x: 106, y: 4 }],
    );
    expect(extra).toEqual({ x: 6, y: 4 });
    expect(calamitaLinea([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 300, y: 0 }])).toEqual({ x: 0, y: 0 });
  });

  it("un divisorio che arriva a un muro si ferma sul muro, restando dritto", () => {
    const muro = { a: { x: 0, y: 300 }, b: { x: 500, y: 300 } };
    // Tirato quasi in verticale fino a 8 px prima del muro, un filo storto.
    const p = calamitaCapo({ x: 200, y: 0 }, { x: 203, y: 292 }, [], [muro]);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(300);
  });

  it("un capo libero si allinea alla riga e alla colonna di un altro capo", () => {
    // Direzione a ~22°: nessuna calamita d'angolo, quindi valgono gli assi.
    const p = calamitaCapo({ x: 0, y: 0 }, { x: 205, y: 83 }, [{ x: 210, y: 400 }, { x: 600, y: 80 }]);
    expect(p).toEqual({ x: 210, y: 80 });
  });

  it("su una linea orizzontale si allinea solo la x, così resta orizzontale", () => {
    const p = calamitaCapo({ x: 0, y: 100 }, { x: 196, y: 103 }, [{ x: 200, y: 400 }]);
    expect(p.x).toBe(200);
    expect(p.y).toBeCloseTo(100);
  });
});

describe("calamita del ridimensionamento", () => {
  it("il bordo destro e quello in basso si agganciano ai vicini", () => {
    const g = calcolaGuideBordi({ x: 0, y: 0, w: 96, h: 57 }, [{ x: 100, y: 60, w: 50, h: 50 }], [], { bordo: 10 });
    expect(g.dw).toBe(4);
    expect(g.dh).toBe(3);
  });

  it("lontano da tutto non cambia niente", () => {
    const g = calcolaGuideBordi({ x: 0, y: 0, w: 50, h: 50 }, [{ x: 300, y: 300, w: 50, h: 50 }], [], { bordo: 10 });
    expect(g).toEqual({ dw: 0, dh: 0, guide: [] });
  });
});
