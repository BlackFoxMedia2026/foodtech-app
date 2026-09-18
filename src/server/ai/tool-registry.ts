import type { Tool } from "./types";
import { getTodayReservationsTool } from "./tools/reservations";
import { getServiceCoversTool, getOccupancyTool } from "./tools/covers";
import {
  getAvailableTablesTool,
  getUnassignedTablesTool,
} from "./tools/tables";
import { getWaiterAssignmentsTool } from "./tools/waiters";
import { getPeriodRevenueTool } from "./tools/analytics";
import { navigateTool } from "./tools/navigation";
import { assignWaiterTool } from "./tools/assign-waiter";
import { getExpiringContractsTool } from "./tools/contracts";
import { mettiInAttesaTool, prenotaTool, richiamaTool } from "./tools/telefono";
import {
  chiNonTornaTool,
  chiRischiaAssenzaTool,
  giornoPeggioreTool,
  piattiCheRendonoMenoTool,
  tavoliLunghiTool,
} from "./tools/domande-operative";

export const toolRegistry: Record<string, Tool> = {
  get_today_reservations: getTodayReservationsTool,
  get_service_covers: getServiceCoversTool,
  get_occupancy: getOccupancyTool,
  get_available_tables: getAvailableTablesTool,
  get_unassigned_tables: getUnassignedTablesTool,
  get_waiter_assignments: getWaiterAssignmentsTool,
  get_period_revenue: getPeriodRevenueTool,
  navigate_to_section: navigateTool,
  assign_waiter: assignWaiterTool,
  get_expiring_contracts: getExpiringContractsTool,
  // Le cinque domande operative del §56: chi rischia di mancare, quali tavoli
  // vanno lunghi, chi non torna, quali piatti rendono meno, qual è il giorno
  // peggiore. Tutte su dati che esistono già.
  chi_rischia_assenza: chiRischiaAssenzaTool,
  tavoli_lunghi: tavoliLunghiTool,
  chi_non_torna: chiNonTornaTool,
  piatti_che_rendono_meno: piattiCheRendonoMenoTool,
  giorno_peggiore: giornoPeggioreTool,
  /*
    I tre strumenti che **scrivono**, con le tre regole (§68, §69).
   
    Non scrivono da qui: costruiscono un'anteprima da confermare, e la
    scrittura sta negli esecutori. È la differenza fra un assistente che
    prende una prenotazione e un assistente che dice di averla presa.
  */
  prenota: prenotaTool,
  metti_in_attesa: mettiInAttesaTool,
  crea_richiamata: richiamaTool,
};
