import type { StaffRole } from "@prisma/client";

/**
 * Chi può fare cosa.
 *
 * Sta in un file suo, separato da `tenant.ts`, per due motivi. Il primo è
 * architetturale: decidere se un ruolo può compiere un'azione non ha niente a
 * che vedere con il leggere sessione e cookie. Il secondo è pratico:
 * `tenant.ts` usa `cache()` di React, che esiste solo dentro un rendering, e
 * questo rendeva impossibile verificare la matrice con un test.
 */

export type Ability =
  | "manage_org"
  | "manage_venue"
  | "manage_bookings"
  | "view_revenue"
  | "edit_marketing"
  | "manage_staff"
  | "manage_contracts";

const matrix: Record<StaffRole, Ability[]> = {
  MANAGER: ["manage_venue", "manage_bookings", "view_revenue", "edit_marketing", "manage_staff", "manage_contracts"],
  RECEPTION: ["manage_bookings"],
  WAITER: ["manage_bookings"],
  MARKETING: ["edit_marketing", "view_revenue"],
  READ_ONLY: [],
};

export function can(role: StaffRole, ability: Ability) {
  return matrix[role]?.includes(ability) ?? false;
}
