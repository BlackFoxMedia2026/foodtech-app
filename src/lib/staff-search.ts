import type { StaffDepartment, StaffPrimaryRole } from "@prisma/client";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { staffDepartmentLabel } from "@/lib/staff-departments";

const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase + strip accents (so "maitre" matches "Maître") + trim — mirrors
 * the normalization already used for the AI agent's message matching
 * (src/server/ai/intent-router.ts), kept local here since that module isn't
 * meant to be imported from client components (brief section 21). */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(DIACRITICS, "").trim();
}

/**
 * Come si cerca davvero una persona.
 *
 * Chi scrive nella casella scrive il plurale e la parola di tutti i giorni:
 * «camerieri», «cuochi», «chef». L'etichetta del ruolo è al singolare e in
 * francese — «Cameriere», «Chef de Partie» — quindi una ricerca per sottostringa
 * sul solo nome del ruolo non trova niente proprio nei casi in cui serve.
 *
 * Questi sinonimi coprono lo scarto. Non sono un dizionario: sono le parole
 * che un ristoratore digita quando cerca «chi mi copre la cucina stasera».
 */
const ROLE_ALIASES: Partial<Record<StaffPrimaryRole, string>> = {
  RESTAURANT_MANAGER: "manager direttore responsabile",
  MAITRE: "maitre responsabile sala",
  CHEF_DE_RANG: "camerieri cameriere rango",
  CAMERIERE: "camerieri",
  COMMIS_SALA: "commis camerieri",
  SOMMELIER: "sommelier vini cantina",
  HEAD_SOMMELIER: "sommelier vini cantina",
  RUNNER: "runner",
  BUSSER: "busser",
  HOST: "host hostess accoglienza",
  BARTENDER: "bartender barman barista bar",
  EXECUTIVE_CHEF: "chef cuochi cuoco cucina executive",
  SOUS_CHEF: "chef cuochi cuoco cucina sous",
  CHEF_DE_PARTIE: "chef cuochi cuoco cucina capo partita",
  COMMIS_CUCINA: "commis cuochi cuoco cucina",
  LAVAPIATTI: "lavapiatti piatti cucina",
};

export type SearchableStaff = {
  firstName: string;
  lastName: string;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  department?: StaffDepartment | null;
};

/** Case/accent-insensitive match on first name, last name, full name, legacy
 * role text, the structured primaryRole label, its everyday synonyms, and the
 * department — so "cucina" surfaces the whole brigata and "camerieri" also
 * surfaces a Chef de rang. */
export function matchesStaffQuery(staff: SearchableStaff, rawQuery: string): boolean {
  const query = normalize(rawQuery);
  if (!query) return true;

  const haystack = [
    staff.firstName,
    staff.lastName,
    `${staff.firstName} ${staff.lastName}`,
    staff.role,
    staff.primaryRole ? staffPrimaryRoleLabel(staff.primaryRole) : "",
    staff.primaryRole ? ROLE_ALIASES[staff.primaryRole] ?? "" : "",
    staffDepartmentLabel(staffDepartmentOf(staff)),
  ]
    .map(normalize)
    .join(" ");

  return haystack.includes(query);
}
