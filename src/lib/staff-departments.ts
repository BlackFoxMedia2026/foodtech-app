import type { StaffDepartment, StaffPrimaryRole } from "@prisma/client";
import { ROLE_DEPARTMENT, STAFF_PRIMARY_ROLES, staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";

/**
 * I reparti: l'ossatura della pagina Staff.
 *
 * L'elenco del personale era raggruppato per **famiglia di ruolo** — dieci
 * fasce (Manager, Maître, Camerieri, Sommelier, Bar, Runner, Commis, Busser,
 * Host, Altri), quasi tutte con una o due persone dentro. Con i cinque ruoli
 * di cucina sarebbero diventate quindici: quindici intestazioni identiche da
 * leggere una per una per trovare un nome.
 *
 * Qui il primo livello è il reparto — quattro caselle che il ristoratore ha
 * già in testa, perché sono i posti fisici del locale — e il ruolo scende a
 * secondo livello, dentro la riga della persona. Con quattro gruppi l'occhio
 * salta; con quindici legge.
 */
export const STAFF_DEPARTMENTS: {
  key: StaffDepartment;
  label: string;
  /** Cosa contiene, per l'aiuto sotto il filtro quando il reparto è vuoto. */
  hint: string;
}[] = [
  { key: "SALA", label: "Sala", hint: "Maître, camerieri, sommelier, runner, accoglienza." },
  { key: "CUCINA", label: "Cucina", hint: "Brigata: executive chef, sous-chef, capi partita, commis, lavapiatti." },
  { key: "BAR", label: "Bar", hint: "Chi lavora al banco." },
  { key: "DIREZIONE", label: "Direzione", hint: "Chi coordina il locale." },
  { key: "ALTRO", label: "Altro", hint: "Anagrafiche senza un ruolo strutturato." },
];

export function staffDepartmentLabel(key: StaffDepartment): string {
  return STAFF_DEPARTMENTS.find((d) => d.key === key)?.label ?? key;
}

/** I ruoli di un reparto, nell'ordine in cui stanno in STAFF_PRIMARY_ROLES —
 * che è l'ordine gerarchico, non alfabetico: l'executive chef prima del
 * lavapiatti. Serve al selettore del ruolo, che è raggruppato per reparto. */
export function rolesByDepartment(key: StaffDepartment): StaffPrimaryRole[] {
  return STAFF_PRIMARY_ROLES.filter((r) => ROLE_DEPARTMENT[r.value] === key).map((r) => r.value);
}

/** Il selettore del ruolo, a gruppi. ALTRO non compare: non è un reparto che
 * si sceglie, è dove finisce chi non ha ancora un ruolo. */
export const ROLE_OPTIONS_BY_DEPARTMENT = STAFF_DEPARTMENTS.filter((d) => d.key !== "ALTRO")
  .map((d) => ({
    department: d.key,
    label: d.label,
    roles: rolesByDepartment(d.key).map((value) => ({ value, label: staffPrimaryRoleLabel(value) })),
  }))
  .filter((g) => g.roles.length > 0);

/**
 * Ordina il personale per reparto, e dentro ogni reparto per gerarchia di
 * ruolo (l'ordine di STAFF_PRIMARY_ROLES) e poi per cognome.
 *
 * I reparti vuoti non compaiono: «Bar · 0» ogni giorno insegna a non leggere
 * le intestazioni.
 */
const ROLE_RANK = new Map(STAFF_PRIMARY_ROLES.map((r, i) => [r.value, i]));

export function groupStaffByDepartment<
  T extends { primaryRole: StaffPrimaryRole | null; department?: StaffDepartment | null; lastName: string; firstName: string },
>(staff: T[]): { key: StaffDepartment; label: string; members: T[] }[] {
  const byKey = new Map<StaffDepartment, T[]>();
  for (const person of staff) {
    const key = staffDepartmentOf(person);
    const list = byKey.get(key) ?? [];
    list.push(person);
    byKey.set(key, list);
  }

  return STAFF_DEPARTMENTS.map((d) => ({
    key: d.key,
    label: d.label,
    members: (byKey.get(d.key) ?? []).sort((a, b) => {
      const rank =
        (a.primaryRole ? ROLE_RANK.get(a.primaryRole)! : 999) - (b.primaryRole ? ROLE_RANK.get(b.primaryRole)! : 999);
      if (rank !== 0) return rank;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it");
    }),
  })).filter((d) => d.members.length > 0);
}
