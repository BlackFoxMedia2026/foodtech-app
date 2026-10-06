import { describe, expect, it } from "vitest";
import {
  annullaAzione,
  ATTESA_ANNULLA_MS,
  avviaAzione,
  azioneScaduta,
  daQuanto,
  dataEstesa,
  eNuova,
  etichettaAzione,
  gruppiOggi,
  pillaNuova,
  quandoArriva,
  testoAvviso,
  type PrenotazioneRiquadro,
} from "@/lib/prenotazioni-nuove";

/**
 * **Il riquadro «Prenotazioni» della Panoramica**, nelle sue regole pure: chi
 * è nuova, come si dice quando arriva, come si divide la giornata, e la coda
 * che tiene un gesto annullabile per cinque secondi prima di farlo partire.
 *
 * Le scritture vere stanno in `prenotazioni-nuove-gestione.test.ts`.
 */

const FUSO = "Europe/Rome";
/** Martedì 6 ottobre 2026, 18:00 a Roma (16:00 UTC). */
const ADESSO = new Date("2026-10-06T16:00:00.000Z");

function riga(over: Partial<PrenotazioneRiquadro> = {}): PrenotazioneRiquadro {
  return {
    id: "b1",
    nome: "Francesca Rinaldi",
    partySize: 4,
    startsAt: "2026-10-06T18:30:00.000Z", // 20:30 a Roma
    createdAt: ADESSO.toISOString(),
    status: "PENDING",
    seenAt: null,
    ...over,
  };
}

describe("chi è nuova", () => {
  it("una richiesta in attesa è sempre nuova, anche se qualcuno l'ha già guardata", () => {
    expect(eNuova(riga())).toBe(true);
    expect(eNuova(riga({ seenAt: ADESSO.toISOString() }))).toBe(true);
  });

  it("una confermata da un collega resta nuova finché nessuno l'ha vista", () => {
    expect(eNuova(riga({ status: "CONFIRMED" }))).toBe(true);
    expect(eNuova(riga({ status: "CONFIRMED", seenAt: ADESSO.toISOString() }))).toBe(false);
  });

  it("arrivati, seduti, chiuse e annullate non sono mai nuove", () => {
    for (const status of ["ARRIVED", "SEATED", "COMPLETED", "NO_SHOW", "CANCELLED"] as const) {
      expect(eNuova(riga({ status }))).toBe(false);
    }
  });

  it("la pillola dice la parola, non solo il colore", () => {
    expect(pillaNuova(riga())).toEqual({ tipo: "da-confermare", parola: "Da confermare" });
    expect(pillaNuova(riga({ status: "CONFIRMED" }))).toEqual({
      tipo: "gia-confermata",
      parola: "Già confermata",
    });
  });
});

describe("le parole del tempo", () => {
  it("stasera a cena, oggi a pranzo — nel fuso del locale", () => {
    expect(quandoArriva(new Date("2026-10-06T18:30:00.000Z"), ADESSO, FUSO)).toEqual({
      prefisso: "Stasera alle",
      ora: "20:30",
    });
    expect(quandoArriva(new Date("2026-10-06T11:15:00.000Z"), ADESSO, FUSO)).toEqual({
      prefisso: "Oggi alle",
      ora: "13:15",
    });
  });

  it("domani, e poi il giorno della settimana; il mese solo se è un altro", () => {
    expect(quandoArriva(new Date("2026-10-07T18:00:00.000Z"), ADESSO, FUSO).prefisso).toBe("Domani alle");
    expect(quandoArriva(new Date("2026-10-10T18:00:00.000Z"), ADESSO, FUSO).prefisso).toBe("Sabato 10 alle");
    expect(quandoArriva(new Date("2026-11-03T19:00:00.000Z"), ADESSO, FUSO).prefisso).toBe(
      "Martedì 3 novembre alle",
    );
  });

  it("la mezzanotte è quella del locale, non quella del server", () => {
    // 23:30 UTC del 6 è già l'1:30 del 7 a Roma: è «domani», non «stasera».
    expect(quandoArriva(new Date("2026-10-06T23:30:00.000Z"), ADESSO, FUSO).prefisso).toBe("Domani alle");
  });

  it("da quanto è arrivata", () => {
    const fa = (min: number) => new Date(ADESSO.getTime() - min * 60_000);
    expect(daQuanto(fa(0), ADESSO)).toBe("ora");
    expect(daQuanto(fa(11), ADESSO)).toBe("11 min fa");
    expect(daQuanto(fa(125), ADESSO)).toBe("2 h fa");
    expect(daQuanto(fa(3 * 24 * 60), ADESSO)).toBe("3 g fa");
  });

  it("la data in testata, in esteso e con la maiuscola", () => {
    expect(dataEstesa(ADESSO, FUSO)).toBe("Martedì 6 ottobre");
  });
});

