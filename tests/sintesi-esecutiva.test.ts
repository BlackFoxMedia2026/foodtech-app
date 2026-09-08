import { describe, expect, it } from "vitest";
import {
  MAX_RIGHE_SINTESI,
  SCOSTAMENTO_RILEVANTE_PCT,
  scostamento,
  sintesiEsecutiva,
  type DatiSintesi,
} from "@/server/sintesi-esecutiva";

/**
 * «Com'è andata», in cinque righe.
 *
 * La sintesi è la parte di Analytics che qualcuno legge in trenta secondi su
 * un telefono: se dice una cosa non misurata, o mette una rassicurazione al
 * posto di un problema, fa più danni di tutta la pagina che riassume.
 */

const VUOTO: DatiSintesi = {
  periodoGiorni: 30,
  valuta: "EUR",
  ora: { covers: 0, bookings: 0, occupancyRate: 0, noShowRate: 0 },
  prima: { covers: 0, bookings: 0 },
  assenze: { assenze: 0, copertiPersi: 0, costoCents: null, quota: null },
  foodCost: { conti: 0, incassoCents: 0, foodCostPct: null, coperturaPct: 0 },
  incassoPrimaCents: null,
  coda: { chiuse: 0, copertiRecuperati: 0, conversione: null },
  voti: { averageScore: null, responses: 0, nps: null },
  rotazione: { misurate: 0, durataMediaMin: null, durataPrevistaMin: null, abbastanza: false },
  giftCard: { carte: 0, residuoCents: 0 },
  inattivi: 0,
};

function con(patch: Partial<DatiSintesi>): DatiSintesi {
  return { ...VUOTO, ...patch };
}

describe("si tace quando non c'è niente da dire", () => {
  it("un locale nuovo, senza niente di misurato, non produce nessuna riga", () => {
    // Cinque righe di rassicurazioni inventate sarebbero peggio del silenzio.
    expect(sintesiEsecutiva(VUOTO)).toEqual([]);
  });

  it("uno scostamento sotto la soglia non è una notizia", () => {
    const righe = sintesiEsecutiva(
      con({ ora: { ...VUOTO.ora, covers: 102 }, prima: { covers: 100, bookings: 40 } }),
    );
    expect(righe).toEqual([]);
  });

  it("appena supera la soglia, lo dice col numero", () => {
    const righe = sintesiEsecutiva(
      con({
        ora: { ...VUOTO.ora, covers: 100 - SCOSTAMENTO_RILEVANTE_PCT },
        prima: { covers: 100, bookings: 40 },
      }),
    );
    expect(righe).toHaveLength(1);
    expect(righe[0].testo).toContain(`${SCOSTAMENTO_RILEVANTE_PCT}% in meno`);
    expect(righe[0].tono).toBe("problema");
  });

  it("senza il periodo prima non si inventa un confronto", () => {
    const righe = sintesiEsecutiva(con({ ora: { ...VUOTO.ora, covers: 300 } }));
    expect(righe).toEqual([]);
    expect(scostamento(300, 0)).toBeNull();
  });
});

describe("le misure che il locale non ha non compaiono", () => {
  it("senza costi dichiarati non si parla di costo del cibo", () => {
    const righe = sintesiEsecutiva(
      con({ foodCost: { conti: 40, incassoCents: 400_000, foodCostPct: null, coperturaPct: 0 } }),
    );
    expect(righe.some((r) => r.testo.includes("Costo del cibo"))).toBe(false);
    // ma l'incasso sì: quello è misurato
    expect(righe.some((r) => r.testo.includes("incassati"))).toBe(true);
  });

  it("senza risposte al sondaggio non si parla di voti", () => {
    const righe = sintesiEsecutiva(con({ voti: { averageScore: null, responses: 0, nps: null } }));
    expect(righe.some((r) => r.testo.includes("Voto medio"))).toBe(false);
  });

  it("senza abbastanza cene misurate non si parla di durata", () => {
    const righe = sintesiEsecutiva(
      con({
        rotazione: { misurate: 4, durataMediaMin: 200, durataPrevistaMin: 105, abbastanza: false },
      }),
    );
    expect(righe.some((r) => r.testo.includes("durano"))).toBe(false);
  });

  it("il costo delle assenze in euro compare solo se il valore di un coperto è noto", () => {
    const senza = sintesiEsecutiva(
      con({ assenze: { assenze: 3, copertiPersi: 8, costoCents: null, quota: 5 } }),
    );
    expect(senza[0].testo).not.toContain("€");
    expect(senza[0].base).toContain("scontrino medio non è dichiarato");

    const con_ = sintesiEsecutiva(
      con({ assenze: { assenze: 3, copertiPersi: 8, costoCents: 24_000, quota: 5 } }),
    );
    expect(con_[0].testo).toContain("240");
  });
});

