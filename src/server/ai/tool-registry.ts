import type { Tool } from "./types";
import { getTodayReservationsTool } from "./tools/reservations";
import { getServiceCoversTool, getOccupancyTool } from "./tools/covers";
import { getAvailableTablesTool, getUnassignedTablesTool } from "./tools/tables";
import { getWaiterAssignmentsTool } from "./tools/waiters";
import { getPeriodRevenueTool } from "./tools/analytics";
import { navigateTool } from "./tools/navigation";
import { assignWaiterTool } from "./tools/assign-waiter";

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
};
