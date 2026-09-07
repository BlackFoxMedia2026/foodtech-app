import { describe, expect, it } from "vitest";
import { DEFAULT_VENUE_TIMEZONE, dateKeyInVenue, shiftDateKey, todayInVenue } from "@/lib/venue-time";

/**
 * Il bug che questi test impediscono di tornare: «oggi» era calcolato in UTC
 * con `new Date().toISOString().slice(0, 10)`. Fra mezzanotte e le 02:00
 * italiane l'interfaccia mostrava il giorno prima — la fascia in cui un
 * ristorante chiude il servizio.
 *
 * Il file di configurazione dei test forza `TZ=UTC`, così questi controlli
 * valgono anche su una macchina impostata su Roma, dove il bug non si vedrebbe.
 */

describe("il giorno del locale", () => {
  it("dopo la mezzanotte italiana è già il giorno nuovo, mentre in UTC è ancora ieri", () => {
    // 00:30 dell'8 settembre a Roma (ora legale, UTC+2)
    const istante = new Date("2026-09-07T22:30:00.000Z");
    expect(istante.toISOString().slice(0, 10)).toBe("2026-09-07"); // il vecchio comportamento
    expect(todayInVenue("Europe/Rome", istante)).toBe("2026-09-08"); // quello giusto
  });

  it("vale anche in ora solare, quando lo scarto è di un'ora", () => {
    // 00:30 del 15 gennaio a Roma (UTC+1)
    const istante = new Date("2026-01-14T23:30:00.000Z");
    expect(istante.toISOString().slice(0, 10)).toBe("2026-01-14");
    expect(todayInVenue("Europe/Rome", istante)).toBe("2026-01-15");
  });

  it("un locale a ovest di Greenwich può essere ancora al giorno prima", () => {
    // 01:00 UTC dell'8 = 21:00 del 7 a New York
    const istante = new Date("2026-09-08T01:00:00.000Z");
    expect(todayInVenue("America/New_York", istante)).toBe("2026-09-07");
    expect(todayInVenue("Europe/Rome", istante)).toBe("2026-09-08");
  });

  it("a metà pomeriggio tutti i fusi europei concordano", () => {
    const istante = new Date("2026-09-07T14:00:00.000Z");
    expect(todayInVenue("Europe/Rome", istante)).toBe("2026-09-07");
    expect(todayInVenue("Europe/London", istante)).toBe("2026-09-07");
    expect(istante.toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  it("un fuso scritto male non fa cadere la pagina: ripiega su Europe/Rome", () => {
    const istante = new Date("2026-09-07T22:30:00.000Z");
    expect(todayInVenue("Non/Esiste", istante)).toBe(todayInVenue(DEFAULT_VENUE_TIMEZONE, istante));
  });

  it("senza fuso indicato usa quello di riferimento", () => {
    const istante = new Date("2026-09-07T22:30:00.000Z");
    expect(todayInVenue(undefined, istante)).toBe("2026-09-08");
  });

  it("restituisce sempre il formato AAAA-MM-GG", () => {
    expect(todayInVenue("Europe/Rome", new Date("2026-01-05T12:00:00.000Z"))).toBe("2026-01-05");
  });
});

describe("a quale giornata di servizio appartiene un istante", () => {
  it("una prenotazione a mezzanotte e mezza appartiene al giorno nuovo del locale", () => {
    expect(dateKeyInVenue(new Date("2026-09-07T22:30:00.000Z"), "Europe/Rome")).toBe("2026-09-08");
  });

  it("una cena alle 21 appartiene alla sua giornata", () => {
    expect(dateKeyInVenue(new Date("2026-09-07T19:00:00.000Z"), "Europe/Rome")).toBe("2026-09-07");
  });
});

describe("spostarsi di un giorno", () => {
  it("avanti e indietro", () => {
    expect(shiftDateKey("2026-09-07", 1)).toBe("2026-09-08");
    expect(shiftDateKey("2026-09-07", -1)).toBe("2026-09-06");
  });

  it("attraversa il cambio di mese e di anno", () => {
    expect(shiftDateKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("regge l'anno bisestile", () => {
    expect(shiftDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDateKey("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("la notte in cui l'ora cambia non salta un giorno", () => {
    // Ultima domenica di ottobre 2026: in Italia le lancette tornano indietro.
    // Lavorando su date pure il risultato non dipende dai fusi.
    expect(shiftDateKey("2026-10-24", 1)).toBe("2026-10-25");
    expect(shiftDateKey("2026-10-25", 1)).toBe("2026-10-26");
  });
});
