import { describe, expect, it } from "vitest";
import {
  DEFAULT_VENUE_TIMEZONE,
  dateKeyInVenue,
  giornataInVenue,
  mezzanotteInVenue,
  shiftDateKey,
  todayInVenue,
} from "@/lib/venue-time";

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

describe("l'inizio e la fine della giornata del locale", () => {
  /**
   * L'aritmetica su cui poggiano la Panoramica e l'agente.
   *
   * Prima ognuno se la faceva con `startOfDay` di `lib/utils`, che risponde
   * nel fuso del processo: all'una di notte a Roma davano la giornata di ieri,
   * e la Panoramica mostrava coperti e incasso della serata sbagliata proprio
   * nell'ora in cui si chiudono i conti.
   */
  it("delimita il giorno civile del locale, non quello del server", () => {
    // 00:30 del 21 settembre a Roma: per il server è ancora il 20.
    const istante = new Date("2026-09-20T22:30:00.000Z");
    const { inizio, fine } = giornataInVenue(istante, "Europe/Rome");

    expect(inizio.toISOString()).toBe("2026-09-20T22:00:00.000Z"); // 00:00 del 21 a Roma
    expect(fine.toISOString()).toBe("2026-09-21T21:59:59.999Z"); // 23:59:59.999 del 21
    expect(istante >= inizio && istante <= fine).toBe(true);
  });

  it("la fine è l'ultimo millisecondo, non la mezzanotte dopo", () => {
    /* Si usa con `lte`: con la mezzanotte dopo, una prenotazione delle 00:00
       di domani cadrebbe dentro due giornate. */
    const { fine } = giornataInVenue(new Date("2026-09-21T12:00:00.000Z"), "Europe/Rome");
    const mezzanotteDopo = mezzanotteInVenue("2026-09-22", "Europe/Rome");
    expect(mezzanotteDopo.getTime() - fine.getTime()).toBe(1);
  });

  it("funziona anche dodici fusi più avanti", () => {
    /* Auckland: il caso che smaschera un test che passa solo perché la
       macchina ha il fuso giusto. */
    const { inizio } = giornataInVenue(new Date("2026-09-20T13:00:00.000Z"), "Pacific/Auckland");
    expect(dateKeyInVenue(inizio, "Pacific/Auckland")).toBe("2026-09-21");
  });

  it("la notte del cambio d'ora la giornata dura venticinque ore", () => {
    /* Il 25 ottobre 2026 Roma torna a UTC+1: quel giorno ha venticinque ore, e
       una formula a giorni fissi lo sbaglia. Sono i due passaggi di
       `mezzanotteInVenue`. */
    const { inizio, fine } = giornataInVenue(new Date("2026-10-25T10:00:00.000Z"), "Europe/Rome");
    const ore = (fine.getTime() + 1 - inizio.getTime()) / 3_600_000;
    expect(ore).toBe(25);
    expect(inizio.toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("dove l'ora cambia a mezzanotte, il giorno comincia quando comincia", () => {
    /**
     * Il caso che ha smentito la mia prima versione.
     *
     * In Cile l'orologio cambia **a mezzanotte**: la mezzanotte del 6 settembre
     * 2026 non esiste, il giorno comincia all'01:00. La formula che correggeva
     * il fuso due volte finiva alle 23:00 del **5 settembre** — un giorno di
     * prenotazioni attribuito alla data sbagliata, due volte l'anno.
     */
    const inizio = mezzanotteInVenue("2026-09-06", "America/Santiago");
    expect(dateKeyInVenue(inizio, "America/Santiago")).toBe("2026-09-06");
    expect(inizio.toISOString()).toBe("2026-09-06T04:00:00.000Z"); // 01:00 locali

    /* E la giornata intera resta dentro il suo giorno, dai due lati. */
    const { inizio: i2, fine } = giornataInVenue(inizio, "America/Santiago");
    expect(i2.getTime()).toBe(inizio.getTime());
    expect(dateKeyInVenue(fine, "America/Santiago")).toBe("2026-09-06");
  });

  it("mezzanotte non scivola al giorno dopo", () => {
    /* `en-CA` scrive mezzanotte come «24»: letta come numero sposta di un
       giorno. È il difetto che farebbe cadere le prenotazioni di mezzanotte. */
    expect(mezzanotteInVenue("2026-09-21", "Europe/Rome").toISOString()).toBe(
      "2026-09-20T22:00:00.000Z",
    );
    expect(mezzanotteInVenue("2026-01-15", "Europe/Rome").toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });
});
