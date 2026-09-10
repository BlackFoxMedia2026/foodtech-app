import { describe, expect, it } from "vitest";
import { MINIMO_PER_QUOTA, perchePercentualeAssente, quotaAffidabile } from "@/lib/quota";
import { MINIMO_PER_QUOTA as DAL_SERVER } from "@/server/no-show";

/**
 * Quando una percentuale si può dire.
 *
 * Il difetto: la regola esisteva in `server/no-show.ts` e le tre schede in
 * cima alla stessa pagina la ignoravano. Con due prenotazioni e una mancata
 * scrivevano «50%»; con **zero** prenotazioni scrivevano «0%», cioè «abbiamo
 * misurato zero assenze» dove non c'era niente da misurare.
 */
describe("quotaAffidabile", () => {
  it("sotto la soglia una percentuale non si dice", () => {
    for (let n = 0; n < MINIMO_PER_QUOTA; n++) expect(quotaAffidabile(n)).toBe(false);
  });

  it("dalla soglia in su si dice", () => {
    expect(quotaAffidabile(MINIMO_PER_QUOTA)).toBe(true);
    expect(quotaAffidabile(MINIMO_PER_QUOTA + 1)).toBe(true);
    expect(quotaAffidabile(1000)).toBe(true);
  });

  it("la soglia è una sola in tutto il prodotto", () => {
    // due costanti con lo stesso valore sono due costanti che un giorno divergono
    expect(DAL_SERVER).toBe(MINIMO_PER_QUOTA);
  });
});

describe("perchePercentualeAssente", () => {
  it("zero casi non è «troppo pochi»: non è ancora accaduto niente", () => {
    expect(perchePercentualeAssente(0)).toBe("Ancora nessuna prenotazione nel periodo");
  });

  it("sopra zero dice quanti casi ci sono e quanti servono", () => {
    const t = perchePercentualeAssente(3);
    expect(t).toContain("almeno 10");
    expect(t).toContain("su 3");
  });

  it("la parola contata si passa come coppia, e concorda", () => {
    expect(perchePercentualeAssente(0, ["risposta", "risposte"])).toBe(
      "Ancora nessuna risposta nel periodo",
    );
    const t = perchePercentualeAssente(4, ["risposta", "risposte"]);
    expect(t).toContain("almeno 10 risposte");
    expect(t).toContain("su 4 risposte");
  });

  it("con un caso solo il singolare arriva fino in fondo alla frase", () => {
    // «su 1 prenotazioni» era il genere di stonatura che questa coppia evita
    expect(perchePercentualeAssente(1)).toContain("su 1 prenotazione ");
  });
});
