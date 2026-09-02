import { z } from "zod";
import { assignTableToWaiter } from "@/server/waiter-assignments";
import type { AgentContext, ToolResult } from "./types";

type ActionExecutor = (ctx: AgentContext, params: Record<string, unknown>) => Promise<ToolResult>;

const AssignWaiterParams = z.object({
  waiterId: z.string().min(1),
  tableIds: z.array(z.string().min(1)).min(1),
  date: z.coerce.date(),
  service: z.string().min(1),
});

/**
 * Executors only run after the user has explicitly confirmed the preview
 * built by the matching tool in tools/*.ts. They re-validate their params
 * with zod, but do NOT need to re-check tenant ownership of the ids
 * themselves — assignTableToWaiter() already scopes every lookup by
 * venueId internally, so a tampered id from a malicious client is rejected
 * there regardless of what this layer does.
 */
export const actionExecutors: Record<string, ActionExecutor> = {
  async assign_waiter(ctx, rawParams) {
    const params = AssignWaiterParams.parse(rawParams);
    for (const tableId of params.tableIds) {
      await assignTableToWaiter(ctx.venueId, {
        tableId,
        waiterId: params.waiterId,
        date: params.date,
        service: params.service,
      });
    }
    return { text: `Fatto: assegnato a ${params.tableIds.length} tavoli.` };
  },
};
