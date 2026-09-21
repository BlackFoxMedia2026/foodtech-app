import { describe, expect, it } from "vitest";
import { etichetteDi, priorita, passaIlFiltro, type DatiStato } from "@/lib/stati-costo";

/**
 * Gli stati economici di un cliente, e l'ordine in cui vanno guardati.
 *
 * Il caso che questi test difendono è Aurora Bistrot: al 40% del budget —
 * quindi regolare — e diretta a superarlo di trenta euro. Se la tabella la
 * mostra «regolare» e basta, chi la scorre passa oltre, e il problema si vede
 * a fine mese sulla fattura.
 */

const BASE: DatiStato = {
  stato: "NORMALE",
  inviiFermi: false,
  previsioneOltreBudget: false,
  previsioneAttendibile: true,
  overrideAttivo: false,
  calcolabile: true,
};

const con = (p: Partial<DatiStato>): DatiStato => ({ ...BASE, ...p });

describe("le etichette possono coesistere (§4)", () => {
  it("il caso Aurora Bistrot: regolare **e** previsione di superamento", () => {
    const e = etichetteDi(con({ previsioneOltreBudget: true }));
    expect(e).toEqual(["NORMALE", "PREVISIONE_SUPERAMENTO"]);
  });

  it("critico con override attivo mostra entrambi", () => {
    const e = etichetteDi(con({ stato: "CRITICO", overrideAttivo: true }));
    expect(e).toEqual(["CRITICO", "OVERRIDE_ATTIVO"]);
  });

  it("bloccato sostituisce lo stato: è la cosa che conta di più", () => {
    // Un cliente fermo non sta «al 100% del budget»: sta perdendo campagne.
    const e = etichetteDi(con({ stato: "LIMITE", inviiFermi: true }));
    expect(e[0]).toBe("BLOCCATO");
    expect(e).not.toContain("LIMITE");
  });

  it("su chi ha già superato il budget la previsione non si annuncia", () => {
    // «Potrebbe superare» su chi ha superato è rumore che copre il fatto.
    const e = etichetteDi(con({ stato: "LIMITE", previsioneOltreBudget: true }));
    expect(e).not.toContain("PREVISIONE_SUPERAMENTO");
  });

  it("una previsione non attendibile non produce un'etichetta", () => {
    const e = etichetteDi(con({ previsioneOltreBudget: true, previsioneAttendibile: false }));
    expect(e).toEqual(["NORMALE"]);
  });

  it("il costo non calcolabile si dichiara accanto allo stato", () => {
    const e = etichetteDi(con({ calcolabile: false }));
    expect(e).toContain("NON_CALCOLABILE");
  });
});

describe("l'ordine di lettura (§5)", () => {
  it("bloccato, limite, critico, previsione, attenzione, regolare", () => {
    const ordine = [
      con({ inviiFermi: true }),
      con({ stato: "LIMITE", allowOverage: true } as Partial<DatiStato>),
      con({ stato: "CRITICO" }),
      con({ previsioneOltreBudget: true }),
      con({ stato: "ATTENZIONE" }),
      con({}),
    ].map(priorita);

    const decrescente = [...ordine].sort((a, b) => b - a);
    expect(ordine).toEqual(decrescente);
  });

  it("chi non sappiamo misurare sta sopra chi è tranquillo", () => {
    // Non è un cliente in difficoltà: è un cliente di cui non sappiamo niente,
    // e non saperlo è peggio che saperlo tranquillo.
    expect(priorita(con({ calcolabile: false }))).toBeGreaterThan(priorita(con({})));
  });
});

describe("i filtri (§6)", () => {
  it("«regolari» esclude chi ha una previsione di superamento", () => {
    expect(passaIlFiltro(con({ previsioneOltreBudget: true }), "normali")).toBe(false);
    expect(passaIlFiltro(con({}), "normali")).toBe(true);
  });

  it("«critici» comprende anche chi è al limite", () => {
    expect(passaIlFiltro(con({ stato: "LIMITE" }), "critici")).toBe(true);
  });

  it("«bloccati» prende solo chi ha davvero gli invii fermi", () => {
    expect(passaIlFiltro(con({ stato: "CRITICO" }), "bloccati")).toBe(false);
    expect(passaIlFiltro(con({ inviiFermi: true }), "bloccati")).toBe(true);
  });

  it("«override attivi» non guarda lo stato economico", () => {
    expect(passaIlFiltro(con({ overrideAttivo: true }), "override")).toBe(true);
    expect(passaIlFiltro(con({ stato: "CRITICO" }), "override")).toBe(false);
  });

  it("«tutti» non toglie niente", () => {
    expect(passaIlFiltro(con({ inviiFermi: true }), "tutti")).toBe(true);
  });
});
