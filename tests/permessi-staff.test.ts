import { describe, expect, it } from "vitest";
import {
  permessiStaff,
  profiloStaff,
  puo,
  staffAppEHome,
  PERMESSI_PER_RUOLO,
  TUTTI_I_PERMESSI,
  type PermessoStaff,
} from "@/lib/permessi-staff";
import { STAFF_PRIMARY_ROLES } from "@/lib/staff-roles";
import { vociDentroProfilo, vociPer } from "@/components/staff-app/voci-nav";

/**
 * I permessi della Staff App.
 *
 * Quello che queste prove difendono non è la matrice — quella cambierà — ma
 * le **regole di composizione**, che se saltano aprono un buco silenzioso:
 *
 * - il mestiere può solo perdere permessi passando dal ruolo d'accesso, mai
 *   guadagnarne. Il contrario significherebbe che basta scrivere «maître»
 *   nella scheda di qualcuno per dargli poteri che nessuno ha concesso;
 * - uno chef non vede la sala, e non per come è disegnata l'interfaccia;
 * - la barra in basso non supera le cinque voci a nessuna combinazione.
 */

const cameriere = { primaryRole: "CAMERIERE" as const, accesso: "WAITER" as const };

describe("il mestiere decide cosa si fa in servizio", () => {
  it("un cameriere batte, modifica e invia comande", () => {
    const p = permessiStaff(cameriere);
    expect(puo(p, "create_orders")).toBe(true);
    expect(puo(p, "edit_orders")).toBe(true);
    expect(puo(p, "send_orders")).toBe(true);
    expect(puo(p, "view_tables")).toBe(true);
  });

  it("un cameriere NON vede i tavoli dei colleghi, un maître sì", () => {
    expect(puo(permessiStaff(cameriere), "view_all_tables")).toBe(false);
    expect(puo(permessiStaff({ primaryRole: "MAITRE", accesso: "WAITER" }), "view_all_tables")).toBe(
      true,
    );
  });

  it("un runner porta i piatti ma non apre comande", () => {
    const p = permessiStaff({ primaryRole: "RUNNER", accesso: "WAITER" });
    expect(puo(p, "view_tables")).toBe(true);
    expect(puo(p, "create_orders")).toBe(false);
    expect(puo(p, "send_orders")).toBe(false);
  });

  it("solo chi risponde della sala chiude il conto", () => {
    expect(puo(permessiStaff(cameriere), "manage_payments")).toBe(false);
    expect(puo(permessiStaff(cameriere), "view_payments")).toBe(true);
    expect(
      puo(permessiStaff({ primaryRole: "RESTAURANT_MANAGER", accesso: "WAITER" }), "manage_payments"),
    ).toBe(true);
  });
});

describe("la cucina non entra in sala (§32)", () => {
  const cucina = ["EXECUTIVE_CHEF", "SOUS_CHEF", "CHEF_DE_PARTIE", "COMMIS_CUCINA", "LAVAPIATTI"] as const;
  const vietati: PermessoStaff[] = [
    "view_tables",
    "view_all_tables",
    "manage_tables",
    "create_orders",
    "send_orders",
    "view_payments",
    "manage_payments",
  ];

  for (const ruolo of cucina) {
    it(`${ruolo} non vede tavoli, comande né conti`, () => {
      const p = permessiStaff({ primaryRole: ruolo, accesso: "WAITER" });
      for (const v of vietati) expect(puo(p, v)).toBe(false);
      // Quello che ha è suo: turni, documenti, scheda.
      expect(puo(p, "view_own_shifts")).toBe(true);
      expect(puo(p, "view_own_documents")).toBe(true);
    });
  }

  it("il profilo di uno chef è CUCINA, quello di un bartender è SALA", () => {
    expect(profiloStaff({ primaryRole: "SOUS_CHEF" })).toBe("CUCINA");
    expect(profiloStaff({ primaryRole: "BARTENDER" })).toBe("SALA");
  });
});

