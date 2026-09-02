import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";

/**
 * Pure constants, no `db` import — safe to pull into client components
 * (unlike src/server/waiters.ts, which drags in @/lib/db transitively).
 */

export const STAFF_PRIMARY_ROLES: { value: StaffPrimaryRole; label: string }[] = [
  { value: "RESTAURANT_MANAGER", label: "Restaurant Manager" },
  { value: "MAITRE", label: "Maître" },
  { value: "CHEF_DE_RANG", label: "Chef de rang" },
  { value: "CAMERIERE", label: "Cameriere" },
  { value: "COMMIS_SALA", label: "Commis di sala" },
  { value: "SOMMELIER", label: "Sommelier" },
  { value: "HEAD_SOMMELIER", label: "Head Sommelier" },
  { value: "RUNNER", label: "Runner" },
  { value: "BUSSER", label: "Busser" },
  { value: "HOST", label: "Host / Hostess" },
  { value: "BARTENDER", label: "Bartender" },
];

export const STAFF_CAPABILITIES: { value: StaffCapability; label: string }[] = [
  { value: "TABLE_RESPONSIBLE", label: "Responsabile tavolo" },
  { value: "TABLE_SUPPORT", label: "Supporto / Commis" },
  { value: "SOMMELIER", label: "Sommelier" },
  { value: "RUNNER", label: "Runner" },
  { value: "BUSSER", label: "Busser" },
  { value: "ROOM_SUPERVISOR", label: "Responsabile sala" },
  { value: "SERVICE_MANAGER", label: "Responsabile servizio" },
  { value: "MAITRE", label: "Maître" },
  { value: "HOST", label: "Accoglienza" },
  { value: "BARTENDER", label: "Bar / Cocktail" },
];

/** Capabilities suggested by default when a primary role is picked — the
 * user can still check/uncheck freely afterwards, these are just a starting
 * point (brief section 5). */
export const DEFAULT_CAPABILITIES_BY_ROLE: Record<StaffPrimaryRole, StaffCapability[]> = {
  RESTAURANT_MANAGER: ["SERVICE_MANAGER"],
  MAITRE: ["ROOM_SUPERVISOR", "SERVICE_MANAGER", "TABLE_RESPONSIBLE", "MAITRE"],
  CHEF_DE_RANG: ["TABLE_RESPONSIBLE", "TABLE_SUPPORT", "RUNNER"],
  CAMERIERE: ["TABLE_RESPONSIBLE", "TABLE_SUPPORT", "RUNNER"],
  COMMIS_SALA: ["TABLE_SUPPORT", "RUNNER"],
  SOMMELIER: ["SOMMELIER"],
  HEAD_SOMMELIER: ["SOMMELIER", "ROOM_SUPERVISOR"],
  RUNNER: ["RUNNER"],
  BUSSER: ["BUSSER", "RUNNER"],
  HOST: ["HOST"],
  BARTENDER: ["BARTENDER"],
};

export function staffPrimaryRoleLabel(role: StaffPrimaryRole) {
  return STAFF_PRIMARY_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function staffCapabilityLabel(capability: StaffCapability) {
  return STAFF_CAPABILITIES.find((c) => c.value === capability)?.label ?? capability;
}

/** The 4 capabilities assignable on a single table (brief section 9) — in
 * priority order, matching how they're shown in the assign-staff dialog and
 * on the floor plan node. */
export const TABLE_ASSIGNABLE_CAPABILITIES = ["TABLE_RESPONSIBLE", "SOMMELIER", "TABLE_SUPPORT", "RUNNER"] as const satisfies readonly StaffCapability[];

export const TABLE_ROLE_LABELS: Record<(typeof TABLE_ASSIGNABLE_CAPABILITIES)[number], string> = {
  TABLE_RESPONSIBLE: "Responsabile tavolo",
  SOMMELIER: "Sommelier",
  TABLE_SUPPORT: "Supporto",
  RUNNER: "Runner",
};
