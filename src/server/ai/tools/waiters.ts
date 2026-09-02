import { listTableAssignmentsForService, listServiceOptions } from "@/server/waiter-assignments";
import type { Tool } from "../types";

export const getWaiterAssignmentsTool: Tool = {
  ability: null,
  async run(ctx) {
    const date = ctx.page?.date ? new Date(ctx.page.date) : new Date();
    const service = ctx.page?.service ?? (await listServiceOptions(ctx.venueId))[0];
    const assignments = await listTableAssignmentsForService(ctx.venueId, date, service);

    if (assignments.length === 0) {
      return { text: `Nessun cameriere risulta assegnato per il servizio ${service}.` };
    }
    return {
      text: `${assignments.length} camerieri assegnati per il servizio ${service}.`,
      structured: {
        type: "list",
        title: `Camerieri · ${service}`,
        items: assignments.map((a) => ({
          title: `${a.waiter.firstName} ${a.waiter.lastName}`,
          subtitle: `${a.tableIds.length} tavoli`,
        })),
      },
    };
  },
};
