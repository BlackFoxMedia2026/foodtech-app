import { describe, expect, it } from "vitest";
import { can, type Ability } from "@/lib/abilities";
import type { StaffRole } from "@prisma/client";

/**
 * Questi test esistono per un motivo preciso: la matrice dei permessi
 * funzionava già, ma undici mutazioni non la interrogavano — fra cui la
 * creazione di una prenotazione. Un membro READ_ONLY poteva scrivere.
 *
 * Qui si fissa **cosa può fare ogni ruolo**, così un allargamento involontario
 * della matrice si vede subito. Il fatto che ogni route la interroghi davvero
 * è verificato dai test di isolamento e, in produzione, dal punto unico di
 * ingresso in `lib/api-auth.ts`.
 */

const RUOLI: StaffRole[] = ["MANAGER", "RECEPTION", "WAITER", "MARKETING", "READ_ONLY"];

const CAPACITA: Ability[] = [
  "manage_org",
  "manage_venue",
  "manage_bookings",
  "view_revenue",
  "edit_marketing",
  "manage_staff",
  "manage_contracts",
];

/** La verità attesa, scritta per esteso: leggibile anche da chi non conosce il codice. */
const ATTESO: Record<StaffRole, Ability[]> = {
  MANAGER: ["manage_venue", "manage_bookings", "view_revenue", "edit_marketing", "manage_staff", "manage_contracts"],
  RECEPTION: ["manage_bookings"],
  WAITER: ["manage_bookings"],
  MARKETING: ["edit_marketing", "view_revenue"],
  READ_ONLY: [],
};

describe("matrice dei permessi", () => {
  for (const ruolo of RUOLI) {
    it(`${ruolo} ha esattamente le capacità previste`, () => {
      const effettive = CAPACITA.filter((c) => can(ruolo, c)).sort();
      expect(effettive).toEqual([...ATTESO[ruolo]].sort());
    });
  }

  it("READ_ONLY non può scrivere nulla", () => {
    for (const capacita of CAPACITA) {
      expect(can("READ_ONLY", capacita)).toBe(false);
    }
  });

  it("nessun ruolo ha manage_org: l'amministrazione dell'organizzazione non è ancora un prodotto", () => {
    // Se un giorno qualcuno la assegna, questo test lo fa notare: la capacità
    // esiste nel tipo ma nessuna route la usa, quindi assegnarla oggi darebbe
    // un permesso che non apre nulla.
    for (const ruolo of RUOLI) {
      expect(can(ruolo, "manage_org")).toBe(false);
    }
  });

  it("il personale richiede manage_staff, che ha solo MANAGER", () => {
    expect(can("MANAGER", "manage_staff")).toBe(true);
    // Cambiato deliberatamente in Phase 0: prima RECEPTION poteva creare
    // camerieri perché la route non controllava il ruolo.
    expect(can("RECEPTION", "manage_staff")).toBe(false);
    expect(can("WAITER", "manage_staff")).toBe(false);
  });

  it("la configurazione della sala richiede manage_venue, che ha solo MANAGER", () => {
    expect(can("MANAGER", "manage_venue")).toBe(true);
    for (const ruolo of ["RECEPTION", "WAITER", "MARKETING", "READ_ONLY"] as StaffRole[]) {
      expect(can(ruolo, "manage_venue")).toBe(false);
    }
  });

  it("chi sta in sala può gestire le prenotazioni", () => {
    for (const ruolo of ["MANAGER", "RECEPTION", "WAITER"] as StaffRole[]) {
      expect(can(ruolo, "manage_bookings")).toBe(true);
    }
    expect(can("MARKETING", "manage_bookings")).toBe(false);
  });

  it("un ruolo non previsto non riceve permessi per errore", () => {
    // La matrice è un Record<StaffRole, …>: un valore fuori enum non deve
    // finire in un accesso indefinito che diventa "permesso concesso".
    expect(can("NON_ESISTE" as StaffRole, "manage_bookings")).toBe(false);
  });
});
