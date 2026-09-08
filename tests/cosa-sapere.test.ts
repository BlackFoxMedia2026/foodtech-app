import { describe, expect, it } from "vitest";
import { cosaSapere, MAX_RIGHE_DA_SAPERE, notaPreferenze } from "@/lib/cosa-sapere";

/**
 * «Cosa sapere di questo ospite».
 *
 * È una riga che si legge in piedi, con un cliente davanti: l'ordine conta
 * più del contenuto, perché la prima riga è l'unica che qualcuno leggerà
 * sempre. Qui si fissa quell'ordine, e si fissa **cosa non deve comparire**.
 */

describe("l'ordine è quello dell'urgenza", () => {
  it("l'allergia sta prima di tutto, anche di un compleanno", () => {
    const righe = cosaSapere({
      allergies: "Niente glutine",
      occasion: "BIRTHDAY",
      visits: 9,
      loyaltyTier: "VIP",
    });
    expect(righe[0].testo).toBe("Niente glutine");
    expect(righe[0].tono).toBe("attenzione");
  });

  it("l'occasione viene prima delle note e di chi è", () => {
    const righe = cosaSapere({ occasion: "ANNIVERSARY", privateNotes: "Tavolo lontano dalla porta", visits: 6 });
    expect(righe.map((r) => r.testo)).toEqual([
      "Anniversario",
      "Tavolo lontano dalla porta",
      "6ª visita",
    ]);
  });

  it("l'assenza si dice per ultima, come fatto e senza giudizio", () => {
    const righe = cosaSapere({ noShows: 2, visits: 0 });
    expect(righe.map((r) => r.testo)).toEqual(["Prima volta qui", "2 volte non si è presentato"]);
    expect(righe[1].tono).toBe("attenzione");
  });

  it("non si superano quattro righe: la quinta cosa serve alla scheda, non al tavolo", () => {
    const righe = cosaSapere({
      allergies: "Crostacei",
      occasion: "BIRTHDAY",
      privateNotes: "Chiede sempre il tavolo 4",
      preferences: { note: "Non ama la musica alta" },
      visits: 12,
      loyaltyTier: "VIP",
      noShows: 1,
    });
    expect(righe).toHaveLength(MAX_RIGHE_DA_SAPERE);
    // L'allergia non viene mai tagliata dal tetto: è la prima.
    expect(righe[0].testo).toBe("Crostacei");
  });

  it("il tetto non butta via un avviso per tenere una preferenza", () => {
    // Era il difetto della prima versione, visto dal vivo: su un ospite con
    // allergia, anniversario, nota e preferenze scompariva «una volta non si
    // è presentato», cioè il fatto che decide se quel tavolo lo si tiene.
    const righe = cosaSapere({
      allergies: "Crostacei",
      occasion: "BIRTHDAY",
      privateNotes: "Chiede sempre il tavolo 4",
      preferences: { note: "Non ama la musica alta" },
      visits: 12,
      loyaltyTier: "VIP",
      noShows: 1,
    });
    expect(righe.map((r) => r.testo)).toContain("Una volta non si è presentato");
    // e l'ordine resta quello dell'urgenza: l'allergia prima di tutto
    expect(righe[0].testo).toBe("Crostacei");
    // l'avviso resta in fondo, dove sta nell'ordine di partenza
    expect(righe.at(-1)!.testo).toBe("Una volta non si è presentato");
  });
});

describe("si dicono solo fatti, e ognuno porta la sua fonte", () => {
  it("di un ospite senza niente da sapere non si dice niente", () => {
    // Nessuna riga: **non** «nessuna informazione disponibile», che
    // occuperebbe lo spazio di un fatto senza esserlo.
    expect(cosaSapere({ visits: 2 })).toEqual([]);
  });

  it("ogni riga ha una fonte scritta", () => {
    const righe = cosaSapere({ allergies: "Lattosio", visits: 0, occasion: "DATE" });
    for (const r of righe) expect(r.fonte.length).toBeGreaterThan(10);
  });

  it("una sola riga su chi è: affezionato non si somma a «ottava visita»", () => {
    const righe = cosaSapere({ visits: 8, loyaltyTier: "VIP" });
    expect(righe).toHaveLength(1);
    expect(righe[0].testo).toBe("Cliente affezionato · 8ª visita");
  });

  it("fra due e quattro visite non si dice niente: non è ancora un'abitudine", () => {
    expect(cosaSapere({ visits: 3 })).toEqual([]);
    expect(cosaSapere({ visits: 5 }).map((r) => r.testo)).toEqual(["5ª visita"]);
  });

  it("un'occasione che il database non conosce non inventa una frase", () => {
    expect(cosaSapere({ occasion: "QUALCOSA_ALTRO", visits: 2 })).toEqual([]);
  });

  it("le note lunghe si accorciano senza spezzare le parole", () => {
    const lunga =
      "Preferisce il tavolo in fondo alla sala, lontano dalla porta e dalla cucina, e chiede sempre acqua naturale a temperatura ambiente";
    const testo = cosaSapere({ privateNotes: lunga })[0].testo;
    expect(testo.length).toBeLessThan(lunga.length);
    expect(testo.endsWith("…")).toBe(true);
    expect(testo).not.toMatch(/\s…$/);
  });

  it("uno spazio non è una nota", () => {
    expect(cosaSapere({ privateNotes: "   ", allergies: "\n", visits: 2 })).toEqual([]);
  });
});

describe("la nota delle preferenze si legge da un posto solo", () => {
  it("prende la nota dal campo JSON", () => {
    expect(notaPreferenze({ note: "Vicino alla finestra" })).toBe("Vicino alla finestra");
  });

  it("un JSON senza nota, o con una nota vuota, non è una nota", () => {
    expect(notaPreferenze({})).toBeNull();
    expect(notaPreferenze({ note: "   " })).toBeNull();
    expect(notaPreferenze(null)).toBeNull();
    expect(notaPreferenze("una stringa")).toBeNull();
  });
});
