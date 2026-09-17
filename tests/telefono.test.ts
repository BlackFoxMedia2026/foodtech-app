import { describe, expect, it } from "vitest";
import {
  CIFRE_IDENTITA,
  codaIdentita,
  normalizzaE164,
  soloCifre,
  stessoNumero,
  telefonoLeggibile,
} from "@/lib/telefono";

/**
 * Su queste funzioni poggia il riconoscimento del cliente **mentre il telefono
 * squilla**: se sbagliano, chi risponde saluta la persona sbagliata o non
 * riconosce un abituale.
 *
 * `Guest.phone` è testo libero, e nello stesso archivio convivono tutte le
 * forme che una persona scrive al volo mentre parla al telefono.
 */

const LO_STESSO_NUMERO = [
  "3331234567",
  "333 1234567",
  "333 123 4567",
  "+39 333 1234567",
  "+393331234567",
  "0039 333 1234567",
  "00393331234567",
  "39 333 1234567",
  "(333) 123-4567",
  " 333.123.4567 ",
];

describe("soloCifre", () => {
  it("toglie tutto quello che non è una cifra", () => {
    expect(soloCifre("+39 333 123-4567")).toBe("393331234567");
    expect(soloCifre("(011) 555.01.23")).toBe("0115550123");
    expect(soloCifre("")).toBe("");
    expect(soloCifre("nessun numero")).toBe("");
  });
});

describe("codaIdentita", () => {
  it("dà le ultime nove cifre, che sono la parte che nessuno riscrive", () => {
    expect(codaIdentita("+39 333 1234567")).toBe("331234567");
    expect(codaIdentita("3331234567")).toBe("331234567");
  });

  it("tutte le forme dello stesso numero danno la stessa coda", () => {
    const code = new Set(LO_STESSO_NUMERO.map((n) => codaIdentita(n)));
    expect(code.size).toBe(1);
    expect([...code][0]).toBe("331234567");
  });

  it("un fisso col prefisso funziona come un cellulare", () => {
    expect(codaIdentita("011 5550123")).toBe("115550123");
    expect(codaIdentita("+39 011 5550123")).toBe("115550123");
    expect(codaIdentita("0039 011 5550123")).toBe("115550123");
  });

  it("sotto le nove cifre non identifica nessuno, invece di tirare a indovinare", () => {
    for (const corto of ["", "123", "5550123", "12345678"]) {
      expect(codaIdentita(corto)).toBeNull();
    }
    expect(codaIdentita("123456789")).toBe("123456789"); // nove esatte: si può
  });

  it("su niente non solleva", () => {
    expect(codaIdentita(null)).toBeNull();
    expect(codaIdentita(undefined)).toBeNull();
  });

  it("la lunghezza della coda è quella dichiarata", () => {
    expect(codaIdentita("+39 333 1234567")).toHaveLength(CIFRE_IDENTITA);
  });
});

describe("stessoNumero", () => {
  it("riconosce lo stesso numero scritto in dieci modi", () => {
    for (const a of LO_STESSO_NUMERO) {
      for (const b of LO_STESSO_NUMERO) {
        expect(stessoNumero(a, b)).toBe(true);
      }
    }
  });

  it("distingue numeri diversi", () => {
    expect(stessoNumero("+39 333 1234567", "+39 333 1234568")).toBe(false);
    expect(stessoNumero("+39 333 1234567", "+39 011 5550123")).toBe(false);
  });

  it("due numeri che non identificano nessuno non sono «lo stesso numero»", () => {
    // altrimenti due chiamate anonime diventerebbero la stessa persona
    expect(stessoNumero("123", "123")).toBe(false);
    expect(stessoNumero(null, null)).toBe(false);
    expect(stessoNumero("", "")).toBe(false);
  });
});

describe("normalizzaE164", () => {
  it("mette il prefisso italiano a un numero nazionale", () => {
    expect(normalizzaE164("333 1234567")).toBe("+393331234567");
    expect(normalizzaE164("011 5550123")).toBe("+390115550123");
  });

  it("se c'è già il + ci crede, anche per un numero straniero", () => {
    expect(normalizzaE164("+1 212 555 0000")).toBe("+12125550000");
    expect(normalizzaE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("«00» davanti è il + scritto all'europea", () => {
    expect(normalizzaE164("0039 333 1234567")).toBe("+393331234567");
    expect(normalizzaE164("001 212 555 0000")).toBe("+12125550000");
  });

  it("il prefisso scritto senza il + viene riconosciuto", () => {
    expect(normalizzaE164("39 333 1234567")).toBe("+393331234567");
  });

  it("NON scambia per prefisso un cellulare che comincia per 39", () => {
    // «393 1234567» è un cellulare italiano vero: senza il controllo sulla
    // lunghezza diventerebbe «+393 1234567», cioè un altro numero
    expect(normalizzaE164("393 1234567")).toBe("+393931234567");
    expect(normalizzaE164("3931234567")).toBe("+393931234567");
  });

  it("su niente torna null invece di un + solitario", () => {
    expect(normalizzaE164(null)).toBeNull();
    expect(normalizzaE164("")).toBeNull();
    expect(normalizzaE164("   ")).toBeNull();
    expect(normalizzaE164("pronto?")).toBeNull();
    expect(normalizzaE164("00")).toBeNull();
  });

  it("normalizzare due volte non cambia il risultato", () => {
    for (const n of LO_STESSO_NUMERO) {
      const una = normalizzaE164(n)!;
      expect(normalizzaE164(una)).toBe(una);
    }
  });

  it("il paese si può cambiare", () => {
    expect(normalizzaE164("612 345 678", "34")).toBe("+34612345678");
  });
});

describe("telefonoLeggibile", () => {
  it("raggruppa i numeri italiani come si leggono a voce", () => {
    expect(telefonoLeggibile("+393331234567")).toBe("+39 333 1234567");
    expect(telefonoLeggibile("3331234567")).toBe("+39 333 1234567");
  });

  it("su un numero straniero non inventa un raggruppamento che non è il suo", () => {
    expect(telefonoLeggibile("+12125550000")).toBe("+12125550000");
  });

  it("su niente torna null", () => {
    expect(telefonoLeggibile(null)).toBeNull();
    expect(telefonoLeggibile("pronto?")).toBeNull();
  });
});
