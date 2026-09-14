import { describe, expect, it } from "vitest";
import {
  PERMESSI,
  PERMESSI_PREDEFINITI,
  calcolaEta,
  coincideConPreset,
  descriviScadenza,
  giorniLavorativiLeggibili,
  ordinaScadenze,
  permessiEffettivi,
  scadenzaDaSegnalare,
  statoScadenza,
  testoAvvisoScadenza,
  type Scadenza,
} from "@/lib/scheda-dipendente";
import { costruisciScadenze } from "@/lib/scadenze-dipendente";
import { raggruppaAssenze } from "@/server/staff-presenze";

/**
 * La scheda del dipendente: la logica che decide **cosa è urgente**.
 *
 * Sono i numeri che finiscono sulla card nell'elenco Staff e in cima alla
 * Panoramica. Se sbagliano, un HACCP scaduto resta verde o una visita medica
 * valida diventa rossa — e un responsabile che si fida della card prende una
 * multa, o smette di fidarsi della card.
 */

const OGGI = new Date("2026-09-14T12:00:00.000Z");
const fra = (giorni: number) => new Date(OGGI.getTime() + giorni * 86_400_000);

describe("lo stato di una scadenza", () => {
  it("è valido lontano, vicino entro la soglia, scaduto dopo", () => {
    expect(statoScadenza(fra(200), OGGI)).toBe("valido");
    expect(statoScadenza(fra(60), OGGI)).toBe("in_scadenza");
    expect(statoScadenza(fra(0), OGGI)).toBe("in_scadenza");
    expect(statoScadenza(fra(-1), OGGI)).toBe("scaduto");
  });

  it("senza data è valido: «senza scadenza» non è «scaduto»", () => {
    expect(statoScadenza(null, OGGI)).toBe("valido");
  });

  it("si descrive in italiano, al giorno", () => {
    expect(descriviScadenza(fra(65), OGGI)).toBe("Tra 65 giorni");
    expect(descriviScadenza(fra(1), OGGI)).toBe("Scade domani");
    expect(descriviScadenza(fra(0), OGGI)).toBe("Scade oggi");
    expect(descriviScadenza(fra(-1), OGGI)).toBe("Scaduto ieri");
    expect(descriviScadenza(fra(-12), OGGI)).toBe("Scaduto da 12 giorni");
  });
});

describe("le scadenze di una persona", () => {
  const dati = {
    contratti: [{ startDate: new Date("2024-03-12"), endDate: null, contractType: "TEMPO_INDETERMINATO" as const }],
    visite: [{ examinedAt: fra(-300), expiresAt: fra(65) }],
    corsi: [
      { kind: "SICUREZZA_LAVORO" as const, name: null, completedAt: fra(-365), expiresAt: fra(4 * 365) },
      { kind: "HACCP" as const, name: null, completedAt: fra(-700), expiresAt: fra(-10) },
    ],
    documenti: [{ id: "d1", name: "Permesso di soggiorno", expiresAt: fra(20) }],
  };

  it("mette prima le scadute, poi le vicine, poi il resto", () => {
    const s = costruisciScadenze(dati, OGGI);
    expect(s.map((x) => [x.titolo, x.stato])).toEqual([
      ["HACCP", "scaduto"],
      ["Permesso di soggiorno", "in_scadenza"],
      ["Visita medica", "valido"],
      ["Corso sicurezza", "valido"],
      ["Contratto", "valido"],
    ]);
  });

  it("un corso obbligatorio che manca compare come mancante, uno facoltativo no", () => {
    const s = costruisciScadenze({ ...dati, corsi: [] }, OGGI);
    const titoli = s.map((x) => x.titolo);
    expect(titoli).toContain("HACCP");
    expect(titoli).toContain("Corso sicurezza");
    expect(titoli).not.toContain("Antincendio");
    expect(s.find((x) => x.titolo === "HACCP")?.stato).toBe("assente");
  });

  it("senza visita medica lo dice: è la mancanza più cara", () => {
    const s = costruisciScadenze({ ...dati, visite: [] }, OGGI);
    expect(s.find((x) => x.chiave === "visita")).toMatchObject({ stato: "assente", dettaglio: "Nessuna visita registrata" });
  });

  it("di un corso ripetuto conta l'edizione più recente", () => {
    const s = costruisciScadenze(
      {
        ...dati,
        corsi: [
          { kind: "HACCP", name: null, completedAt: fra(-700), expiresAt: fra(-10) },
          { kind: "HACCP", name: null, completedAt: fra(-5), expiresAt: fra(700) },
        ],
      },
      OGGI,
    );
    expect(s.find((x) => x.titolo === "HACCP")?.stato).toBe("valido");
  });

  it("un attestato collegato a un corso non si conta due volte", () => {
    const s = costruisciScadenze({ ...dati, documenti: [{ id: "a", name: "Attestato HACCP", expiresAt: fra(-10), trainingId: "t1" }] }, OGGI);
    expect(s.filter((x) => x.stato === "scaduto")).toHaveLength(1);
  });

  it("il contratto segue la soglia dei contratti (30 giorni), non quella dei corsi", () => {
    const s = costruisciScadenze({ ...dati, contratti: [{ startDate: fra(-100), endDate: fra(45), contractType: "TEMPO_DETERMINATO" }] }, OGGI);
    expect(s.find((x) => x.chiave === "contratto")?.stato).toBe("valido");
    const s2 = costruisciScadenze({ ...dati, contratti: [{ startDate: fra(-100), endDate: fra(20), contractType: "TEMPO_DETERMINATO" }] }, OGGI);
    expect(s2.find((x) => x.chiave === "contratto")?.stato).toBe("in_scadenza");
  });
});

