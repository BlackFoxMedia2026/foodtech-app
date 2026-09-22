import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { leggiEtichette, misureDalleQuote, scorpora, sembraUnNome } from "@/server/planimetria-ocr";

/**
 * La lettura delle scritte.
 *
 * Le parti che decidono cosa è un nome e dove sta si verificano da sole,
 * perché sono quelle che hanno sbagliato davvero: su una pianta di ristorante
 * «porta a vento» tornava come `portaa` con confidenza 92 — più alta di
 * `RISTORO`, che è un nome vero.
 */

describe("cosa è il nome di un ambiente e cosa no", () => {
  it("i nomi veri passano, comprese le abbreviazioni da planimetria", () => {
    for (const nome of ["CUCINA", "RISTORO", "BAR", "DISP.", "RIP", "spogl.", "LAVANDERIA"]) {
      expect(sembraUnNome(nome), nome).toBe(true);
    }
  });

  it("i cocci delle annotazioni no, per quanto il riconoscitore ne sia sicuro", () => {
    for (const coccio of ["portaa", "orta", "vento", "scorrevole", "sez", "scala", "quota"]) {
      expect(sembraUnNome(coccio), coccio).toBe(false);
    }
  });

  it("gli sgabelli del bancone letti come lettere no", () => {
    expect(sembraUnNome("OO")).toBe(false);
    expect(sembraUnNome("OOOO")).toBe(false);
    expect(sembraUnNome("Bi")).toBe(false);
  });
});

describe("una quota incollata al nome", () => {
  it("il nome si scorpora e il suo centro si sposta dove sono le lettere", () => {
    // «6,5000RISTORO» largo 130 px da x=100: le lettere di RISTORO stanno
    // nella seconda metà, non al centro di tutto.
    const r = scorpora("6,5000RISTORO", 100, 230);
    expect(r?.pulito).toBe("RISTORO");
    expect(r!.centro).toBeGreaterThan(165);
    expect(r!.centro).toBeLessThan(230);
  });

  it("un nome pulito resta dov'è", () => {
    const r = scorpora("CUCINA", 100, 200);
    expect(r?.pulito).toBe("CUCINA");
    expect(r!.centro).toBeCloseTo(150, 0);
  });

  it("senza lettere non c'è niente da scorporare", () => {
    expect(scorpora("10,80", 0, 50)).toBeNull();
  });
});

describe("le misure dalle quote ai margini", () => {
  const edificio = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

  it("centimetri di un disegno edile: 1126 diventano 11,26 m", () => {
    const m = misureDalleQuote(
      [
        { valore: 1126, x: 0.5, y: 0.05 },
        { valore: 1119, x: 0.05, y: 0.5 },
        { valore: 182, x: 0.3, y: 0.05 },
      ],
      edificio,
    );
    expect(m.widthM).toBeCloseTo(11.26, 2);
    expect(m.depthM).toBeCloseTo(11.19, 2);
  });

  it("metri scritti come metri restano metri", () => {
    const m = misureDalleQuote(
      [
        { valore: 10.8, x: 0.5, y: 0.04 },
        { valore: 9, x: 0.04, y: 0.5 },
      ],
      edificio,
    );
    expect(m.widthM).toBe(10.8);
    expect(m.depthM).toBe(9);
  });

  it("le quote dentro il disegno non sono quote complessive", () => {
    // 600 scritto in mezzo alla sala è la misura di un tratto, non del lato.
    const m = misureDalleQuote([{ valore: 600, x: 0.5, y: 0.5 }], edificio);
    expect(m.widthM).toBeNull();
    expect(m.depthM).toBeNull();
  });

  it("senza quote non si inventa una misura", () => {
    expect(misureDalleQuote([], edificio)).toEqual({ widthM: null, depthM: null });
  });
});

describe("la lettura vera, su un disegno costruito qui", () => {
  it("trova la scritta e dice dov'è", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
      <rect width="900" height="600" fill="white"/>
      <rect x="60" y="60" width="780" height="480" fill="none" stroke="black" stroke-width="8"/>
      <text x="250" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" fill="black">CUCINA</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await leggiEtichette(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);

    // Senza i dati di lingua (una macchina senza rete al primo avvio) la
    // lettura non c'è, e il riconoscimento prosegue senza: qui si verifica
    // che *quando* c'è, sia giusta.
    if (!r) return;
    const cucina = r.etichette.find((e) => /CUCINA/i.test(e.testo));
    expect(cucina, `letto invece: ${r.etichette.map((e) => e.testo).join(", ")}`).toBeTruthy();
    expect(cucina!.x).toBeGreaterThan(0.3);
    expect(cucina!.x).toBeLessThan(0.55);
    expect(cucina!.y).toBeGreaterThan(0.4);
    expect(cucina!.y).toBeLessThan(0.55);
  }, 60000);
});
