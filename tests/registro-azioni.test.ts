import { describe, expect, it } from "vitest";
import { fieldDiff } from "@/server/audit";

/**
 * La differenza registrata deve restare leggibile: il primo tentativo salvava
 * l'intera scheda dell'ospite a ogni cambio di nota, perché le funzioni di
 * aggiornamento restituiscono la prenotazione con `include: { guest, table }`
 * mentre il record di partenza è senza.
 */

describe("differenza fra prima e dopo", () => {
  it("riporta solo i campi cambiati", () => {
    const diff = fieldDiff(
      { partySize: 2, notes: "vicino alla finestra", status: "CONFIRMED" },
      { partySize: 4, notes: "vicino alla finestra", status: "CONFIRMED" },
    );
    expect(diff).toEqual({ partySize: { da: 2, a: 4 } });
  });

  it("restituisce null quando non è cambiato niente", () => {
    expect(fieldDiff({ a: 1 }, { a: 1 })).toBeNull();
  });

  it("due date con lo stesso istante non sono una modifica", () => {
    const prima = { startsAt: new Date("2026-09-07T19:00:00.000Z") };
    const dopo = { startsAt: new Date("2026-09-07T19:00:00.000Z") };
    expect(fieldDiff(prima, dopo)).toBeNull();
  });

  it("uno spostamento d'orario è registrato in forma leggibile", () => {
    const diff = fieldDiff(
      { startsAt: new Date("2026-09-07T19:00:00.000Z") },
      { startsAt: new Date("2026-09-07T19:30:00.000Z") },
    );
    expect(diff).toEqual({
      startsAt: { da: "2026-09-07T19:00:00.000Z", a: "2026-09-07T19:30:00.000Z" },
    });
  });

  it("le relazioni caricate con include restano fuori", () => {
    const prima = { status: "CONFIRMED" };
    const dopo = {
      status: "ARRIVED",
      guest: { id: "g1", firstName: "Anna", tags: ["vip"] },
      table: null,
    };
    expect(fieldDiff(prima, dopo)).toEqual({ status: { da: "CONFIRMED", a: "ARRIVED" } });
  });

  it("un campo passato a null è una modifica vera", () => {
    expect(fieldDiff({ tableId: "t1" }, { tableId: null })).toEqual({
      tableId: { da: "t1", a: null },
    });
  });

  it("un campo assente nel nuovo record non viene inventato", () => {
    // Prisma con `data: { x: undefined }` non tocca la colonna: non è una modifica.
    expect(fieldDiff({ notes: "vecchia" }, { notes: undefined })).toBeNull();
  });

  it("senza uno dei due record non c'è differenza da calcolare", () => {
    expect(fieldDiff(null, { a: 1 })).toBeNull();
    expect(fieldDiff({ a: 1 }, null)).toBeNull();
  });

  it("i valori booleani e numerici sono confrontati per valore", () => {
    expect(fieldDiff({ active: true, seats: 4 }, { active: false, seats: 4 })).toEqual({
      active: { da: true, a: false },
    });
  });
});
