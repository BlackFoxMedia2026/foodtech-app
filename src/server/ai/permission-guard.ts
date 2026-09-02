import type { StaffRole } from "@prisma/client";
import { can, type Ability } from "@/lib/tenant";

export class PermissionDeniedError extends Error {
  constructor(public ability: Ability) {
    super("permission_denied");
  }
}

export function requireAbility(role: StaffRole, ability: Ability | null) {
  if (!ability) return;
  if (!can(role, ability)) throw new PermissionDeniedError(ability);
}
