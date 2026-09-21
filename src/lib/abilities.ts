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
  | "manage_shifts"
  /**
   * Rispondere al telefono e occuparsi delle chiamate.
   *
   * Separata da `manage_bookings`, che era la capacità con cui il telefono era
   * protetto per errore di comodità: prendere una prenotazione e **vedere lo
   * storico delle telefonate con i numeri dei clienti** non sono lo stesso
   * potere. E soprattutto: la pagina del telefono non aveva alcun controllo di
   * ruolo — un accesso in sola lettura leggeva nomi, numeri e chiamate perse.
   */
  | "use_phone"
  /**
   * Collegare e configurare il telefono: la chiave della licenza, le chiavi di
   * collegamento del centralino, le credenziali SIP.
   *
   * Sta separata da `use_phone` per la stessa ragione per cui `manage_shifts`
   * sta separata da `manage_staff`: rispondere al telefono lo fa chi è in sala
   * ogni sera, collegare un centralino si fa una volta e vale per tutti. Oggi
   * solo il manager, e le credenziali SIP non sono un dettaglio — sono un
   * numero di telefono da cui si possono fare chiamate a spese del locale.
   */
  | "manage_phone";

/**
 * `manage_shifts` sta separata da `manage_staff` anche se oggi le ha lo stesso
 * ruolo, e non è indirezione gratuita: sono due poteri diversi che il brief
 * chiede esplicitamente di poter separare. Pianificare la settimana è una cosa
 * che fa un responsabile di sala tutte le settimane; assumere, licenziare e
 * leggere i contratti di tutti è un'altra. Il giorno in cui esisterà un ruolo
 * «responsabile», gli si dà questa e non quella — e il codice non va toccato.
 */
const matrix: Record<StaffRole, Ability[]> = {
  MANAGER: [
    "manage_venue",
    "manage_bookings",
    "view_revenue",
    "edit_marketing",
    "manage_staff",
    "manage_contracts",
    "manage_shifts",
    "use_phone",
    "manage_phone",
  ],
  /* Reception e camerieri rispondono al telefono: in un locale con quattro
     persone lo fa chi è più vicino all'apparecchio, e togliere la funzione a
     uno dei due vorrebbe dire una telefonata persa ogni volta che quello
     giusto è in cucina. */
  RECEPTION: ["manage_bookings", "use_phone"],
  WAITER: ["manage_bookings", "use_phone"],
  /* Marketing e sola lettura **no**, ed è la correzione di questa fase: non
     avevano il telefono in barra per caso — ce l'avevano, perché la voce
     compariva col solo collegamento del centralino e la pagina non guardava
     il ruolo. Chi fa le campagne e chi guarda i numeri non ha niente da fare
     con lo storico delle telefonate, che è un elenco di numeri di clienti. */
  MARKETING: ["edit_marketing", "view_revenue"],
  READ_ONLY: [],
};

export function can(role: StaffRole, ability: Ability) {
  return matrix[role]?.includes(ability) ?? false;
}
