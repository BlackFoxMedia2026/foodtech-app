import { describe, expect, it } from "vitest";
import {
  formattaCodiceTessera,
  generaCodiceTessera,
  normalizzaCodiceTessera,
  sembraCodiceTessera,
} from "@/lib/tessera";

/**
 * Il numero di tessera: la forma, e cosa deve sopravvivere a chi lo digita.
 *
 * Perché esiste questo file: il codice della tessera è l'unico identificativo
 * del prodotto **fatto per uscire dal database** — stampato su una carta,
 * messo in un QR, dettato al telefono. Tutto quello che gli succede fuori è
 * rumore: maiuscole sbagliate, trattini mancanti, una «O» scritta al posto
 * dello zero. Se la ricerca non sopravvive a quel rumore, il QR sulla
 * fidelity card è un disegno e niente più.
 */

describe("la forma del codice", () => {
  it("è prefisso più due gruppi di quattro", () => {
    expect(generaCodiceTessera()).toMatch(/^TV-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it("non usa le lettere che si confondono con le cifre", () => {
    /*
      I, L, O e U sono fuori dall'alfabeto (Crockford base32): le prime tre
      perché si scambiano con 1 e 0 su una tessera stampata o su uno schermo
      storto, la U perché è quella che, messa a caso insieme alle altre,
      produce parole che nessuno vuole sulla propria tessera.

      Mille codici: con otto caratteri su 32 valori, se una lettera vietata
      fosse nell'alfabeto uscirebbe qui quasi certamente.
    */
    for (let i = 0; i < 1000; i++) {
      expect(generaCodiceTessera()).not.toMatch(/[ILOU]/);
    }
  });

  it("non si ripete", () => {
    // Non dimostra l'unicità — quella la garantisce il vincolo sulla colonna —
    // ma smaschera un generatore rotto, che è il modo in cui questa cosa si
    // rompe davvero.
    const visti = new Set<string>();
    for (let i = 0; i < 500; i++) visti.add(generaCodiceTessera());
    expect(visti.size).toBe(500);
  });
});

describe("chi lo digita storto", () => {
  const CANONICO = "TV-4K7P-9RX2";

  it("minuscolo, senza trattini, con spazi: è sempre la stessa tessera", () => {
    for (const scritto of [
      "TV-4K7P-9RX2",
      "tv-4k7p-9rx2",
      "TV4K7P9RX2",
      "tv 4k7p 9rx2",
      "  TV-4K7P-9RX2  ",
      "4K7P9RX2",
    ]) {
      expect(formattaCodiceTessera(scritto)).toBe(CANONICO);
    }
  });

  it("la O si legge zero, la I e la L si leggono uno", () => {
    // È il caso del cliente che detta il numero al telefono. Senza questa
    // regola, «TV-O123-4567» non troverebbe «TV-0123-4567» e chi cerca
    // concluderebbe che la tessera non esiste.
    expect(normalizzaCodiceTessera("TV-O123-4567")).toBe("01234567");
    expect(normalizzaCodiceTessera("TV-I23L-4567")).toBe("12314567");
  });
});

describe("quando un testo cercato è una tessera", () => {
  it("col prefisso basta il prefisso", () => {
    // Nessun cliente si chiama «TV-…»: appena c'è il prefisso, non c'è dubbio.
    expect(sembraCodiceTessera("TV-4K7P-9RX2")).toBe(true);
    expect(sembraCodiceTessera("tv 4k7p")).toBe(true);
  });

  it("senza prefisso serve la lunghezza piena", () => {
    expect(sembraCodiceTessera("4K7P9RX2")).toBe(true);
    expect(sembraCodiceTessera("4K7P")).toBe(false);
  });

  it("i nomi delle persone non sono tessere", () => {
    /*
      È il controllo che protegge la ricerca. «Anna» e «Elena» sono fatte
      tutte di lettere dell'alfabeto base32: senza un criterio di lunghezza
      finirebbero a interrogare anche la colonna dei codici, e — peggio — una
      ricerca larga sui codici renderebbe imprevedibile quale riga torna
      prima.
    */
    for (const nome of ["Anna", "Elena", "Vitale", "elena.vitale27@example.com", "Rossi Mario"]) {
      expect(sembraCodiceTessera(nome)).toBe(false);
    }
  });

  it("un numero di telefono non è una tessera", () => {
    // Otto cifre sarebbero della forma giusta, ma un telefono italiano ne ha
    // dieci e porta il `+`: la ricerca deve continuare a trattarlo da telefono.
    expect(sembraCodiceTessera("+39 368 7409145")).toBe(false);
    expect(sembraCodiceTessera("3687409145")).toBe(false);
  });

  it("una stringa troppo corta non è niente", () => {
    expect(sembraCodiceTessera("")).toBe(false);
    expect(sembraCodiceTessera("ab")).toBe(false);
  });
});
