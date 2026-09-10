import { describe, expect, it } from "vitest";
import { richiedeVerificaDisponibilita } from "@/server/bookings";
import { OCCUPYING_STATUSES } from "@/server/availability";
import type { BookingStatus } from "@prisma/client";

/**
 * Quando una modifica a una prenotazione deve far rivalidare la disponibilità.
 *
 * Il difetto che questo file protegge: contava **qualsiasi** cambio di stato,
 * e così una prenotazione in uno stato che viola già una regola — tre persone
 * su un tavolo da due, che in sala si risolve aggiungendo una sedia — non si
 * poteva più muovere. Segnarla «Arrivato» rispondeva «Il tavolo T8 ha 2 posti,
 * non bastano per 3 persone», e l'unica azione che passava era cancellarla.
 *
 * Ci si finisce dentro senza fare niente di strano: basta ridurre i posti di
 * un tavolo nella piantina.
 */
const TENGONO_IL_TAVOLO = OCCUPYING_STATUSES as readonly BookingStatus[];
const NON_TENGONO = (["CANCELLED", "NO_SHOW", "COMPLETED"] as BookingStatus[]).filter(
  (s) => !TENGONO_IL_TAVOLO.includes(s),
);

describe("richiedeVerificaDisponibilita", () => {
  it("cambiare orario, durata, coperti o tavolo va sempre verificato", () => {
    for (const m of [
      { startsAt: new Date() },
      { durationMin: 120 },
      { partySize: 6 },
      { tableId: "t1" },
      { tableId: null }, // togliere il tavolo è una modifica, non un'assenza
    ]) {
      expect(richiedeVerificaDisponibilita(m, "CONFIRMED")).toBe(true);
    }
  });

  it("una modifica che non tocca la disponibilità non si verifica", () => {
    expect(richiedeVerificaDisponibilita({}, "CONFIRMED")).toBe(false);
    expect(richiedeVerificaDisponibilita({ notes: "allergico" } as never, "CONFIRMED")).toBe(false);
  });

  it("andare avanti su una prenotazione che tiene già il tavolo non si verifica", () => {
    for (const attuale of TENGONO_IL_TAVOLO) {
      for (const nuovo of ["ARRIVED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"] as BookingStatus[]) {
        expect(richiedeVerificaDisponibilita({ status: nuovo }, attuale)).toBe(false);
      }
    }
  });

  it("riportare in vita una prenotazione che il tavolo non lo teneva SI verifica", () => {
    for (const attuale of NON_TENGONO) {
      expect(richiedeVerificaDisponibilita({ status: "CONFIRMED" }, attuale)).toBe(true);
    }
  });

  it("il caso che ha fatto nascere la regola: la segno arrivata e passa", () => {
    // confermata, tiene il tavolo, e il tavolo è troppo piccolo da prima:
    // il cambio di stato non deve rivalidare niente
    expect(richiedeVerificaDisponibilita({ status: "ARRIVED" }, "CONFIRMED")).toBe(false);
  });

  it("ma se insieme allo stato cambia anche il tavolo, si verifica", () => {
    expect(richiedeVerificaDisponibilita({ status: "SEATED", tableId: "t9" }, "SEATED")).toBe(true);
  });
});
