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
  | "manage_contracts"
  | "manage_shifts";

/**
 * `manage_shifts` sta separata da `manage_staff` anche se oggi le ha lo stesso
 * ruolo, e non è indirezione gratuita: sono due poteri diversi che il brief
 * chiede esplicitamente di poter separare. Pianificare la settimana è una cosa
 * che fa un responsabile di sala tutte le settimane; assumere, licenziare e
 * leggere i contratti di tutti è un'altra. Il giorno in cui esisterà un ruolo
 * «responsabile», gli si dà questa e non quella — e il codice non va toccato.
 */
const matrix: Record<StaffRole, Ability[]> = {
  MANAGER: ["manage_venue", "manage_bookings", "view_revenue", "edit_marketing", "manage_staff", "manage_contracts", "manage_shifts"],
  RECEPTION: ["manage_bookings"],
  WAITER: ["manage_bookings"],
  MARKETING: ["edit_marketing", "view_revenue"],
  READ_ONLY: [],
};

export function can(role: StaffRole, ability: Ability) {
  return matrix[role]?.includes(ability) ?? false;
}
