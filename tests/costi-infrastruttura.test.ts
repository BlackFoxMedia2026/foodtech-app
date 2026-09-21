import { describe, expect, it } from "vitest";
import {
  convertiInCentesimi,
  costoDiUnListino,
  previsioneFineCiclo,
  statoDelBudget,
  verificaPreInvio,
  SOGLIE_PREDEFINITE,
} from "@/lib/costi-infrastruttura";

/**
 * Il freno economico del modulo DEM.
 *
 * Questi conti decidono se una campagna parte. Sbagliati in un senso lasciano
 * passare un cliente che ci costa più di quanto paga; sbagliati nell'altro
 * fermano un ristorante che ha pagato e ha diritto a inviare. Sono le due
 * facce che i test qui sotto tengono ferme.
 */

const EURO = (e: number) => Math.round(e * 100);

describe("lo stato del budget (§8)", () => {
  it("al 10% non c'è niente da segnalare", () => {
    const r = statoDelBudget(EURO(4), EURO(40));
    expect(r.stato).toBe("NORMALE");
    expect(r.percentuale).toBe(10);
  });

  it("al 75% esatto scatta l'attenzione: la soglia è inclusiva", () => {
    // Se fosse esclusiva, il primo avviso arriverebbe al 75,1% — cioè quando
    // il numero tondo che abbiamo scritto nel piano è già passato.
    expect(statoDelBudget(EURO(30), EURO(40)).stato).toBe("ATTENZIONE");
  });

  it("al 90% è critico", () => {
    expect(statoDelBudget(EURO(36), EURO(40)).stato).toBe("CRITICO");
  });

  it("al 100% è il limite", () => {
    expect(statoDelBudget(EURO(40), EURO(40)).stato).toBe("LIMITE");
  });

  it("oltre il limite resta LIMITE, non diventa qualcos'altro", () => {
    expect(statoDelBudget(EURO(53), EURO(40)).stato).toBe("LIMITE");
  });

  it("senza budget la percentuale è nulla, non zero", () => {
    // Zero direbbe «non ha speso niente». Qui il fatto è un altro: non lo
    // stiamo misurando, e in tabella le due cose non devono somigliarsi.
    const r = statoDelBudget(EURO(28), null);
    expect(r.percentuale).toBeNull();
    expect(r.residuoCents).toBeNull();
    expect(r.stato).toBe("NORMALE");
  });

  it("il residuo è quello che resta, e può essere negativo", () => {
    expect(statoDelBudget(EURO(43), EURO(40)).residuoCents).toBe(EURO(-3));
  });
});

