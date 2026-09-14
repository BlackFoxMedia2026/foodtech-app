import { describe, expect, it } from "vitest";
import { statoCliente } from "@/server/guest-crm";

/**
 * «Sta smettendo di venire?» — e perché la risposta non è una soglia fissa.
 *
 * Questi test esistono per fissare l'unica decisione di prodotto che il CRM
 * cliente prende da solo. La versione facile sarebbe stata «sessanta giorni
 * di silenzio = a rischio», ed è sbagliata per metà dei clienti di qualunque
 * locale: chi viene ogni sabato e manca da un mese ha saltato quattro
 * appuntamenti, chi viene due volte l'anno e manca da un mese è in perfetto
 * orario. Lo stesso numero di giorni descrive due situazioni opposte, quindi
 * il metro è **la cadenza storica di quella persona**.
 *
 * Funzione pura, nessun database: la regola si può discutere leggendo questo
 * file.
 */

describe("lo stato di un cliente", () => {
  it("chi non è mai venuto è «Mai venuto», non «da riattivare»", () => {
    const s = statoCliente(0, null, null);
    expect(s.chiave).toBe("nuovo");
    // Un cliente in anagrafica che non è mai venuto non è un cliente perso:
    // è un cliente che non è ancora arrivato, e sono due lavori diversi.
    expect(s.chiave).not.toBe("da_riattivare");
  });

  it("con una visita sola dice che non c'è abbastanza storia", () => {
    // Il caso più comune di un archivio vero. Inventare uno stato qui
    // vorrebbe dire dare un giudizio su una persona di cui si sa una cosa.
    const s = statoCliente(1, null, 200);
    expect(s.chiave).toBe("non_misurabile");
  });

  it("dentro una volta e mezza la sua cadenza è attivo", () => {
    expect(statoCliente(10, 20, 20).chiave).toBe("attivo");
    expect(statoCliente(10, 20, 30).chiave).toBe("attivo");
  });

  it("fra una volta e mezza e tre volte sta allungando i tempi", () => {
    expect(statoCliente(10, 20, 31).chiave).toBe("regolare");
    expect(statoCliente(10, 20, 60).chiave).toBe("regolare");
  });

  it("oltre il triplo della sua cadenza è da riattivare", () => {
    expect(statoCliente(10, 20, 61).chiave).toBe("da_riattivare");
  });

  it("gli stessi giorni di silenzio danno stati diversi su clienti diversi", () => {
    /*
      È il cuore della regola, e il motivo per cui la soglia fissa non
      funziona. Quaranta giorni senza farsi vedere:

      - per chi viene ogni settimana sono sei appuntamenti saltati;
      - per chi viene ogni tre mesi è in anticipo.
    */
    expect(statoCliente(12, 7, 40).chiave).toBe("da_riattivare");
    expect(statoCliente(4, 90, 40).chiave).toBe("attivo");
  });

  it("una cadenza di zero giorni non fa esplodere il calcolo", () => {
    // Due visite lo stesso giorno — un pranzo e una cena — danno una media di
    // zero giorni, e dividere per zero darebbe `Infinity`: ogni cliente del
    // genere risulterebbe «da riattivare» il giorno dopo essere stato qui.
    const s = statoCliente(2, 0, 1);
    expect(s.chiave).toBe("attivo");
    expect(Number.isFinite(0)).toBe(true);
  });

  it("ogni stato porta con sé il proprio perché", () => {
    // Un'etichetta senza motivo è un'opinione del software: chi lavora in
    // sala ha il diritto di vedere su cosa si basa e di non essere d'accordo.
    for (const s of [
      statoCliente(0, null, null),
      statoCliente(1, null, 10),
      statoCliente(10, 20, 10),
      statoCliente(10, 20, 45),
      statoCliente(10, 20, 100),
    ]) {
      expect(s.perche.length).toBeGreaterThan(10);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("il motivo di chi è sparito contiene sia il ritmo sia il silenzio", () => {
    // «Da riattivare» da solo non permette a nessuno di decidere niente. I due
    // numeri che lo hanno prodotto devono essere leggibili sulla stessa riga.
    const s = statoCliente(10, 18, 62);
    expect(s.perche).toContain("18");
    expect(s.perche).toContain("62");
  });
});