describe("il ruolo d'accesso può solo togliere", () => {
  it("READ_ONLY toglie ogni scrittura anche a un maître", () => {
    const p = permessiStaff({ primaryRole: "MAITRE", accesso: "READ_ONLY" });
    expect(puo(p, "view_tables")).toBe(true);
    expect(puo(p, "create_orders")).toBe(false);
    expect(puo(p, "send_orders")).toBe(false);
    expect(puo(p, "manage_tables")).toBe(false);
    expect(puo(p, "manage_payments")).toBe(false);
  });

  it("MARKETING resta alla propria scheda anche se in anagrafica è cameriere", () => {
    const p = permessiStaff({ primaryRole: "CAMERIERE", accesso: "MARKETING" });
    expect(puo(p, "view_tables")).toBe(false);
    expect(puo(p, "view_own_shifts")).toBe(true);
  });

  it("MANAGER ha tutto, qualunque sia il mestiere", () => {
    const p = permessiStaff({ primaryRole: "LAVAPIATTI", accesso: "MANAGER" });
    expect(p.sort()).toEqual([...TUTTI_I_PERMESSI].sort());
  });

  it("nessun ruolo d'accesso aggiunge permessi al mestiere (tranne MANAGER)", () => {
    for (const { value: mestiere } of STAFF_PRIMARY_ROLES) {
      const base = new Set(PERMESSI_PER_RUOLO[mestiere]);
      for (const accesso of ["WAITER", "RECEPTION", "MARKETING", "READ_ONLY"] as const) {
        for (const p of permessiStaff({ primaryRole: mestiere, accesso })) {
          expect(base.has(p), `${accesso} ha dato «${p}» a ${mestiere}`).toBe(true);
        }
      }
    }
  });
});

describe("un'anagrafica senza mestiere non eredita niente", () => {
  it("resta alla propria scheda: si concede su un dato che c'è, non su uno che manca", () => {
    const p = permessiStaff({ primaryRole: null, accesso: "WAITER" });
    expect(puo(p, "view_own_shifts")).toBe(true);
    expect(puo(p, "view_tables")).toBe(false);
    expect(puo(p, "create_orders")).toBe(false);
  });
});

describe("dove atterra chi entra (§48)", () => {
  it("cameriere e sola lettura aprono la Staff App", () => {
    expect(staffAppEHome("WAITER")).toBe(true);
    expect(staffAppEHome("READ_ONLY")).toBe(true);
  });

  it("reception, marketing e manager restano nel back office", () => {
    expect(staffAppEHome("RECEPTION")).toBe(false);
    expect(staffAppEHome("MARKETING")).toBe(false);
    expect(staffAppEHome("MANAGER")).toBe(false);
  });
});

describe("la barra in basso (§2)", () => {
  it("non supera mai cinque voci", () => {
    for (const { value } of STAFF_PRIMARY_ROLES) {
      for (const accesso of ["MANAGER", "WAITER", "READ_ONLY"] as const) {
        const permessi = permessiStaff({ primaryRole: value, accesso });
        const profilo = profiloStaff({ primaryRole: value });
        expect(vociPer(profilo, permessi).length).toBeLessThanOrEqual(5);
      }
    }
  });

  it("il cameriere ha Home, Sala, Comande, Profilo — i turni no", () => {
    const voci = vociPer("SALA", permessiStaff(cameriere)).map((v) => v.label);
    expect(voci).toEqual(["Home", "Sala", "Comande", "Profilo"]);
  });

  it("quello che esce dalla barra ricompare dentro Profilo", () => {
    // La regola che conta non è quali voci, è che **nessuna sparisca**: le due
    // liste si calcolano una dalla differenza dell'altra.
    const permessi = permessiStaff(cameriere);
    const dentro = vociDentroProfilo("SALA", permessi).map((v) => v.label);
    expect(dentro).toEqual(["Turni", "Documenti"]);
  });

  it("nessuna voce resta fuori da tutte e due, per nessun mestiere", () => {
    for (const { value } of STAFF_PRIMARY_ROLES) {
      for (const accesso of ["MANAGER", "WAITER", "READ_ONLY"] as const) {
        const permessi = permessiStaff({ primaryRole: value, accesso });
        const profilo = profiloStaff({ primaryRole: value });
        const raggiungibili = new Set([
          ...vociPer(profilo, permessi).map((v) => v.href),
          ...vociDentroProfilo(profilo, permessi).map((v) => v.href),
        ]);
        for (const href of ["/staff-app/turni", "/staff-app/documenti"]) {
          expect(raggiungibili.has(href), `${value}/${accesso} non arriva a ${href}`).toBe(true);
        }
      }
    }
  });

  it("lo chef non ha Sala né Comande, e i turni restano in barra", () => {
    // In cucina i turni non sono un accessorio del servizio: sono quasi tutto
    // il prodotto, quindi la barra li tiene.
    const permessi = permessiStaff({ primaryRole: "SOUS_CHEF", accesso: "WAITER" });
    const voci = vociPer("CUCINA", permessi).map((v) => v.label);
    expect(voci).toEqual(["Home", "Turni", "Documenti", "Profilo"]);
    expect(voci).not.toContain("Sala");
    expect(vociDentroProfilo("CUCINA", permessi)).toHaveLength(0);
  });
});
