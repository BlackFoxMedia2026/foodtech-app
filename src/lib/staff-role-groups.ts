import type { StaffPrimaryRole } from "@prisma/client";

/**
 * Presentation-only grouping for the "Camerieri" list (brief sections 8/9):
 * purely how the roster is bucketed and ordered on screen — never written
 * back to Waiter.primaryRole. Roles that are the same operational family
 * (a Chef de rang is a senior Cameriere, a Head Sommelier is a Sommelier)
 * share one group; every other StaffPrimaryRole gets its own group. Order
 * here is also the display order (brief section 3).
 */
export type StaffRoleGroupKey =
  | "manager"
  | "maitre"
  | "waiters"
  | "sommelier"
  | "bar"
  | "runner"
  | "commis"
  | "busser"
  | "host"
  | "other";

export const STAFF_ROLE_GROUPS: { key: StaffRoleGroupKey; label: string; roles: StaffPrimaryRole[] }[] = [
  { key: "manager", label: "Restaurant Manager", roles: ["RESTAURANT_MANAGER"] },
  { key: "maitre", label: "Maître", roles: ["MAITRE"] },
  { key: "waiters", label: "Camerieri", roles: ["CHEF_DE_RANG", "CAMERIERE"] },
  { key: "sommelier", label: "Sommelier", roles: ["SOMMELIER", "HEAD_SOMMELIER"] },
  { key: "bar", label: "Bartender", roles: ["BARTENDER"] },
  { key: "runner", label: "Runner", roles: ["RUNNER"] },
  { key: "commis", label: "Commis di sala", roles: ["COMMIS_SALA"] },
  { key: "busser", label: "Busser", roles: ["BUSSER"] },
  { key: "host", label: "Host / Hostess", roles: ["HOST"] },
];

/** Waiters without a structured primaryRole (legacy free-text `role` only)
 * fall in here, always last (brief section 3, position 10 "altri ruoli"). */
const OTHER_GROUP = { key: "other" as const, label: "Altri ruoli", roles: [] as StaffPrimaryRole[] };

export function getStaffRoleGroupKey(primaryRole: StaffPrimaryRole | null): StaffRoleGroupKey {
  if (!primaryRole) return OTHER_GROUP.key;
  return STAFF_ROLE_GROUPS.find((g) => g.roles.includes(primaryRole))?.key ?? OTHER_GROUP.key;
}

export function getStaffRoleGroupLabel(key: StaffRoleGroupKey): string {
  return [...STAFF_ROLE_GROUPS, OTHER_GROUP].find((g) => g.key === key)?.label ?? key;
}

/** Groups + orders waiters by role family, dropping any group with no
 * members (brief section 2 — never render an empty "Bartender · 0"). */
export function groupWaitersByRole<T extends { primaryRole: StaffPrimaryRole | null }>(
  waiters: T[],
): { key: StaffRoleGroupKey; label: string; members: T[] }[] {
  const byKey = new Map<StaffRoleGroupKey, T[]>();
  for (const w of waiters) {
    const key = getStaffRoleGroupKey(w.primaryRole);
    const list = byKey.get(key) ?? [];
    list.push(w);
    byKey.set(key, list);
  }

  return [...STAFF_ROLE_GROUPS, OTHER_GROUP]
    .map((g) => ({ key: g.key, label: g.label, members: byKey.get(g.key) ?? [] }))
    .filter((g) => g.members.length > 0);
}
