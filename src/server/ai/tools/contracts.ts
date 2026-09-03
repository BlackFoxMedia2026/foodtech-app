import { db } from "@/lib/db";
import { getContractStatusDetail, pickCurrentContract } from "@/lib/staff-contracts";
import type { Tool } from "../types";

/** Gated by "manage_contracts" (see agent-service.ts's requireAbility call) —
 * a user who can't see contracts in the UI gets a friendly refusal instead
 * of the agent reading the data on their behalf (brief section 31/32: no
 * contract data ever leaves this internal tool, nothing is sent to the
 * external ChatGPT fallback). */
export const getExpiringContractsTool: Tool = {
  ability: "manage_contracts",
  async run(ctx) {
    const windowDays = 30;
    const contracts = await db.staffContract.findMany({
      where: { venueId: ctx.venueId, endDate: { not: null } },
      include: { waiter: { select: { id: true, firstName: true, lastName: true } } },
    });

    const byWaiter = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const list = byWaiter.get(c.waiterId) ?? [];
      list.push(c);
      byWaiter.set(c.waiterId, list);
    }

    const upcoming = [...byWaiter.values()]
      .map((list) => pickCurrentContract(list))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ contract: c, daysRemaining: Math.floor((c.endDate!.getTime() - Date.now()) / 86_400_000) }))
      .filter((c) => c.daysRemaining >= 0 && c.daysRemaining <= windowDays)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    if (upcoming.length === 0) {
      return { text: `Nessun contratto in scadenza nei prossimi ${windowDays} giorni.` };
    }

    return {
      text: `${upcoming.length} contratti in scadenza nei prossimi ${windowDays} giorni.`,
      structured: {
        type: "list",
        title: "Contratti in scadenza",
        items: upcoming.map(({ contract }) => ({
          title: `${contract.waiter.firstName} ${contract.waiter.lastName}`,
          subtitle: getContractStatusDetail(contract),
        })),
      },
    };
  },
};
