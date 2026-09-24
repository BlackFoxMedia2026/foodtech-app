import { describe, expect, it } from "vitest";
import { disponiFila, type Forma } from "@/components/shell/disponi-fila";

/*
  Nove voci con misure vicine a quelle vere della barra: in riga fra 75 e 135
  px, in pila fra 44 e 68. Il gap è quello di `gap-1`, la cornice `p-1` più il
  bordo da un pixel per lato.
*/
const riga = [123, 105, 133, 75, 90, 105, 80, 128, 80];
const larghezze: Record<Forma, number[]> = {
  ampia: riga.map((w) => w + 4),
  riga,
  pila: [64, 52, 50, 44, 46, 58, 44, 62, 44],
};
const altro = { ampia: 96, riga: 92, pila: 44 };
const base = { larghezze, altro, gap: 4, cornice: 10, attiva: 0 };
const totale = (forma: Forma) => larghezze[forma].reduce((a, b) => a + b, 0) + 4 * 8 + 10;

describe("La fila della barra si adatta allo spazio che ha", () => {
  it("con spazio per tutto, tiene il respiro pieno", () => {
    const d = disponiFila({ ...base, spazio: totale("ampia") });
    expect(d).toEqual({ forma: "ampia", visibili: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
  });

  it("prima di spostare una voce, stringe le spaziature", () => {
    const d = disponiFila({ ...base, spazio: totale("ampia") - 1 });
    expect(d.forma).toBe("riga");
    expect(d.visibili).toHaveLength(9);
  });

  it("poi sposta le ultime voci in «Altro», e il nome resta intero", () => {
    const d = disponiFila({ ...base, spazio: 800 });
    expect(d.forma).toBe("riga");
    expect(d.visibili).toEqual([0, 1, 2, 3, 4, 5]);
    // Quello che resta in barra, con «Altro» in coda, sta nello spazio.
    const usato = d.visibili.reduce((a, i) => a + riga[i] + 4, 0) + altro.riga + 10;
    expect(usato).toBeLessThanOrEqual(800);
  });

  it("la voce accesa non finisce mai in «Altro»: cede il posto l'ultima visibile", () => {
    const d = disponiFila({ ...base, spazio: 800, attiva: 8 });
    expect(d.visibili).toContain(8);
    expect(d.visibili).toEqual([0, 1, 2, 3, 4, 8]);
  });

  it("sotto le cinque voci in riga passa alla pila, col nome sotto l'icona", () => {
    const d = disponiFila({ ...base, spazio: 560 });
    expect(d.forma).toBe("pila");
    expect(d.visibili).toHaveLength(9);
  });

  it("anche in pila, quello che non entra va in «Altro» e la voce accesa resta", () => {
    const d = disponiFila({ ...base, spazio: 340, attiva: 7 });
    expect(d.forma).toBe("pila");
    expect(d.visibili.length).toBeLessThan(9);
    expect(d.visibili.at(-1)).toBe(7);
    const usato = d.visibili.reduce((a, i) => a + larghezze.pila[i] + 4, 0) + altro.pila + 10;
    expect(usato).toBeLessThanOrEqual(340);
  });

  it("senza voce accesa (una pagina del profilo) prende semplicemente le prime", () => {
    const d = disponiFila({ ...base, spazio: 800, attiva: -1 });
    expect(d.visibili).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("con poche voci il minimo in riga è quante sono: meglio tutte in pila che una sola in riga", () => {
    const poche: Record<Forma, number[]> = {
      ampia: [127, 109, 137],
      riga: [123, 105, 133],
      pila: [64, 52, 50],
    };
    expect(disponiFila({ ...base, larghezze: poche, spazio: 300 })).toEqual({
      forma: "pila",
      visibili: [0, 1, 2],
    });
    expect(disponiFila({ ...base, larghezze: poche, spazio: 380 }).forma).toBe("riga");
  });
});
