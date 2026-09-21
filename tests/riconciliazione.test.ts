import { describe, expect, it } from "vitest";
import { eventiInArrivo, listinoDaCorreggere, riconcilia } from "@/lib/riconciliazione";

/**
 * I tre numeri della riconciliazione.
 *
 * Il rischio che questi test difendono non è un calcolo sbagliato: è la
 * tentazione di farli diventare due. Il costo non attribuito — quello che
 * Amazon fattura e che nessun cliente ha generato — è la misura di quanto il
 * nostro modello non spiega, e farlo sparire dentro una media per cliente
 * significherebbe decidere i prezzi dei piani su un numero inventato.
 */

describe("i tre valori restano distinti", () => {
  it("con la fattura di Amazon si calcolano differenza e scostamento", () => {
    // Attribuito 18,43 $, fattura 20,00 $: un dollaro e mezzo non è di nessuno.
    const r = riconcilia(20, 18.43);
    expect(r.dichiarato).toBe(20);
    expect(r.attribuito).toBe(18.43);
    expect(r.nonAttribuito).toBeCloseTo(1.57, 6);
    expect(r.scostamentoPct).toBeCloseTo(8.52, 1);
    expect(r.stato).toBe("RICONCILIATO");
  });

  it("senza il dato di Amazon non si finge di aver riconciliato", () => {
    const r = riconcilia(null, 18.43);
    expect(r.stato).toBe("SOLO_STIMA");
    expect(r.dichiarato).toBeNull();
    expect(r.nonAttribuito).toBeNull();
    expect(r.scostamentoPct).toBeNull();
    // L'attribuito resta: è l'unica cosa che sappiamo davvero.
    expect(r.attribuito).toBe(18.43);
  });

  it("il non attribuito può essere negativo, e non si nasconde", () => {
    // Abbiamo attribuito più di quanto Amazon fattura: il listino sovrastima,
    // e i clienti stanno «costando» più del vero nei nostri conti.
    const r = riconcilia(15, 18.43);
    expect(r.nonAttribuito).toBeCloseTo(-3.43, 6);
    expect(r.scostamentoPct).toBeLessThan(0);
  });

  it("senza attribuzione lo scostamento non si calcola, invece di dividere per zero", () => {
    const r = riconcilia(5, 0);
    expect(r.scostamentoPct).toBeNull();
    expect(r.nonAttribuito).toBe(5);
  });

  it("i tre numeri non si sommano mai fra loro", () => {
    // Dichiarato = attribuito + non attribuito. Se un giorno qualcuno sommasse
    // tutti e tre otterrebbe il doppio del vero: il test lo fissa per iscritto.
    const r = riconcilia(20, 18.43);
    expect(r.attribuito + (r.nonAttribuito ?? 0)).toBeCloseTo(r.dichiarato ?? 0, 6);
  });
});

describe("quando il listino va corretto", () => {
  it("uno scostamento piccolo non si insegue", () => {
    // Arrotondamenti e messaggi di servizio: cambiare il listino ogni mese
    // significa non poter più confrontare due mesi fra loro.
    expect(listinoDaCorreggere(3)).toBe(false);
    expect(listinoDaCorreggere(-4.9)).toBe(false);
  });

  it("oltre la soglia sì, in entrambe le direzioni", () => {
    expect(listinoDaCorreggere(7)).toBe(true);
    expect(listinoDaCorreggere(-12)).toBe(true);
  });

  it("senza scostamento non c'è niente da decidere", () => {
    expect(listinoDaCorreggere(null)).toBe(false);
  });
});

describe("la catena degli eventi è viva?", () => {
  it("gli eventi in ritardo entro il dieci per cento non sono un allarme", () => {
    expect(eventiInArrivo(1000, 950)).toBe(true);
  });

  it("metà eventi mancanti è il guasto invisibile: campagne che partono, statistiche ferme", () => {
    expect(eventiInArrivo(1000, 500)).toBe(false);
  });

  it("un ciclo senza invii non è un guasto", () => {
    expect(eventiInArrivo(0, 0)).toBe(true);
  });
});
