import { describe, expect, it } from "vitest";
import type { FoodCostReport, PiattoVenduto } from "@/server/food-cost";
import {
  MINIMO_PIATTI,
  MINIMO_VENDITE_PIATTO,
  MINIMO_VENDITE_TOTALI,
  menuEngineering,
} from "@/server/menu-engineering";

/**
 * Il menu incrociato: quanto piace per quanto rende.
 *
 * La funzione è pura, e questi test non toccano il database: si classificano
 * numeri, e i numeri si possono scrivere qui.
 *
 * La cosa più importante che verificano non è la classifica, è **quando la
 * classifica si rifiuta di esistere**: su due coperti, dire a un ristoratore
 * che un piatto è un «cane» significa fargli togliere dalla carta qualcosa
 * che non ha mai avuto una possibilità.
 */

function piatto(name: string, quantita: number, prezzoUnit: number, costoUnit: number): PiattoVenduto {
  const incassoCents = prezzoUnit * quantita;
  const costoCents = costoUnit * quantita;
  const margineCents = incassoCents - costoCents;
  return {
    menuItemId: name,
    name,
    quantita,
    incassoCents,
    costoCents,
    margineCents,
    marginePct: Math.round((margineCents / incassoCents) * 100),
  };
}

function rendiconto(piatti: PiattoVenduto[], senzaCosto: PiattoVenduto[] = []): FoodCostReport {
  const incassoCopertoCents = piatti.reduce((s, p) => s + p.incassoCents, 0);
  const costoCents = piatti.reduce((s, p) => s + (p.costoCents ?? 0), 0);
  return {
    conti: 20,
    incassoCents: incassoCopertoCents + senzaCosto.reduce((s, p) => s + p.incassoCents, 0),
    incassoCopertoCents,
    costoCents,
    margineCents: incassoCopertoCents - costoCents,
    foodCostPct: 30,
    coperturaPct: 100,
    piatti,
    senzaCosto,
    fuoriCartaCents: 0,
  };
}

/** Quattro piatti abbondantemente sopra i minimi, con margini diversi. */
const CARTA = [
  // Molto venduto, margine alto: stella.
  piatto("Tagliatelle", 40, 1500, 400),
  // Molto venduto, margine basso: cavallo.
  piatto("Insalata", 35, 900, 700),
  // Poco venduto, margine alto: enigma.
  piatto("Costata", 5, 5200, 2600),
  // Poco venduto, margine basso: cane.
  piatto("Sorbetto", 4, 600, 500),
];

describe("i quattro gruppi", () => {
  const esito = menuEngineering(rendiconto(CARTA));

  it("classifica solo quando i dati bastano", () => {
    expect(esito.abbastanzaDati).toBe(true);
    expect(esito.piatti).toHaveLength(4);
  });

  it("quello che vende tanto e rende è una stella", () => {
    expect(esito.piatti.find((p) => p.name === "Tagliatelle")?.quadrante).toBe("stella");
  });

  it("quello che vende tanto e rende poco è un cavallo", () => {
    expect(esito.piatti.find((p) => p.name === "Insalata")?.quadrante).toBe("cavallo");
  });

  it("quello che rende ma non lo ordina nessuno è un enigma", () => {
    expect(esito.piatti.find((p) => p.name === "Costata")?.quadrante).toBe("enigma");
  });

  it("quello che non piace e non rende è un cane", () => {
    expect(esito.piatti.find((p) => p.name === "Sorbetto")?.quadrante).toBe("cane");
  });

  it("i gruppi arrivano in ordine: prima le stelle, ultimi i cani", () => {
    expect(esito.piatti.map((p) => p.quadrante)).toEqual(["stella", "cavallo", "enigma", "cane"]);
  });

  it("dice su quale metro ha deciso", () => {
    // Senza il metro, quattro etichette sono un'opinione con l'aria di un dato.
    expect(esito.margineMedioCents).toBeGreaterThan(0);
    expect(esito.sogliaPopolaritaPct).toBe(Math.round((1 / 4) * 0.7 * 100));
    expect(esito.vendutiClassificati).toBe(84);
  });
});

describe("quando è meglio tacere", () => {
  it("un piatto venduto due volte non è un cane: resta fuori", () => {
    const carta = [...CARTA, piatto("Novità", MINIMO_VENDITE_PIATTO - 1, 1000, 300)];
    const esito = menuEngineering(rendiconto(carta));
    expect(esito.piatti.find((p) => p.name === "Novità")).toBeUndefined();
    expect(esito.esclusi).toContainEqual({
      name: "Novità",
      quantita: MINIMO_VENDITE_PIATTO - 1,
      motivo: "poche_vendite",
    });
  });

  it("con pochi piatti non si classifica niente, e si dice perché", () => {
    const esito = menuEngineering(rendiconto(CARTA.slice(0, MINIMO_PIATTI - 1)));
    expect(esito.abbastanzaDati).toBe(false);
    expect(esito.piatti).toEqual([]);
    expect(esito.perche).toContain(String(MINIMO_PIATTI));
  });

  it("con poche vendite non si classifica niente, nemmeno con tanti piatti", () => {
    const pochi = ["A", "B", "C", "D"].map((n) => piatto(n, MINIMO_VENDITE_PIATTO, 1000, 400));
    const esito = menuEngineering(rendiconto(pochi));
    expect(esito.abbastanzaDati).toBe(false);
    expect(esito.perche).toContain(String(MINIMO_VENDITE_TOTALI));
  });

  it("senza costo dichiarato un piatto non entra: metà del quadro sarebbe inventata", () => {
    const esito = menuEngineering(
      rendiconto(CARTA, [
        { menuItemId: "x", name: "Vino della casa", quantita: 30, incassoCents: 45000, costoCents: null, margineCents: null, marginePct: null },
      ]),
    );
    expect(esito.piatti.find((p) => p.name === "Vino della casa")).toBeUndefined();
    expect(esito.esclusi).toContainEqual({ name: "Vino della casa", quantita: 30, motivo: "senza_costo" });
  });
});

describe("il metro", () => {
  it("«rende» è il margine per piatto, non la percentuale", () => {
    // Un piatto da 5 € con l'80% di margine lascia 4 €; uno da 50 € con il 40%
    // ne lascia 20. Confrontare le percentuali direbbe il contrario di quello
    // che succede in cassa.
    const carta = [
      piatto("Caffè", 60, 150, 30),
      piatto("Bistecca", 20, 5000, 3000),
      piatto("Amaro", 40, 500, 100),
      piatto("Dolce", 25, 800, 200),
    ];
    const esito = menuEngineering(rendiconto(carta));
    const bistecca = esito.piatti.find((p) => p.name === "Bistecca")!;
    const caffe = esito.piatti.find((p) => p.name === "Caffè")!;
    expect(bistecca.margineUnitCents).toBe(2000);
    expect(caffe.margineUnitCents).toBe(120);
    // Il caffè ha una percentuale di margine altissima e lascia in cassa un
    // ventesimo della bistecca: è un cavallo, non una stella.
    expect(caffe.quadrante).toBe("cavallo");
    expect(bistecca.quadrante).toBe("enigma");
  });
});
