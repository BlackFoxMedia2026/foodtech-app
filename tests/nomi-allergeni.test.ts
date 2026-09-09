import { describe, expect, it } from "vitest";
import { ALLERGENI, REGIMI, nomeAllergene, nomeRegime } from "@/server/menu";

/**
 * I nomi di allergeni e regimi alimentari.
 *
 * Sul menu pubblico in produzione si leggeva **«Contiene: , ,»**: gli
 * allergeni erano salvati come `GLUTEN`, `DAIRY`, `EGGS` — codici scritti da
 * una versione precedente — e il dizionario ha chiavi italiane minuscole,
 * quindi ogni etichetta veniva `undefined` e restavano solo le virgole.
 *
 * È la riga che legge chi ha un'allergia, seduto a un tavolo col telefono in
 * mano. La regola che questi test difendono è una sola: **da qui non esce mai
 * una stringa vuota.** Mostrare la punteggiatura di un elenco vuoto è peggio
 * che non mostrare niente, perché dice che l'informazione c'è e poi non la dà.
 */

describe("i codici che il prodotto scrive oggi", () => {
  it("ogni chiave del dizionario ha il suo nome", () => {
    for (const chiave of Object.keys(ALLERGENI)) {
      expect(nomeAllergene(chiave)).toBe(ALLERGENI[chiave as keyof typeof ALLERGENI]);
    }
    for (const chiave of Object.keys(REGIMI)) {
      expect(nomeRegime(chiave)).toBe(REGIMI[chiave as keyof typeof REGIMI]);
    }
  });
});

describe("i codici vecchi, in inglese e maiuscolo", () => {
  it("gli otto codici trovati in produzione hanno un nome italiano", () => {
    // Sono esattamente quelli che c'erano nel database della demo pubblica.
    expect(nomeAllergene("GLUTEN")).toBe("Glutine");
    expect(nomeAllergene("DAIRY")).toBe("Latte");
    expect(nomeAllergene("EGGS")).toBe("Uova");
    expect(nomeAllergene("FISH")).toBe("Pesce");
    expect(nomeAllergene("MUSTARD")).toBe("Senape");
    expect(nomeAllergene("SESAME")).toBe("Sesamo");
    expect(nomeAllergene("SHELLFISH")).toBe("Crostacei");
    expect(nomeAllergene("SULPHITES")).toBe("Solfiti");
  });

  it("anche i regimi vecchi", () => {
    expect(nomeRegime("VEGAN")).toBe("Vegano");
    expect(nomeRegime("VEGETARIAN")).toBe("Vegetariano");
    expect(nomeRegime("GLUTEN_FREE")).toBe("Senza glutine");
    expect(nomeRegime("LACTOSE_FREE")).toBe("Senza lattosio");
  });

  it("le due grafie inglesi dello stesso allergene danno lo stesso nome", () => {
    // «sulphites» e «sulfites», «molluscs» e «mollusks»: la stessa cosa
    // scritta in inglese britannico e americano. Chi legge il menu non deve
    // accorgersi di quale versione del software ha scritto il piatto.
    expect(nomeAllergene("SULFITES")).toBe(nomeAllergene("SULPHITES"));
    expect(nomeAllergene("MOLLUSKS")).toBe(nomeAllergene("MOLLUSCS"));
    expect(nomeAllergene("MILK")).toBe(nomeAllergene("DAIRY"));
  });
});

describe("la regola: mai una stringa vuota", () => {
  it("un codice che non conosciamo si mostra comunque", () => {
    /*
      È il caso che ha causato il difetto. Un codice ignoto non deve
      diventare un buco fra due virgole: si mostra come è, ripulito. Chi
      legge «contiene senape nuova» sa di dover chiedere al cameriere; chi
      legge «contiene:» pensa che non ci sia niente da sapere.
    */
    expect(nomeAllergene("SENAPE_NUOVA")).toBe("senape nuova");
    expect(nomeAllergene("qualcosa")).toBe("qualcosa");
    expect(nomeRegime("KETO")).toBe("keto");
  });

  it("nessun codice, per quanto strano, produce una stringa vuota", () => {
    const strani = ["GLUTEN", "sconosciuto", "A", "_", "__", "MOLTO_LUNGO_E_IGNOTO", "123"];
    for (const c of strani) {
      expect(nomeAllergene(c).trim().length).toBeGreaterThan(0);
      expect(nomeRegime(c).trim().length).toBeGreaterThan(0);
    }
  });

  it("un elenco di codici misti non contiene buchi", () => {
    // La forma in cui il difetto si vedeva: `.map(...).join(", ")`.
    const reso = ["GLUTEN", "uova", "IGNOTO"].map(nomeAllergene).join(", ");
    expect(reso).toBe("Glutine, Uova, ignoto");
    expect(reso).not.toContain(", ,");
    expect(reso).not.toMatch(/^,|,$/);
  });
});