describe("la previsione di fine ciclo (§9)", () => {
  it("a metà mese con ritmo costante prevede il doppio di quanto speso", () => {
    const p = previsioneFineCiclo({
      spesoCents: EURO(20),
      giorniTrascorsi: 15,
      giorniNelCiclo: 30,
      ultimiGiorniCents: Array(7).fill(EURO(20) / 15),
    });
    expect(p.previsioneCents).toBe(EURO(40));
    expect(p.attendibile).toBe(true);
  });

  it("l'esempio di §9: €28 in 18 giorni su 30 sfora un budget da €40", () => {
    const p = previsioneFineCiclo({ spesoCents: EURO(28), giorniTrascorsi: 18, giorniNelCiclo: 30 });
    expect(p.previsioneCents).toBeGreaterThan(EURO(40));
  });

  it("chi ha speso tutto il 2 del mese e poi più niente non risulta in corsa", () => {
    /* Con la sola media questo cliente prevederebbe €30 a fine mese, e
       comparirebbe fra quelli da chiamare. Il ritmo recente dice che non manda
       più niente da una settimana, e la previsione si abbassa. */
    const soloMedia = previsioneFineCiclo({
      spesoCents: EURO(10),
      giorniTrascorsi: 10,
      giorniNelCiclo: 30,
    });
    const conStorico = previsioneFineCiclo({
      spesoCents: EURO(10),
      giorniTrascorsi: 10,
      giorniNelCiclo: 30,
      ultimiGiorniCents: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(conStorico.previsioneCents).toBeLessThan(soloMedia.previsioneCents);
  });

  it("nei primi due giorni la previsione esiste ma si dichiara non attendibile", () => {
    const p = previsioneFineCiclo({ spesoCents: EURO(5), giorniTrascorsi: 1, giorniNelCiclo: 30 });
    expect(p.attendibile).toBe(false);
  });

  it("a ciclo finito la previsione è la spesa: non c'è più niente da prevedere", () => {
    const p = previsioneFineCiclo({ spesoCents: EURO(31), giorniTrascorsi: 30, giorniNelCiclo: 30 });
    expect(p.previsioneCents).toBe(EURO(31));
  });
});

describe("il controllo prima dell'invio (§12 e §13)", () => {
  const invii = { usati: 240_000, riservati: 0, limite: 250_000 };
  const costo = { spesoCents: EURO(36), impegnatoCents: 0, budgetCents: EURO(40), calcolabile: true };

  it("l'esempio di §12: 50.000 destinatari su 10.000 disponibili, bloccata", () => {
    const esito = verificaPreInvio({
      invii,
      costo: { spesoCents: 0, impegnatoCents: 0, budgetCents: null, calcolabile: true },
      destinatari: 50_000,
      costoStimatoCents: EURO(7),
      allowOverage: false,
    });
    expect(esito.consentito).toBe(false);
    if (!esito.consentito) {
      expect(esito.motivo).toBe("EMAIL_LIMIT_EXCEEDED");
      expect(esito.eccedenza).toBe(40_000);
      expect(esito.messaggio).toContain("limite mensile");
    }
  });

  it("l'esempio di §13: gli invii ci stanno, il budget no", () => {
    const esito = verificaPreInvio({
      invii: { usati: 10_000, riservati: 0, limite: 250_000 },
      costo,
      destinatari: 50_000,
      costoStimatoCents: EURO(7),
      allowOverage: false,
    });
    expect(esito.consentito).toBe(false);
    if (!esito.consentito) {
      expect(esito.motivo).toBe("BUDGET_LIMIT_EXCEEDED");
      expect(esito.eccedenza).toBe(EURO(3));
    }
  });

  it("i riservati contano: due campagne programmate non si promettono gli stessi invii", () => {
    const esito = verificaPreInvio({
      invii: { usati: 0, riservati: 8_000, limite: 10_000 },
      costo: { spesoCents: 0, impegnatoCents: 0, budgetCents: null, calcolabile: true },
      destinatari: 8_000,
      costoStimatoCents: 0,
      allowOverage: false,
    });
    expect(esito.consentito).toBe(false);
  });

  it("con allow_overage il superamento passa: è una decisione, non un guasto", () => {
    const esito = verificaPreInvio({
      invii,
      costo,
      destinatari: 50_000,
      costoStimatoCents: EURO(7),
      allowOverage: true,
    });
    expect(esito.consentito).toBe(true);
  });

  it("senza budget configurato il freno economico non interviene", () => {
    const esito = verificaPreInvio({
      invii: { usati: 0, riservati: 0, limite: 250_000 },
      costo: { spesoCents: EURO(900), impegnatoCents: 0, budgetCents: null, calcolabile: true },
      destinatari: 1_000,
      costoStimatoCents: EURO(50),
      allowOverage: false,
    });
    expect(esito.consentito).toBe(true);
  });


  it("il budget già impegnato da un'altra campagna conta come speso (§2)", () => {
    /* L'esempio della richiesta: speso €30, campagna A ne ha impegnati €6,
       campagna B ne stima altri €6. Il costo reale è ancora €30, ma promettere
       gli stessi euro due volte è esattamente come promettere gli stessi invii
       due volte. */
    const esito = verificaPreInvio({
      invii: { usati: 0, riservati: 0, limite: 250_000 },
      costo: { spesoCents: EURO(30), impegnatoCents: EURO(6), budgetCents: EURO(40), calcolabile: true },
      destinatari: 40_000,
      costoStimatoCents: EURO(6),
      allowOverage: false,
    });
    expect(esito.consentito).toBe(false);
    if (!esito.consentito) expect(esito.motivo).toBe("BUDGET_LIMIT_EXCEEDED");
  });

  it("senza listino o senza cambio si blocca, non si passa (§13)", () => {
    /* Un costo non calcolabile varrebbe zero, e zero passa qualunque
       controllo: un guasto nostro diventerebbe il modo più silenzioso di
       spegnere la protezione dei costi. */
    const esito = verificaPreInvio({
      invii: { usati: 0, riservati: 0, limite: 250_000 },
      costo: { spesoCents: EURO(1), impegnatoCents: 0, budgetCents: EURO(40), calcolabile: false },
      destinatari: 1_000,
      costoStimatoCents: 0,
      allowOverage: false,
    });
    expect(esito.consentito).toBe(false);
    if (!esito.consentito) {
      expect(esito.motivo).toBe("COST_CALCULATION_UNAVAILABLE");
      expect(esito.eccedenza).toBe(0);
    }
  });

  it("senza budget un costo non calcolabile non ferma niente", () => {
    // Non c'è nessun tetto da proteggere: bloccare sarebbe solo un danno.
    const esito = verificaPreInvio({
      invii: { usati: 0, riservati: 0, limite: 250_000 },
      costo: { spesoCents: 0, impegnatoCents: 0, budgetCents: null, calcolabile: false },
      destinatari: 1_000,
      costoStimatoCents: 0,
      allowOverage: false,
    });
    expect(esito.consentito).toBe(true);
  });

  it("il limite invii viene prima del budget: al cliente si spiega quello che lo riguarda", () => {
    const esito = verificaPreInvio({
      invii: { usati: 249_000, riservati: 0, limite: 250_000 },
      costo: { spesoCents: EURO(39), impegnatoCents: 0, budgetCents: EURO(40), calcolabile: true },
      destinatari: 50_000,
      costoStimatoCents: EURO(7),
      allowOverage: false,
    });
    expect(esito.consentito).toBe(false);
    if (!esito.consentito) expect(esito.motivo).toBe("EMAIL_LIMIT_EXCEEDED");
  });

  it("una campagna che sta dentro entrambi i limiti parte", () => {
    const esito = verificaPreInvio({
      invii: { usati: 10_000, riservati: 0, limite: 250_000 },
      costo: { spesoCents: EURO(10), impegnatoCents: 0, budgetCents: EURO(40), calcolabile: true },
      destinatari: 20_000,
      costoStimatoCents: EURO(3),
      allowOverage: false,
    });
    expect(esito.consentito).toBe(true);
  });

  it("il tetto è la soglia di blocco del piano, non il budget nudo", () => {
    // Con hardLimit al 120% il budget si può superare fino a quel punto.
    const esito = verificaPreInvio({
      invii: { usati: 0, riservati: 0, limite: 250_000 },
      costo: { spesoCents: EURO(40), impegnatoCents: 0, budgetCents: EURO(40), calcolabile: true },
      destinatari: 1_000,
      costoStimatoCents: EURO(5),
      allowOverage: false,
      soglie: { ...SOGLIE_PREDEFINITE, hardLimitPct: 120 },
    });
    expect(esito.consentito).toBe(true);
  });
});

describe("il listino (§4)", () => {
  it("un prezzo per mille si divide per mille", () => {
    // È il fattore che, saltato, moltiplica per mille il costo del mese.
    expect(costoDiUnListino(184_320, 0.1, "EMAIL_1000")).toBeCloseTo(18.432, 6);
  });

  it("un prezzo per unità si moltiplica e basta", () => {
    expect(costoDiUnListino(5.8, 0.09, "GB")).toBeCloseTo(0.522, 6);
  });

  it("quantità nulla, costo zero, senza divisioni per zero", () => {
    expect(costoDiUnListino(0, 0.1, "EMAIL_1000")).toBe(0);
  });
});

describe("la conversione di valuta (§6)", () => {
  it("applica il cambio e arrotonda ai centesimi", () => {
    expect(convertiInCentesimi(33.19, 0.87)).toBe(2888);
  });

  it("senza cambio non inventa niente", () => {
    // Un 1:1 per difetto sbaglierebbe del 13%: quanto basta a far sembrare in
    // regola un cliente che sta sforando.
    expect(convertiInCentesimi(33.19, null)).toBeNull();
    expect(convertiInCentesimi(33.19, 0)).toBeNull();
  });
});
