import { describe, expect, it } from "vitest";
import {
  CREMA,
  INCHIOSTRO,
  canali,
  contrasto,
  luminanza,
  interpola,
  rapportoLeggibile,
  testoSu,
} from "@/lib/colore-leggibile";

describe("canali", () => {
  it("legge sia la forma corta che quella lunga", () => {
    expect(canali("#fff")).toEqual([255, 255, 255]);
    expect(canali("#FFFFFF")).toEqual([255, 255, 255]);
    expect(canali("#24E5FF")).toEqual([36, 229, 255]);
  });

  it("rifiuta ciò che non è un colore esadecimale", () => {
    for (const brutto of ["", "#", "rosso", "#12345", "#gggggg", "rgb(0,0,0)", "24E5FF"]) {
      expect(canali(brutto)).toBeNull();
    }
  });
});

describe("contrasto", () => {
  it("dà 21 fra nero e bianco, e 1 fra un colore e se stesso", () => {
    expect(contrasto("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrasto("#24E5FF", "#24E5FF")).toBeCloseTo(1, 5);
  });

  it("non dipende dall'ordine", () => {
    expect(contrasto("#2F1F11", "#F2E7D0")).toBeCloseTo(contrasto("#F2E7D0", "#2F1F11")!, 10);
  });

  it("torna null se uno dei due non è un colore", () => {
    expect(contrasto("#fff", "verde")).toBeNull();
    expect(contrasto("verde", "#fff")).toBeNull();
  });

  it("misura il caso che ha fatto nascere questo file", () => {
    // bianco su #24E5FF: il pulsante «Prenota» del locale dimostrativo
    expect(contrasto("#ffffff", "#24E5FF")).toBeCloseTo(1.53, 2);
  });
});

describe("luminanza", () => {
  it("sta fra 0 e 1, agli estremi giusti", () => {
    expect(luminanza([0, 0, 0])).toBe(0);
    expect(luminanza([255, 255, 255])).toBeCloseTo(1, 10);
  });
});

describe("testoSu", () => {
  it("mette l'inchiostro sui fondi chiari e il crema su quelli scuri", () => {
    expect(testoSu("#24E5FF").colore).toBe(INCHIOSTRO);
    expect(testoSu("#FFD400").colore).toBe(INCHIOSTRO);
    expect(testoSu("#102C1F").colore).toBe(CREMA);
    expect(testoSu("#000000").colore).toBe(CREMA);
  });

  it("scegliendo l'inchiostro l'azzurro del locale dimostrativo diventa leggibile", () => {
    const t = testoSu("#24E5FF");
    expect(t.leggibile).toBe(true);
    expect(t.rapporto).toBeGreaterThan(4.5);
  });

  it("dichiara illeggibile un fondo su cui nessuno dei due colori arriva", () => {
    // un medio esatto: né il crema né l'inchiostro ce la fanno
    const t = testoSu("#7A7A6A");
    expect(t.leggibile).toBe(false);
    expect(t.rapporto).toBeLessThan(4.5);
  });

  it("con la soglia del testo grande accetta ciò che con quella piccola rifiuta", () => {
    expect(testoSu("#7A7A6A", 4.5).leggibile).toBe(false);
    expect(testoSu("#7A7A6A", 3).leggibile).toBe(true);
  });

  it("su un colore scritto male non lascia il testo senza colore", () => {
    const t = testoSu("non-un-colore");
    expect(t.colore).toBe(CREMA);
    expect(t.leggibile).toBe(false);
  });

  it("il rapporto che dichiara è quello del colore che ha scelto", () => {
    const t = testoSu("#24E5FF");
    expect(t.rapporto).toBeCloseTo(contrasto(t.colore, "#24E5FF")!, 10);
  });
});

describe("rapportoLeggibile", () => {
  it("scrive i numeri come si scrivono in italiano", () => {
    expect(rapportoLeggibile(4.5)).toBe("4,50");
    expect(rapportoLeggibile(1.5348)).toBe("1,53");
  });
});

describe("interpola", () => {
  it("agli estremi restituisce gli estremi", () => {
    expect(interpola("#224639", "#834821", 0)).toBe("#224639");
    expect(interpola("#224639", "#834821", 1)).toBe("#834821");
  });

  it("a metà sta davvero in mezzo", () => {
    expect(interpola("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("non esce dall'intervallo, qualunque cosa le si passi", () => {
    expect(interpola("#000000", "#ffffff", -3)).toBe("#000000");
    expect(interpola("#000000", "#ffffff", 12)).toBe("#ffffff");
  });

  it("su tutta la scala dei coperti il crema resta leggibile", () => {
    // è la garanzia che tiene i numeri della mappa dei coperti visibili
    for (let q = 0; q <= 1.0001; q += 0.05) {
      const fondo = interpola("#224639", "#834821", q);
      expect(contrasto(CREMA, fondo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("su un colore scritto male torna il colore di partenza", () => {
    expect(interpola("#224639", "non-un-colore", 0.5)).toBe("#224639");
  });
});
