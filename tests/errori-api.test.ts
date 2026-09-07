import { describe, expect, it } from "vitest";
import { z } from "zod";
import { messaggioDiValidazione } from "@/lib/validation-message";

/**
 * Cosa legge una persona quando un modulo viene rifiutato.
 *
 * Ogni route che valida i dati rispondeva «Alcuni campi non sono validi.», e
 * la spiegazione vera — «Il link dei biglietti non è un indirizzo valido» —
 * finiva in un dettaglio tecnico che nessuna interfaccia mostrava. Chi
 * compilava vedeva un rifiuto senza sapere cosa sistemare, e l'unica strada
 * era provare a caso.
 */

describe("il messaggio di un errore di validazione", () => {
  it("usa la frase scritta da noi, se c'è", () => {
    const schema = z.object({ ticketUrl: z.string().url("Il link dei biglietti non è un indirizzo valido") });
    const esito = schema.safeParse({ ticketUrl: "vieni-in-negozio" });
    expect(esito.success).toBe(false);
    if (!esito.success) {
      expect(messaggioDiValidazione(esito.error)).toBe("Il link dei biglietti non è un indirizzo valido");
    }
  });

  it("non mostra le frasi che Zod scrive da sé, che sono in inglese", () => {
    // «Expected string, received number» è scritto per chi fa il programma:
    // a chi compila un modulo non dice niente.
    const schema = z.object({ nome: z.string() });
    const esito = schema.safeParse({ nome: 42 });
    if (!esito.success) {
      expect(messaggioDiValidazione(esito.error)).toBe("Alcuni campi non sono validi.");
    }
  });

  it("fra più errori sceglie il primo con una frase nostra", () => {
    const schema = z.object({ a: z.string(), b: z.string().min(3, "Il titolo è troppo corto") });
    const esito = schema.safeParse({ a: 1, b: "x" });
    if (!esito.success) {
      expect(messaggioDiValidazione(esito.error)).toBe("Il titolo è troppo corto");
    }
  });

  it("un errore su un campo dentro un oggetto non perde la frase", () => {
    const schema = z.object({ ospite: z.object({ email: z.string().email("Serve un'email valida") }) });
    const esito = schema.safeParse({ ospite: { email: "non-una-email" } });
    if (!esito.success) {
      expect(messaggioDiValidazione(esito.error)).toBe("Serve un'email valida");
    }
  });
});
