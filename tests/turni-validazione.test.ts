import { describe, expect, it } from "vitest";
import { WorkShiftInput } from "@/server/work-shifts";

/**
 * Le regole di un turno vivono **sul server**.
 *
 * Il dialogo che le controlla è comodo, ma è codice che gira nel browser di
 * chi lo usa: la stessa rotta la può chiamare chiunque abbia una sessione e
 * sappia scrivere una fetch. Questi test verificano lo schema che sta davanti
 * al database, non il modulo — se un giorno qualcuno rifà l'interfaccia, le
 * regole restano.
 */

const BASE = { waiterId: "w1", date: "2026-09-11" };

function esito(input: unknown) {
  const r = WorkShiftInput.safeParse(input);
  return r.success ? "ok" : r.error.issues.map((i) => i.message);
}

describe("validazione di un turno", () => {
  it("accetta un turno di cena che passa la mezzanotte", () => {
    expect(esito({ ...BASE, kind: "WORK", startMinute: 1080, endMinute: 1440 })).toBe("ok");
  });

  it("rifiuta un turno di lavoro senza orario", () => {
    expect(esito({ ...BASE, kind: "WORK" })).toContain("orario_richiesto");
  });

  it("rifiuta una fine che precede l'inizio", () => {
    // 18:00 → 00:00 va scritto 1080 → 1440, non 1080 → 0: se arriva 0 vuol
    // dire che qualcuno ha saltato la conversione, e va fermato qui.
    expect(esito({ ...BASE, kind: "WORK", startMinute: 1080, endMinute: 0 })).toContain("fine_prima_dell_inizio");
  });

  it("rifiuta un turno lungo zero", () => {
    expect(esito({ ...BASE, kind: "WORK", startMinute: 600, endMinute: 600 })).toContain("fine_prima_dell_inizio");
  });

  it("rifiuta una pausa più lunga del turno", () => {
    expect(esito({ ...BASE, kind: "WORK", startMinute: 1080, endMinute: 1140, breakMinutes: 90 })).toContain(
      "pausa_troppo_lunga",
    );
  });

  it("accetta un riposo senza orari", () => {
    expect(esito({ ...BASE, kind: "REST" })).toBe("ok");
    expect(esito({ ...BASE, kind: "VACATION" })).toBe("ok");
    expect(esito({ ...BASE, kind: "SICK_LEAVE" })).toBe("ok");
  });

  it("su un riposo non pretende gli orari, anche se il form li aveva compilati", () => {
    expect(esito({ ...BASE, kind: "REST", startMinute: 1080, endMinute: 1440 })).toBe("ok");
  });

  it("rifiuta una data che non è una data", () => {
    expect(esito({ ...BASE, date: "11/09/2026", kind: "REST" })).toContain("invalid_date");
    expect(esito({ ...BASE, date: "", kind: "REST" })).toContain("invalid_date");
  });

  it("rifiuta un turno senza persona", () => {
    expect(esito({ date: "2026-09-11", kind: "REST" })).not.toBe("ok");
  });

  it("il tipo predefinito è il lavoro", () => {
    const r = WorkShiftInput.safeParse({ ...BASE, startMinute: 720, endMinute: 900 });
    expect(r.success && r.data.kind).toBe("WORK");
  });

  it("non accetta orari fuori dalle quarantotto ore", () => {
    expect(esito({ ...BASE, kind: "WORK", startMinute: 1080, endMinute: 5000 })).not.toBe("ok");
    expect(esito({ ...BASE, kind: "WORK", startMinute: -10, endMinute: 600 })).not.toBe("ok");
  });

  it("tronca le note troppo lunghe rifiutandole, invece di scriverle a metà", () => {
    expect(esito({ ...BASE, kind: "REST", notes: "x".repeat(501) })).not.toBe("ok");
  });
});
