import { describe, expect, it } from "vitest";
import { accorda } from "@/lib/accordo";

describe("accorda", () => {
  it("con uno il singolare, con più di uno il plurale", () => {
    expect(accorda(["Confermato", "Confermati"], 1)).toBe("Confermato");
    expect(accorda(["Confermato", "Confermati"], 3)).toBe("Confermati");
    expect(accorda(["sta arrivando", "stanno arrivando"], 1)).toBe("sta arrivando");
    expect(accorda(["sta arrivando", "stanno arrivando"], 12)).toBe("stanno arrivando");
  });

  it("con zero il plurale, come si dice in italiano", () => {
    expect(accorda(["Avvisato", "Avvisati"], 0)).toBe("Avvisati");
    expect(accorda(["persona", "persone"], 0)).toBe("persone");
  });

  it("una parola che non cambia resta com'è, qualunque sia il numero", () => {
    for (const v of [0, 1, 2, "3/17"]) {
      expect(accorda("entro 60 min", v)).toBe("entro 60 min");
      expect(accorda("occupati", v)).toBe("occupati");
    }
  });

  it("su un valore non numerico resta il plurale: su una frazione la coppia non ha senso", () => {
    expect(accorda(["Tavolo", "Tavoli"], "3/17")).toBe("Tavoli");
    expect(accorda(["Tavolo", "Tavoli"], "1/17")).toBe("Tavoli");
  });

  it("distingue l'uno numerico dalla stringa «1»", () => {
    // `valore` arriva come numero dai contatori e come stringa dalle frazioni:
    // «1» stringa non è un conteggio, è un'etichetta composta
    expect(accorda(["Tavolo", "Tavoli"], 1)).toBe("Tavolo");
    expect(accorda(["Tavolo", "Tavoli"], "1")).toBe("Tavoli");
  });
});
