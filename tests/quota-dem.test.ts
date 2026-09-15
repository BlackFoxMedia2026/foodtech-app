import { describe, expect, it } from "vitest";
import {
  cicloDi,
  disponibili,
  nomeCiclo,
  percentualeUsata,
  prossimoCiclo,
  sogliaDaAvvisare,
  verificaQuota,
} from "@/lib/dem-quota";

/**
 * I conti della quota DEM, senza database.
 *
 * Sono le regole che decidono se una campagna parte, e sbagliarne una non
 * produce un errore visibile: produce una campagna spedita a metà, o un
 * cliente che paga invii che non ha fatto. Vanno verificate qui, dove costano
 * un millisecondo, e non su Postgres.
 */

describe("disponibili", () => {
  it("sottrae usati e riservati", () => {
    expect(disponibili({ limite: 100_000, usati: 32_480, riservati: 0 })).toBe(67_520);
  });

  it("conta i riservati come spesi: è ciò che impedisce di prometterli due volte", () => {
    expect(disponibili({ limite: 10_000, usati: 0, riservati: 8_000 })).toBe(2_000);
  });

  it("non scende sotto zero nemmeno se il piano è calato sotto il consumo", () => {
    // Downgrade: a fine ciclo il tetto scende a 20.000 e ne erano partiti 25.000.
    expect(disponibili({ limite: 20_000, usati: 25_000, riservati: 0 })).toBe(0);
  });
});

describe("percentualeUsata", () => {
  it("arrotonda all'intero", () => {
    expect(percentualeUsata({ limite: 100_000, usati: 32_480, riservati: 0 })).toBe(32);
  });

  it("senza limite è piena, non vuota", () => {
    // Una barra vuota direbbe «hai tutto lo spazio del mondo» a chi non ne ha.
    expect(percentualeUsata({ limite: 0, usati: 0, riservati: 0 })).toBe(100);
  });

  it("non supera il cento", () => {
    expect(percentualeUsata({ limite: 500, usati: 900, riservati: 0 })).toBe(100);
  });
});

describe("verificaQuota", () => {
  it("passa quando la campagna ci sta", () => {
    const esito = verificaQuota({ limite: 100_000, usati: 32_480, riservati: 0 }, 12_430);
    expect(esito.sufficiente).toBe(true);
  });

  it("dice quanti ne mancano, che è l'unico numero utile a chi è bloccato", () => {
    const esito = verificaQuota({ limite: 10_000, usati: 7_570, riservati: 0 }, 4_820);
    expect(esito).toEqual({ sufficiente: false, disponibili: 2_430, richiesti: 4_820, mancanti: 2_390 });
  });

  it("boccia anche l'eccedenza di un solo invio: la campagna è atomica", () => {
    const esito = verificaQuota({ limite: 500, usati: 0, riservati: 0 }, 501);
    expect(esito.sufficiente).toBe(false);
  });

  it("il caso del piano incluso contro un segmento vero", () => {
    // Scenario di §59: 900 destinatari eleggibili, 500 invii compresi.
    const esito = verificaQuota({ limite: 500, usati: 0, riservati: 0 }, 900);
    expect(esito).toMatchObject({ sufficiente: false, mancanti: 400 });
  });
});

describe("sogliaDaAvvisare", () => {
  it("avvisa alla prima soglia superata", () => {
    expect(sogliaDaAvvisare(82, [])).toBe(80);
  });

  it("non ripete un avviso già dato nello stesso ciclo", () => {
    expect(sogliaDaAvvisare(82, [80])).toBeNull();
  });

  it("chi salta dal 70 al 100 riceve «hai finito», non tre avvisi in fila", () => {
    expect(sogliaDaAvvisare(100, [])).toBe(100);
  });

  it("sotto la prima soglia non dice niente", () => {
    expect(sogliaDaAvvisare(79, [])).toBeNull();
  });
});

describe("cicli", () => {
  it("il ciclo prende il nome dal suo inizio, non da oggi", () => {
    expect(cicloDi(new Date("2026-09-28T00:00:00Z"))).toBe("2026-09");
  });

  it("avanza di mese, non di trenta giorni", () => {
    // Trenta giorni dal 31 gennaio è il 2 marzo: febbraio sparirebbe dallo storico.
    expect(prossimoCiclo(new Date("2026-01-31T00:00:00Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("dal primo del mese al primo del mese", () => {
    expect(prossimoCiclo(new Date("2026-09-01T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("scrive il mese come lo direbbe una persona", () => {
    expect(nomeCiclo("2026-09")).toBe("settembre 2026");
  });
});