describe("prima quello che non va", () => {
  it("i problemi stanno sopra le cose che vanno bene", () => {
    const righe = sintesiEsecutiva(
      con({
        ora: { ...VUOTO.ora, covers: 200 },
        prima: { covers: 100, bookings: 40 },
        assenze: { assenze: 6, copertiPersi: 14, costoCents: 42_000, quota: 8 },
        coda: { chiuse: 20, copertiRecuperati: 26, conversione: 60 },
      }),
    );
    expect(righe[0].tono).toBe("problema");
    expect(righe[0].testo).toContain("assenze");
    // i coperti raddoppiati e la coda sono buone notizie, e stanno sotto
    expect(righe.at(-1)!.tono).toBe("bene");
  });

  it("mai più di cinque righe: una sintesi di dieci righe non è una sintesi", () => {
    const righe = sintesiEsecutiva(
      con({
        ora: { ...VUOTO.ora, covers: 60 },
        prima: { covers: 100, bookings: 40 },
        assenze: { assenze: 6, copertiPersi: 14, costoCents: 42_000, quota: 8 },
        foodCost: { conti: 50, incassoCents: 500_000, foodCostPct: 41, coperturaPct: 80 },
        incassoPrimaCents: 700_000,
        coda: { chiuse: 20, copertiRecuperati: 26, conversione: 60 },
        voti: { averageScore: 3.2, responses: 22, nps: -10 },
        rotazione: { misurate: 40, durataMediaMin: 150, durataPrevistaMin: 105, abbastanza: true },
        giftCard: { carte: 4, residuoCents: 30_000 },
        inattivi: 48,
      }),
    );
    expect(righe).toHaveLength(MAX_RIGHE_SINTESI);
    // e i cinque posti li prendono i problemi, non le gift card
    expect(righe.every((r) => r.tono !== "bene" || r.testo.includes("incassati"))).toBe(true);
  });
});

describe("ogni riga dice su cosa è misurata", () => {
  it("nessuna riga esce senza base", () => {
    const righe = sintesiEsecutiva(
      con({
        ora: { ...VUOTO.ora, covers: 60 },
        prima: { covers: 100, bookings: 40 },
        foodCost: { conti: 50, incassoCents: 500_000, foodCostPct: 30, coperturaPct: 64 },
        voti: { averageScore: 4.6, responses: 38, nps: 55 },
      }),
    );
    expect(righe.length).toBeGreaterThan(2);
    for (const r of righe) expect(r.base.length).toBeGreaterThan(20);
  });

  it("il costo del cibo dice sempre su quanta parte dell'incasso è misurato", () => {
    const righe = sintesiEsecutiva(
      con({ foodCost: { conti: 50, incassoCents: 500_000, foodCostPct: 30, coperturaPct: 64 } }),
    );
    const riga = righe.find((r) => r.testo.includes("Costo del cibo"))!;
    expect(riga.base).toContain("64%");
  });

  it("la durata sbagliata dice anche cosa fa al motore", () => {
    const corta = sintesiEsecutiva(
      con({ rotazione: { misurate: 30, durataMediaMin: 150, durataPrevistaMin: 105, abbastanza: true } }),
    )[0];
    expect(corta.base).toContain("non si liberano in tempo");

    const lunga = sintesiEsecutiva(
      con({ rotazione: { misurate: 30, durataMediaMin: 80, durataPrevistaMin: 105, abbastanza: true } }),
    )[0];
    expect(lunga.base).toContain("rifiuta prenotazioni");
  });

  it("uno scarto di durata piccolo non si segnala: la taratura è giusta", () => {
    const righe = sintesiEsecutiva(
      con({ rotazione: { misurate: 30, durataMediaMin: 112, durataPrevistaMin: 105, abbastanza: true } }),
    );
    expect(righe).toEqual([]);
  });
});
