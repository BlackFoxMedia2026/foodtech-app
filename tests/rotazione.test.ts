import { describe, expect, it } from "vitest";
import { MINIMO_MISURATE, calcolaRotazione, type RigaSeduta } from "@/server/rotazione";

/**
 * Quanto stanno a tavola, e quante volte gira un tavolo.
 *
 * La funzione è pura e questi test non toccano il database. Verificano
 * soprattutto **cosa entra nella misura e cosa no**: una media calcolata sui
 * dati sbagliati fa cambiare la durata delle prenotazioni, e quella decide
 * quanti tavoli il motore accetta di vendere ogni sera.
 */

const ORA = new Date("2026-09-05T18:00:00.000Z");

function seduta(over: Partial<RigaSeduta> = {}): RigaSeduta {
  return {
    tableId: "t1",
    giorno: "2026-09-05",
    seatedAt: ORA,
    closedAt: new Date(ORA.getTime() + 105 * 60_000),
    durationMin: 105,
    ...over,
  };
}

describe("quanto stanno a tavola", () => {
  it("misura solo chi si è seduto e ha chiuso il conto", () => {
    const r = calcolaRotazione([
      seduta({ closedAt: new Date(ORA.getTime() + 100 * 60_000) }),
      seduta({ closedAt: new Date(ORA.getTime() + 140 * 60_000) }),
      // Nessun orario di chiusura: non dice quanto è durata.
      seduta({ closedAt: null }),
    ]);
    expect(r.sedute).toBe(3);
    expect(r.misurate).toBe(2);
    expect(r.durataMediaMin).toBe(120);
  });

  it("porta accanto la durata prevista, che è il numero da cambiare", () => {
    const r = calcolaRotazione(
      Array.from({ length: MINIMO_MISURATE }, () =>
        seduta({ closedAt: new Date(ORA.getTime() + 130 * 60_000), durationMin: 105 }),
      ),
    );
    expect(r.durataMediaMin).toBe(130);
    expect(r.durataPrevistaMin).toBe(105);
    expect(r.abbastanza).toBe(true);
  });

  it("sotto il minimo non si dà per buona: è l'aneddoto di una serata", () => {
    const r = calcolaRotazione(Array.from({ length: MINIMO_MISURATE - 1 }, () => seduta()));
    expect(r.abbastanza).toBe(false);
  });

  it("una chiusura prima dell'arrivo non è una durata negativa: resta fuori", () => {
    const r = calcolaRotazione([seduta({ closedAt: new Date(ORA.getTime() - 10 * 60_000) }), seduta()]);
    expect(r.misurate).toBe(1);
    expect(r.durataMediaMin).toBe(105);
  });
});

describe("quante volte gira un tavolo", () => {
  it("conta gli usi per tavolo in un giorno di servizio", () => {
    const r = calcolaRotazione([
      // Il tavolo 1 usato due volte lo stesso giorno, il tavolo 2 una volta.
      seduta({ tableId: "t1" }),
      seduta({ tableId: "t1" }),
      seduta({ tableId: "t2" }),
    ]);
    expect(r.tavoliUsati).toBe(2);
    expect(r.giorniDiServizio).toBe(1);
    // Due coppie tavolo-giorno: una da due usi, una da uno.
    expect(r.giri).toBe(1.5);
  });

  it("giorni diversi non si sommano sullo stesso tavolo", () => {
    const r = calcolaRotazione([
      seduta({ tableId: "t1", giorno: "2026-09-05" }),
      seduta({ tableId: "t1", giorno: "2026-09-06" }),
    ]);
    expect(r.giorniDiServizio).toBe(2);
    expect(r.giri).toBe(1);
  });

  it("chi si siede senza tavolo assegnato non conta nei giri, ma conta nella durata", () => {
    const r = calcolaRotazione([seduta({ tableId: null }), seduta({ tableId: null })]);
    expect(r.tavoliUsati).toBe(0);
    expect(r.giri).toBeNull();
    expect(r.misurate).toBe(2);
  });

  it("senza nessuna seduta non inventa niente", () => {
    const r = calcolaRotazione([]);
    expect(r.durataMediaMin).toBeNull();
    expect(r.giri).toBeNull();
    expect(r.abbastanza).toBe(false);
  });
});