describe("la scheda Oggi", () => {
  it("pranzo prima della cena, in ordine d'orario, con i coperti di ciascuno", () => {
    const gruppi = gruppiOggi(
      [
        riga({ id: "c2", startsAt: "2026-10-06T19:15:00.000Z", partySize: 2, status: "CONFIRMED" }),
        riga({ id: "p1", startsAt: "2026-10-06T11:15:00.000Z", partySize: 2, status: "ARRIVED" }),
        riga({ id: "c1", startsAt: "2026-10-06T18:30:00.000Z", partySize: 4, status: "CONFIRMED" }),
      ],
      FUSO,
    );
    expect(gruppi.map((g) => g.etichetta)).toEqual(["Pranzo", "Cena"]);
    expect(gruppi[0]!.coperti).toBe(2);
    expect(gruppi[1]!.righe.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(gruppi[1]!.coperti).toBe(6);
  });

  it("un locale che fa solo cene non mostra un pannello Pranzo vuoto", () => {
    const gruppi = gruppiOggi([riga()], FUSO);
    expect(gruppi.map((g) => g.etichetta)).toEqual(["Cena"]);
  });

  it("chi non si è presentato non conta come coperto", () => {
    const [cena] = gruppiOggi([riga({ partySize: 4 }), riga({ id: "x", partySize: 3, status: "NO_SHOW" })], FUSO);
    expect(cena!.coperti).toBe(4);
  });
});

describe("conferma, rifiuto, vista: il gesto parte dopo, e si può annullare", () => {
  const conferma = { id: "b1", nome: "Francesca Rinaldi", azione: "conferma" as const };

  it("conferma: resta in sospeso per il tempo di «Annulla», poi parte", () => {
    const { inSospeso, daInviare } = avviaAzione(null, conferma, 1_000);
    expect(daInviare).toBeNull();
    expect(inSospeso.parteAlle).toBe(1_000 + ATTESA_ANNULLA_MS);

    // Un attimo prima della scadenza non parte niente…
    expect(azioneScaduta(inSospeso, inSospeso.parteAlle - 1).daInviare).toBeNull();
    // …alla scadenza sì, ed esce dalla coda.
    const scaduta = azioneScaduta(inSospeso, inSospeso.parteAlle);
    expect(scaduta.daInviare).toEqual(inSospeso);
    expect(scaduta.inSospeso).toBeNull();
  });

  it("annulla: il gesto non parte e la card torna", () => {
    const { inSospeso } = avviaAzione(null, { ...conferma, azione: "rifiuta" }, 1_000);
    const r = annullaAzione(inSospeso, "b1");
    expect(r.ripristina).toBe("b1");
    expect(r.inSospeso).toBeNull();
    // E allo scadere del tempo non c'è più niente da inviare.
    expect(azioneScaduta(r.inSospeso, 1_000 + ATTESA_ANNULLA_MS).daInviare).toBeNull();
  });

  it("annullare un gesto già partito non ripristina niente", () => {
    const { inSospeso } = avviaAzione(null, conferma, 1_000);
    const r = annullaAzione(inSospeso, "un-altra");
    expect(r.ripristina).toBeNull();
    expect(r.inSospeso).toEqual(inSospeso);
  });

  it("un secondo gesto fa partire subito il primo: un solo «Annulla» per volta", () => {
    const primo = avviaAzione(null, conferma, 1_000);
    const secondo = avviaAzione(
      primo.inSospeso,
      { id: "b2", nome: "Marco Galli", azione: "vista" },
      2_000,
    );
    expect(secondo.daInviare).toEqual(primo.inSospeso);
    expect(secondo.inSospeso.id).toBe("b2");
    expect(secondo.inSospeso.parteAlle).toBe(2_000 + ATTESA_ANNULLA_MS);
  });

  it("l'avviso e le etichette dicono il nome dell'ospite", () => {
    expect(testoAvviso(conferma)).toBe("Francesca Rinaldi confermata");
    expect(testoAvviso({ ...conferma, azione: "rifiuta" })).toBe("Francesca Rinaldi rifiutata");
    expect(testoAvviso({ ...conferma, azione: "vista" })).toBe("Francesca Rinaldi segnata come vista");
    expect(etichettaAzione("conferma", "Francesca Rinaldi")).toBe(
      "Conferma la prenotazione di Francesca Rinaldi",
    );
    expect(etichettaAzione("vista", "Marco Galli")).toBe("Segna come vista la prenotazione di Marco Galli");
  });
});
