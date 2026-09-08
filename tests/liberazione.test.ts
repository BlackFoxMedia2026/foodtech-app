import { describe, expect, it } from "vitest";
import { previsioneLiberazione } from "@/lib/liberazione";
import { DURATA_PREDEFINITA_MIN } from "@/lib/durata";
import { durataTipica, MINIMO_MISURATE, type RigaSeduta } from "@/server/rotazione";

/**
 * «Quando si libera questo tavolo».
 *
 * Il conto vecchio partiva dall'orario prenotato e usava sempre i 105 minuti
 * di default: sbagliava due volte sullo stesso numero, e sbagliava in sala,
 * dove qualcuno lo leggeva per promettere un tavolo. Qui si fissano per
 * iscritto i due comportamenti nuovi **e i casi in cui non devono cambiare
 * niente**.
 */

const ADESSO = new Date("2026-09-08T20:00:00.000Z");

function riga(durataMin: number): RigaSeduta {
  const seatedAt = new Date("2026-08-01T19:00:00.000Z");
  return {
    tableId: "t1",
    giorno: "2026-08-01",
    seatedAt,
    closedAt: new Date(seatedAt.getTime() + durataMin * 60_000),
    durationMin: DURATA_PREDEFINITA_MIN,
  };
}

describe("da quando si sono seduti, non da quando avevano prenotato", () => {
  it("un tavolo che si siede in orario finisce all'ora prevista", () => {
    const l = previsioneLiberazione(
      { startsAt: ADESSO, seatedAt: ADESSO, durationMin: 105 },
      ADESSO,
    );
    expect(l.minuti).toBe(105);
    expect(l.daSeduta).toBe(true);
  });

  it("un tavolo che si siede mezz'ora dopo si libera mezz'ora dopo", () => {
    // Era il difetto: seduti alle 20:30 su una prenotazione delle 20:00, la
    // sala diceva «libero fra 75 minuti» mentre leggevano il menu.
    const prenotato = new Date(ADESSO.getTime() - 30 * 60_000);
    const l = previsioneLiberazione(
      { startsAt: prenotato, seatedAt: ADESSO, durationMin: 105 },
      ADESSO,
    );
    expect(l.minuti).toBe(105);
  });

  it("chi non si è ancora seduto si conta dall'orario prenotato: è tutto quello che si sa", () => {
    const fra20 = new Date(ADESSO.getTime() + 20 * 60_000);
    const l = previsioneLiberazione({ startsAt: fra20, seatedAt: null, durationMin: 105 }, ADESSO);
    expect(l.minuti).toBe(125);
    expect(l.daSeduta).toBe(false);
  });

  it("un tavolo oltre la durata dà minuti negativi, non zero", () => {
    const seduti = new Date(ADESSO.getTime() - 150 * 60_000);
    const l = previsioneLiberazione(
      { startsAt: seduti, seatedAt: seduti, durationMin: 105 },
      ADESSO,
    );
    expect(l.minuti).toBe(-45);
  });
});

describe("la durata misurata sostituisce il default, non una decisione", () => {
  const tipica = { medianaMin: 140, misurate: 214 };

  it("con la misura disponibile, una prenotazione col default usa la misura", () => {
    const l = previsioneLiberazione(
      { startsAt: ADESSO, seatedAt: ADESSO, durationMin: DURATA_PREDEFINITA_MIN },
      ADESSO,
      tipica,
    );
    expect(l.durataMin).toBe(140);
    expect(l.fonte).toBe("MISURATO");
  });

  it("una durata decisa da una persona vince sulla mediana", () => {
    // Tavolata di dodici a cui qualcuno ha scritto tre ore: sa più della
    // mediana, e la mediana non lo corregge.
    const l = previsioneLiberazione(
      { startsAt: ADESSO, seatedAt: ADESSO, durationMin: 180 },
      ADESSO,
      tipica,
    );
    expect(l.durataMin).toBe(180);
    expect(l.fonte).toBe("PREVISTO");
  });

  it("senza misura si resta sul previsto, e lo si dichiara", () => {
    const l = previsioneLiberazione(
      { startsAt: ADESSO, seatedAt: ADESSO, durationMin: DURATA_PREDEFINITA_MIN },
      ADESSO,
      null,
    );
    expect(l.durataMin).toBe(DURATA_PREDEFINITA_MIN);
    expect(l.fonte).toBe("PREVISTO");
  });

  it("una mediana a zero non è una misura", () => {
    const l = previsioneLiberazione(
      { startsAt: ADESSO, seatedAt: ADESSO, durationMin: DURATA_PREDEFINITA_MIN },
      ADESSO,
      { medianaMin: 0, misurate: 40 },
    );
    expect(l.fonte).toBe("PREVISTO");
  });
});

describe("la durata tipica: mediana, e solo con abbastanza cene", () => {
  it("sotto il minimo non torna niente", () => {
    const righe = Array.from({ length: MINIMO_MISURATE - 1 }, () => riga(120));
    expect(durataTipica(righe)).toBeNull();
  });

  it("al minimo esatto torna la mediana", () => {
    const righe = Array.from({ length: MINIMO_MISURATE }, () => riga(120));
    expect(durataTipica(righe)).toEqual({ medianaMin: 120, misurate: MINIMO_MISURATE });
  });

  it("un conto dimenticato aperto non sposta la mediana", () => {
    // È il motivo per cui non è una media: una cena da sei ore (conto
    // rimasto aperto fino alla chiusura) sposterebbe la previsione di tutti
    // i tavoli del locale.
    const righe = [...Array.from({ length: 20 }, () => riga(120)), riga(360)];
    const t = durataTipica(righe)!;
    expect(t.medianaMin).toBe(120);
    const media = Math.round((20 * 120 + 360) / 21);
    expect(media).toBeGreaterThan(130);
  });

  it("con un numero pari di cene la mediana è la media delle due centrali", () => {
    const righe = [...Array.from({ length: 6 }, () => riga(100)), ...Array.from({ length: 6 }, () => riga(140))];
    expect(durataTipica(righe)!.medianaMin).toBe(120);
  });

  it("le sedute senza chiusura non entrano nella misura", () => {
    const aperte: RigaSeduta[] = Array.from({ length: 30 }, () => ({ ...riga(120), closedAt: null }));
    expect(durataTipica(aperte)).toBeNull();
  });

  it("una chiusura prima della seduta è un dato rotto e si scarta", () => {
    const rotte: RigaSeduta[] = Array.from({ length: 30 }, () => {
      const r = riga(120);
      return { ...r, closedAt: new Date(r.seatedAt.getTime() - 60_000) };
    });
    expect(durataTipica(rotte)).toBeNull();
  });
});
