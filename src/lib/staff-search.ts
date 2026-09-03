import type { StaffPrimaryRole } from "@prisma/client";
import { staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { getStaffRoleGroupKey, getStaffRoleGroupLabel } from "@/lib/staff-role-groups";

const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase + strip accents (so "maitre" matches "Maître") + trim — mirrors
 * the normalization already used for the AI agent's message matching
 * (src/server/ai/intent-router.ts), kept local here since that module isn't
 * meant to be imported from client components (brief section 21). */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(DIACRITICS, "").trim();
}

export type SearchableStaff = {
  firstName: string;
  lastName: string;
  role: string;
  primaryRole: StaffPrimaryRole | null;
};

/** Case/accent-insensitive match on first name, last name, full name,
 * legacy role text, the structured primaryRole label, and the role's group
 * label — so "Camerieri" also surfaces a Chef de rang (brief sections 20/23). */
export function matchesStaffQuery(staff: SearchableStaff, rawQuery: string): boolean {
  const query = normalize(rawQuery);
  if (!query) return true;

  const haystack = [
    staff.firstName,
    staff.lastName,
    `${staff.firstName} ${staff.lastName}`,
    staff.role,
    staff.primaryRole ? staffPrimaryRoleLabel(staff.primaryRole) : "",
    getStaffRoleGroupLabel(getStaffRoleGroupKey(staff.primaryRole)),
  ]
    .map(normalize)
    .join(" ");

  return haystack.includes(query);
}
