import { describe, expect, it } from "vitest";
import {
  coperturaPerFascia,
  disponiInCorsie,
  famigliaDiTurno,
  fasciaVisibile,
  orePiene,
  raggruppaPerOrario,
} from "@/lib/turni-calendario";
import { grigliaMese, primoDelMese, spostaMese, stessoMese } from "@/lib/turni";

/**
 * La geometria del calendario dei turni.
 *
 * Sono i conti che decidono se la schermata si legge: dove sta una card,
 * quanto è larga quando qualcun altro lavora nella stessa fascia, e quante
 * persone ci sono alle nove di sera. Sbagliarli non produce un errore —
 * produce un calendario che mente con l'aria di avere ragione, ed è per
 * questo che stanno in un modulo puro invece che dentro il componente.
 */

function t(id: string, startMinute: number, endMinute: number) {
  return { id, startMinute, endMinute };
}

describe("le corsie dei turni sovrapposti", () => {
  it("chi non si sovrappone tiene tutta la colonna", () => {
    const esito = disponiInCorsie([t("a", 600, 720), t("b", 1080, 1440)]);
    expect(esito.map((c) => [c.turno.id, c.colonna, c.colonne, c.ampiezza])).toEqual([
      ["a", 0, 1, 1],
      ["b", 0, 1, 1],
    ]);
  });

  it("due turni che si accavallano si affiancano, metà per uno", () => {
    // 09–17 e 09–15: il caso del brief.
    const esito = disponiInCorsie([t("nicola", 540, 1020), t("luca", 540, 900)]);
    expect(esito).toHaveLength(2);
    for (const c of esito) {
      expect(c.colonne).toBe(2);
      expect(c.ampiezza).toBe(1);
    }
    expect(esito.map((c) => c.colonna).sort()).toEqual([0, 1]);
  });

  it("una card si allarga sulle corsie che a quell'ora sono libere", () => {
    /*
      a 09–18, b 10:00–11:00, c 10:20–11:20, d 11:40–13:20.

      Sono tre corsie, perché per venti minuti ci sono davvero tre persone
      insieme. Ma `d` comincia quando `b` e `c` hanno già finito: senza
      l'allargamento resterebbe un terzo di colonna per colpa di due turni
      conclusi, ed è il difetto che rende illeggibili i calendari di chi
      questo pezzo non lo scrive.
    */
    const esito = disponiInCorsie([t("a", 540, 1080), t("b", 600, 660), t("c", 620, 680), t("d", 700, 800)]);
    const per = Object.fromEntries(esito.map((c) => [c.turno.id, c]));
    expect(per.d.colonne).toBe(3);
    expect(per.d.colonna).toBe(1);
    expect(per.d.ampiezza).toBe(2);
    // Chi invece un vicino ce l'ha davvero resta della sua larghezza.
    expect(per.a.ampiezza).toBe(1);
  });

  it("un turno che comincia dopo la fine di tutti riprende la colonna intera", () => {
    // Il pranzo finito alle 15 non deve stringere la cena delle 18.
    const esito = disponiInCorsie([t("a", 540, 780), t("b", 720, 840), t("c", 1080, 1440)]);
    const per = Object.fromEntries(esito.map((c) => [c.turno.id, c]));
    expect(per.a.colonne).toBe(2);
    expect(per.c.colonne).toBe(1);
    expect(per.c.ampiezza).toBe(1);
  });

  it("regge sei persone insieme senza far sparire nessuno", () => {
    const turni = Array.from({ length: 6 }, (_, i) => t(`p${i}`, 1080, 1440));
    const esito = disponiInCorsie(turni);
    expect(esito).toHaveLength(6);
    expect(new Set(esito.map((c) => c.colonna)).size).toBe(6);
    expect(esito.every((c) => c.colonne === 6 && c.ampiezza === 1)).toBe(true);
  });

  it("non dipende dall'ordine in cui arrivano", () => {
    const dritti = disponiInCorsie([t("a", 540, 1020), t("b", 600, 900)]);
    const rovesci = disponiInCorsie([t("b", 600, 900), t("a", 540, 1020)]);
    expect(rovesci).toEqual(dritti);
  });
});

describe("il raggruppamento per orario", () => {
  it("una brigata con lo stesso orario è una card sola", () => {
    const brigata = Array.from({ length: 11 }, (_, i) => t(`p${i}`, 1080, 1440));
    const blocchi = raggruppaPerOrario(brigata);
    expect(blocchi).toHaveLength(1);
    expect(blocchi[0].turni).toHaveLength(11);
    expect(blocchi[0]).toMatchObject({ startMinute: 1080, endMinute: 1440 });
  });

  it("orari diversi restano card diverse — il caso del brief", () => {
    // 09–17 e 09–15: stessa ora d'inizio, fine diversa. Sono due.
    const blocchi = raggruppaPerOrario([t("nicola", 540, 1020), t("luca", 540, 900)]);
    expect(blocchi).toHaveLength(2);
  });

  it("i blocchi tornano in corsie come i turni singoli", () => {
    // Un servizio di cinque alle 18–24 e uno di due alle 12–15: non si
    // sovrappongono, quindi due card a tutta colonna.
    const cena = Array.from({ length: 5 }, (_, i) => t(`c${i}`, 1080, 1440));
    const pranzo = [t("a", 720, 900), t("b", 720, 900)];
    const esito = disponiInCorsie(raggruppaPerOrario([...cena, ...pranzo]));
    expect(esito).toHaveLength(2);
    expect(esito.every((c) => c.colonne === 1)).toBe(true);
  });
});