describe("l'avviso sulla card dell'elenco", () => {
  const base: Scadenza = { chiave: "x", titolo: "Visita medica", tab: "formazione", scadeIl: fra(15), stato: "in_scadenza", dettaglio: "", giorni: 15 };

  it("sceglie la più urgente e la scrive corta", () => {
    const urgente = scadenzaDaSegnalare([
      { ...base, chiave: "a", stato: "valido", giorni: 200 },
      base,
      { ...base, chiave: "b", titolo: "HACCP", stato: "scaduto", giorni: -3 },
    ]);
    expect(urgente?.titolo).toBe("HACCP");
    expect(testoAvvisoScadenza(urgente!)).toBe("HACCP scaduto");
    expect(testoAvvisoScadenza(base)).toBe("Visita medica tra 15 giorni");
  });

  it("non dice niente se è tutto regolare: la card resta pulita", () => {
    expect(scadenzaDaSegnalare([{ ...base, stato: "valido", giorni: 200 }])).toBeNull();
    expect(scadenzaDaSegnalare([{ ...base, stato: "assente", scadeIl: null, giorni: null }])).toBeNull();
  });

  it("ordina le mancanti dopo le valide", () => {
    const ordinate = ordinaScadenze([{ ...base, chiave: "m", stato: "assente", giorni: null }, { ...base, chiave: "v", stato: "valido", giorni: 300 }]);
    expect(ordinate.map((s) => s.chiave)).toEqual(["v", "m"]);
  });
});

describe("i permessi nel gestionale", () => {
  it("ogni ruolo ha un preset, e il manager ha tutto", () => {
    for (const preset of Object.values(PERMESSI_PREDEFINITI)) expect(preset.length).toBeGreaterThan(0);
    expect(PERMESSI_PREDEFINITI.MANAGER).toHaveLength(PERMESSI.length);
  });

  it("un cameriere vede la sala ma non i report", () => {
    expect(PERMESSI_PREDEFINITI.WAITER).toContain("VIEW_FLOOR");
    expect(PERMESSI_PREDEFINITI.WAITER).not.toContain("VIEW_REPORTS");
  });

  it("finché coincidono col preset valgono quelli del ruolo, altrimenti quelli salvati", () => {
    expect(permessiEffettivi({ role: "WAITER", permissions: [], customPermissions: false })).toEqual(PERMESSI_PREDEFINITI.WAITER);
    expect(permessiEffettivi({ role: "WAITER", permissions: ["VIEW_REPORTS"], customPermissions: true })).toEqual(["VIEW_REPORTS"]);
  });

  it("riconosce un elenco uguale al preset anche in ordine diverso", () => {
    expect(coincideConPreset("WAITER", [...PERMESSI_PREDEFINITI.WAITER].reverse())).toBe(true);
    expect(coincideConPreset("WAITER", [...PERMESSI_PREDEFINITI.WAITER, "VIEW_REPORTS"])).toBe(false);
  });
});

describe("piccole cose che si leggono", () => {
  it("l'età si calcola dalla data di nascita, compleanno incluso", () => {
    expect(calcolaEta("1988-03-15", new Date("2026-09-14"))).toBe(38);
    expect(calcolaEta("1988-09-15", new Date("2026-09-14"))).toBe(37);
    expect(calcolaEta(null)).toBeNull();
    expect(calcolaEta("non una data")).toBeNull();
  });

  it("i giorni lavorativi si leggono da lunedì, domenica in fondo", () => {
    expect(giorniLavorativiLeggibili([0, 2, 5])).toBe("Mar, Ven, Dom");
    expect(giorniLavorativiLeggibili([])).toBe("");
  });

  it("le assenze consecutive dello stesso tipo diventano un intervallo", () => {
    const gruppi = raggruppaAssenze([
      { dateKey: "2026-08-12", kind: "VACATION" },
      { dateKey: "2026-08-13", kind: "VACATION" },
      { dateKey: "2026-08-14", kind: "VACATION" },
      { dateKey: "2026-08-15", kind: "VACATION" },
      { dateKey: "2026-09-04", kind: "LEAVE" },
      { dateKey: "2026-09-05", kind: "SICK_LEAVE" },
    ]);
    expect(gruppi).toEqual([
      { kind: "SICK_LEAVE", dal: "2026-09-05", al: "2026-09-05", giorni: 1 },
      { kind: "LEAVE", dal: "2026-09-04", al: "2026-09-04", giorni: 1 },
      { kind: "VACATION", dal: "2026-08-12", al: "2026-08-15", giorni: 4 },
    ]);
  });
});
