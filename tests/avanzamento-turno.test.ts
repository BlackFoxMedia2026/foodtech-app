import { describe, expect, it } from "vitest";
import { avanzamentoTurno, durataUmana } from "@/lib/avanzamento-turno";

/**
 * L'avanzamento del turno in Home.
 *
 * Quello che queste prove tengono fermo è il caso che rompe sempre questo
 * conto: **il turno che passa la mezzanotte**. Alle 00:30 di un turno
 * cominciato alle 17:00 il minuto corrente è 30 e l'inizio è 1020 — senza
 * normalizzazione la barra tornerebbe a zero proprio nell'ora in cui serve.
 */

describe("le durate si leggono come le direbbe una persona", () => {
  it("ore e minuti, minuti soli, ore tonde", () => {
    expect(durataUmana(252)).toBe("4h 12m");
    expect(durataUmana(45)).toBe("45 min");
    expect(durataUmana(120)).toBe("2h");
    expect(durataUmana(0)).toBe("0 min");
  });

  it("un valore negativo non produce «-5 min» su uno schermo", () => {
    expect(durataUmana(-5)).toBe("0 min");
  });
});

describe("un turno diurno", () => {
  /* 09:00 → 17:00, cioè 540 → 1020. */
  const turno = (ora: number) => avanzamentoTurno(540, 1020, ora);

  it("prima dell'inizio dice quanto manca e non disegna niente", () => {
    const a = turno(8 * 60)!;
    expect(a.stato).toBe("prima");
    expect(a.frazione).toBe(0);
    expect(a.testo).toBe("Comincia fra 1h");
  });

  it("a metà è a metà", () => {
    const a = turno(13 * 60)!;
    expect(a.stato).toBe("in-corso");
    expect(a.percentuale).toBe(50);
    expect(a.testo).toBe("4h rimanenti");
  });

  it("dopo la fine si ferma a cento e non va oltre", () => {
    const a = turno(20 * 60)!;
    expect(a.stato).toBe("finito");
    expect(a.frazione).toBe(1);
    expect(a.minutiRimanenti).toBe(0);
  });
});

describe("un turno che passa la mezzanotte", () => {
  /* 17:00 → 02:00, cioè 1020 → 1560: la convenzione di `lib/turni.ts`. */
  const turno = (ora: number) => avanzamentoTurno(1020, 1560, ora);

  it("alle 17:00 in punto è appena cominciato", () => {
    const a = turno(17 * 60)!;
    expect(a.stato).toBe("in-corso");
    expect(a.percentuale).toBe(0);
    expect(a.testo).toBe("9h rimanenti");
  });

  it("alle 21:00 è quasi a metà", () => {
    const a = turno(21 * 60)!;
    expect(a.percentuale).toBe(44);
    expect(a.testo).toBe("5h rimanenti");
  });

  it("alle 00:30 è dentro, non «non ancora cominciato»", () => {
    // Il caso per cui questo file esiste: 30 < 1020, e senza correzione la
    // barra tornerebbe a zero a mezzanotte.
    const a = turno(30)!;
    expect(a.stato).toBe("in-corso");
    expect(a.minutiRimanenti).toBe(90);
    expect(a.testo).toBe("1h 30m rimanenti");
  });

  it("alle 02:30 è concluso", () => {
    expect(turno(150)!.stato).toBe("finito");
  });

  it("alle 16:00 non è ancora cominciato, e non è «finito da stanotte»", () => {
    const a = turno(16 * 60)!;
    expect(a.stato).toBe("prima");
    expect(a.testo).toBe("Comincia fra 1h");
  });
});

describe("le righe che non dovrebbero esistere", () => {
  it("una fine scritta senza la convenzione del giorno dopo non fa una durata negativa", () => {
    // 17:00 → 02:00 scritto 1020 → 120 invece di 1020 → 1560.
    const a = avanzamentoTurno(1020, 120, 21 * 60)!;
    expect(a.minutiTotali).toBe(540);
    expect(a.stato).toBe("in-corso");
  });

  it("un turno senza orari — un riposo — non ha nessun avanzamento", () => {
    expect(avanzamentoTurno(null, null, 600)).toBeNull();
    expect(avanzamentoTurno(540, null, 600)).toBeNull();
  });

  it("inizio e fine uguali non producono una divisione per zero", () => {
    expect(avanzamentoTurno(600, 600, 600)).toBeNull();
  });
});
