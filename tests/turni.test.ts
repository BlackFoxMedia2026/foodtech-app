import { describe, expect, it } from "vitest";
import {
  durataNetta,
  etichettaSettimana,
  fineInMinuti,
  giorniDellaSettimana,
  haOrario,
  intervalloLeggibile,
  lunediDi,
  minutiAOrario,
  nomeGiornoBreve,
  orarioAMinuti,
  oreLeggibili,
  tipoTurnoBreve,
  TIPI_TURNO,
} from "@/lib/turni";

/**
 * La regola che questi test difendono è una sola, ed è quella che rende
 * possibile il turno serale: **se la fine è prima o uguale all'inizio, è il
 * giorno dopo**. «18:00 → 00:00» deve fare sei ore, non meno diciotto.
 */

describe("orari in minuti", () => {
  it("converte avanti e indietro", () => {
    expect(orarioAMinuti("18:00")).toBe(1080);
    expect(orarioAMinuti("00:00")).toBe(0);
    expect(orarioAMinuti("23:59")).toBe(1439);
    expect(minutiAOrario(1080)).toBe("18:00");
    expect(minutiAOrario(0)).toBe("00:00");
  });

  it("mezzanotte di domani si scrive 1440 e si legge 00:00", () => {
    expect(minutiAOrario(1440)).toBe("00:00");
    expect(minutiAOrario(1530)).toBe("01:30");
  });

  it("rifiuta quello che non è un orario", () => {
    for (const brutto of ["", "18", "18:60", "25:00", "diciotto", "18:0"]) {
      expect(orarioAMinuti(brutto), brutto).toBeNull();
    }
  });
});

describe("la mezzanotte", () => {
  it("18:00 → 00:00 è un turno di sei ore, non negativo", () => {
    const fine = fineInMinuti(1080, "00:00");
    expect(fine).toBe(1440);
    expect(durataNetta(1080, fine!, null)).toBe(360);
    expect(intervalloLeggibile(1080, fine!)).toBe("18:00 → 00:00");
  });

  it("19:00 → 02:00 arriva alle due di notte", () => {
    const fine = fineInMinuti(1140, "02:00");
    expect(fine).toBe(1560);
    expect(oreLeggibili(durataNetta(1140, fine!, null))).toBe("7 h");
  });

  it("un turno di pranzo resta nello stesso giorno", () => {
    expect(fineInMinuti(720, "15:00")).toBe(900);
  });

  it("la pausa si toglie dalla durata", () => {
    expect(durataNetta(1080, 1440, 30)).toBe(330);
    expect(oreLeggibili(330)).toBe("5 h 30′");
  });

  it("una pausa più lunga del turno non produce durate negative", () => {
    expect(durataNetta(1080, 1140, 120)).toBe(0);
  });
});

describe("tipi di turno", () => {
  it("solo il lavoro ha un orario", () => {
    expect(haOrario("WORK")).toBe(true);
    for (const t of TIPI_TURNO.filter((x) => x.value !== "WORK")) {
      expect(haOrario(t.value), t.value).toBe(false);
    }
  });

  it("i sei tipi coprono riposo, ferie, permesso, malattia e indisponibilità", () => {
    expect(TIPI_TURNO.map((t) => t.value)).toEqual([
      "WORK",
      "REST",
      "VACATION",
      "LEAVE",
      "SICK_LEAVE",
      "UNAVAILABLE",
    ]);
    expect(tipoTurnoBreve("REST")).toBe("Riposo");
  });
});

describe("la settimana", () => {
  it("comincia sempre di lunedì", () => {
    // 2026-09-11 è un venerdì.
    expect(lunediDi("2026-09-11")).toBe("2026-09-07");
    // Dal lunedì stesso non si muove.
    expect(lunediDi("2026-09-07")).toBe("2026-09-07");
  });

  it("da domenica torna indietro di sei giorni, non di zero", () => {
    // 2026-09-13 è una domenica: appartiene alla settimana che inizia il 7.
    expect(nomeGiornoBreve("2026-09-13")).toBe("dom");
    expect(lunediDi("2026-09-13")).toBe("2026-09-07");
  });

  it("rende sette giorni consecutivi, da lunedì a domenica", () => {
    const giorni = giorniDellaSettimana("2026-09-07");
    expect(giorni).toHaveLength(7);
    expect(giorni[0]).toBe("2026-09-07");
    expect(giorni[6]).toBe("2026-09-13");
    expect(giorni.map(nomeGiornoBreve)).toEqual(["lun", "mar", "mer", "gio", "ven", "sab", "dom"]);
  });

  it("attraversa il cambio di mese e di anno", () => {
    expect(giorniDellaSettimana("2026-12-28")[6]).toBe("2027-01-03");
    expect(lunediDi("2027-01-01")).toBe("2026-12-28");
  });

  it("l'etichetta nomina entrambi i mesi solo quando la settimana li attraversa", () => {
    expect(etichettaSettimana("2026-09-07")).toBe("7 – 13 settembre");
    expect(etichettaSettimana("2026-09-28")).toBe("28 settembre – 4 ottobre");
  });
});
