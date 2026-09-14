import { describe, expect, it } from "vitest";
import type { StaffDepartment, StaffPrimaryRole } from "@prisma/client";
import { ROLE_DEPARTMENT, STAFF_PRIMARY_ROLES, DEFAULT_CAPABILITIES_BY_ROLE, staffDepartmentOf } from "@/lib/staff-roles";
import { ROLE_OPTIONS_BY_DEPARTMENT, groupStaffByDepartment, rolesByDepartment } from "@/lib/staff-departments";
import { isAssignable, STAFF_STATUSES } from "@/lib/staff-status";
import { matchesStaffQuery } from "@/lib/staff-search";

/**
 * L'architettura dello Staff regge su una promessa: **aggiungere un ruolo
 * costa una riga nell'enum e una riga nella mappa dei reparti**. Questi test
 * sono lì per farla rispettare — il giorno in cui qualcuno aggiunge
 * `BAR_MANAGER` senza dirgli in che reparto va, la persona sparisce in
 * «Altro» e in schermata non se ne accorge nessuno.
 */

type PersonaDiProva = {
  firstName: string;
  lastName: string;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
};

function persona(over: Partial<PersonaDiProva> = {}): PersonaDiProva {
  return {
    firstName: "Mario",
    lastName: "Rossi",
    role: "Cameriere",
    primaryRole: "CAMERIERE",
    department: null,
    ...over,
  };
}

describe("reparti dello staff", () => {
  it("ogni ruolo conosciuto ha un reparto", () => {
    for (const r of STAFF_PRIMARY_ROLES) {
      expect(ROLE_DEPARTMENT[r.value], `${r.value} non ha un reparto`).toBeDefined();
    }
  });

  it("nessun ruolo finisce in ALTRO: è il posto delle anagrafiche senza ruolo, non dei ruoli senza posto", () => {
    const orfani = STAFF_PRIMARY_ROLES.filter((r) => ROLE_DEPARTMENT[r.value] === "ALTRO");
    expect(orfani.map((r) => r.value)).toEqual([]);
  });

  it("i cinque ruoli di cucina esistono e stanno in cucina", () => {
    const cucina = rolesByDepartment("CUCINA");
    expect(cucina).toEqual(["EXECUTIVE_CHEF", "SOUS_CHEF", "CHEF_DE_PARTIE", "COMMIS_CUCINA", "LAVAPIATTI"]);
  });

  it("una persona senza ruolo strutturato finisce in ALTRO", () => {
    expect(staffDepartmentOf(persona({ primaryRole: null }))).toBe("ALTRO");
  });

  it("l'override del reparto vince sul ruolo", () => {
    expect(staffDepartmentOf(persona({ primaryRole: "CAMERIERE", department: "BAR" }))).toBe("BAR");
  });

  it("il selettore dei ruoli copre tutti i ruoli, senza duplicati", () => {
    const nelSelettore = ROLE_OPTIONS_BY_DEPARTMENT.flatMap((g) => g.roles.map((r) => r.value));
    expect(new Set(nelSelettore).size).toBe(nelSelettore.length);
    expect(new Set(nelSelettore)).toEqual(new Set(STAFF_PRIMARY_ROLES.map((r) => r.value)));
  });

  it("i ruoli di cucina non hanno competenze di sala: un sous-chef non copre tavoli", () => {
    for (const r of rolesByDepartment("CUCINA")) {
      expect(DEFAULT_CAPABILITIES_BY_ROLE[r], `${r} non dovrebbe avere capability`).toEqual([]);
    }
  });
});

describe("raggruppamento dell'elenco", () => {
  const squadra = [
    persona({ primaryRole: "LAVAPIATTI", lastName: "Verdi" }),
    persona({ primaryRole: "EXECUTIVE_CHEF", lastName: "Bianchi" }),
    persona({ primaryRole: "CAMERIERE", lastName: "Neri" }),
    persona({ primaryRole: "MAITRE", lastName: "Gialli" }),
  ];

  it("ordina i reparti e, dentro, per gerarchia di ruolo", () => {
    const gruppi = groupStaffByDepartment(squadra);
    expect(gruppi.map((g) => g.key)).toEqual(["SALA", "CUCINA"]);
    expect(gruppi[0].members.map((m) => m.primaryRole)).toEqual(["MAITRE", "CAMERIERE"]);
    expect(gruppi[1].members.map((m) => m.primaryRole)).toEqual(["EXECUTIVE_CHEF", "LAVAPIATTI"]);
  });

  it("non rende un reparto vuoto", () => {
    const gruppi = groupStaffByDepartment([persona({ primaryRole: "CAMERIERE" })]);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].key).toBe("SALA");
  });

  it("a parità di ruolo ordina per cognome", () => {
    const gruppi = groupStaffByDepartment([
      persona({ primaryRole: "CAMERIERE", lastName: "Zoppi" }),
      persona({ primaryRole: "CAMERIERE", lastName: "Abate" }),
    ]);
    expect(gruppi[0].members.map((m) => m.lastName)).toEqual(["Abate", "Zoppi"]);
  });
});

describe("stato di una persona", () => {
  it("solo chi è in servizio è assegnabile", () => {
    expect(isAssignable("ACTIVE")).toBe(true);
    for (const s of STAFF_STATUSES.filter((x) => x.value !== "ACTIVE")) {
      expect(isAssignable(s.value), `${s.value} non dovrebbe essere assegnabile`).toBe(false);
    }
  });

  it("i cinque stati hanno tutti un'etichetta in italiano", () => {
    expect(STAFF_STATUSES).toHaveLength(5);
    for (const s of STAFF_STATUSES) expect(s.label.length).toBeGreaterThan(2);
  });
});

describe("ricerca del personale", () => {
  it("trova per nome, senza badare ad accenti e maiuscole", () => {
    expect(matchesStaffQuery(persona({ primaryRole: "MAITRE" }), "MARIO")).toBe(true);
  });

  it("«cucina» tira su tutta la brigata, e nessuno della sala", () => {
    expect(matchesStaffQuery(persona({ primaryRole: "SOUS_CHEF" }), "cucina")).toBe(true);
    expect(matchesStaffQuery(persona({ primaryRole: "LAVAPIATTI" }), "cucina")).toBe(true);
    expect(matchesStaffQuery(persona({ primaryRole: "CAMERIERE", role: "Cameriere" }), "cucina")).toBe(false);
  });

  it("«camerieri» al plurale trova un Chef de rang", () => {
    expect(matchesStaffQuery(persona({ primaryRole: "CHEF_DE_RANG", role: "Chef de rang" }), "camerieri")).toBe(true);
  });

  /* «chef» trova anche lo Chef de rang, che è di sala: la parola è nel suo
     nome, e nascondere un risultato che l'utente ha davanti agli occhi
     sarebbe più sorprendente che mostrarne uno in più. Chi cerca la brigata
     scrive «cucina», e quello filtra per davvero. */
  it("«chef» tira su chi ha «chef» nel ruolo, e nessun altro", () => {
    expect(matchesStaffQuery(persona({ primaryRole: "EXECUTIVE_CHEF", role: "Executive Chef" }), "chef")).toBe(true);
    expect(matchesStaffQuery(persona({ primaryRole: "CHEF_DE_RANG", role: "Chef de rang" }), "chef")).toBe(true);
    expect(matchesStaffQuery(persona({ primaryRole: "SOMMELIER", role: "Sommelier" }), "chef")).toBe(false);
  });

  it("una ricerca vuota non filtra niente", () => {
    expect(matchesStaffQuery(persona(), "   ")).toBe(true);
  });
});