describe("la copertura della giornata", () => {
  it("conta le persone presenti in ogni mezz'ora", () => {
    // 12:00–14:00 e 13:00–15:00 su una fascia 12–15.
    const valori = coperturaPerFascia([t("a", 720, 840), t("b", 780, 900)], 720, 900);
    expect(valori).toEqual([1, 1, 2, 2, 1, 1]);
  });

  it("il buco fra pranzo e cena resta uno zero, non una media", () => {
    const valori = coperturaPerFascia([t("a", 720, 900), t("b", 1080, 1380)], 720, 1380);
    expect(valori[0]).toBe(1);
    // 16:00 → indice (960-720)/30 = 8
    expect(valori[8]).toBe(0);
    expect(valori.includes(0)).toBe(true);
  });

  it("un turno oltre la mezzanotte si conta fino in fondo", () => {
    // 22:00 → 01:00 del giorno dopo = 1320 → 1500.
    const valori = coperturaPerFascia([t("a", 1320, 1500)], 1320, 1500);
    expect(valori).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("la fascia oraria da disegnare", () => {
  it("senza turni mostra la giornata di un ristorante", () => {
    expect(fasciaVisibile([])).toEqual({ da: 8 * 60, a: 24 * 60 });
  });

  it("si allarga fino all'ora piena che contiene il turno più lungo", () => {
    // Una colazione alle 06:30 e una chiusura all'01:30.
    expect(fasciaVisibile([t("a", 390, 1530)])).toEqual({ da: 6 * 60, a: 26 * 60 });
  });

  it("non si stringe per un turno che sta già dentro", () => {
    expect(fasciaVisibile([t("a", 720, 900)])).toEqual({ da: 8 * 60, a: 24 * 60 });
  });

  it("le tacche orarie coprono gli estremi", () => {
    const ore = orePiene(8 * 60, 11 * 60);
    expect(ore).toEqual([480, 540, 600, 660]);
  });
});

describe("la famiglia di colore", () => {
  it("un turno di lavoro prende il colore del suo reparto", () => {
    expect(famigliaDiTurno("WORK", "SALA")).toBe("sala");
    expect(famigliaDiTurno("WORK", "CUCINA")).toBe("cucina");
    expect(famigliaDiTurno("WORK", "BAR")).toBe("bar");
    expect(famigliaDiTurno("WORK", "DIREZIONE")).toBe("direzione");
    expect(famigliaDiTurno("WORK", "ALTRO")).toBe("altro");
  });

  it("l'ora d'inizio non c'entra più niente con il colore", () => {
    // Il colore diceva *quando*, che è già scritto due volte — nella riga in
    // cui sta la card e nell'orario dentro. Adesso dice *dove*.
    expect(famigliaDiTurno("WORK", "CUCINA")).toBe(famigliaDiTurno("WORK", "CUCINA"));
    expect(famigliaDiTurno("WORK", "SALA")).not.toBe(famigliaDiTurno("WORK", "CUCINA"));
  });

  it("chi non lavora si divide in due sole famiglie, e il reparto non conta", () => {
    for (const reparto of ["SALA", "CUCINA", "BAR"] as const) {
      expect(famigliaDiTurno("REST", reparto)).toBe("riposo");
      expect(famigliaDiTurno("UNAVAILABLE", reparto)).toBe("riposo");
      expect(famigliaDiTurno("VACATION", reparto)).toBe("assenza");
      expect(famigliaDiTurno("LEAVE", reparto)).toBe("assenza");
      expect(famigliaDiTurno("SICK_LEAVE", reparto)).toBe("assenza");
    }
  });
});

describe("la griglia del mese", () => {
  it("comincia di lunedì e finisce di domenica", () => {
    const giorni = grigliaMese("2026-09-11");
    expect(giorni[0]).toBe("2026-08-31");
    expect(giorni[giorni.length - 1]).toBe("2026-10-04");
    expect(giorni.length % 7).toBe(0);
  });

  it("contiene tutti i giorni del mese, una volta sola", () => {
    const giorni = grigliaMese("2026-02-10");
    const dentro = giorni.filter((g) => stessoMese(g, "2026-02-01"));
    expect(dentro).toHaveLength(28);
    expect(new Set(giorni).size).toBe(giorni.length);
  });

  it("un febbraio che comincia di lunedì non si porta dietro una riga vuota", () => {
    // Febbraio 2027: dal lunedì 1 alla domenica 28. Quattro righe esatte.
    expect(grigliaMese("2027-02-15")).toHaveLength(28);
  });

  it("scavalca l'anno nei due versi", () => {
    expect(spostaMese("2026-12-11", 1)).toBe("2027-01-01");
    expect(spostaMese("2026-01-11", -1)).toBe("2025-12-01");
    expect(primoDelMese("2026-09-30")).toBe("2026-09-01");
  });
});
