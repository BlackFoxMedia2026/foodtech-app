import { db } from "@/lib/db";
import {
  contrattoInVigore,
  getContractStatusDetail,
  pickCurrentContract,
} from "@/lib/staff-contracts";
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

    /*
      Chi **oggi** non è coperto da nessun contratto.

      È più urgente di una scadenza fra venti giorni, e prima non compariva:
      `pickCurrentContract` scegli il contratto cominciato per ultimo, quindi
      con un contratto scaduto il mese scorso e un rinnovo che parte il mese
      prossimo guardava il rinnovo — «non ancora iniziato» — e non vedeva
      niente da segnalare. Nel frattempo quella persona lavora senza contratto
      in vigore, e chiedere «chi ha il contratto in scadenza?» e sentirsi
      rispondere «nessuno» è la risposta peggiore possibile.

      Lo stesso ragionamento della scheda del dipendente, e la stessa funzione:
      «chi copre oggi» è una domanda diversa da «qual è l'ultimo».
    */
    const scoperti = [...byWaiter.values()]
      .filter((list) => list.length > 0 && !contrattoInVigore(list))
      .map((list) => pickCurrentContract(list))
      .filter((c): c is NonNullable<typeof c> => !!c);

    const nome = (w: { firstName: string; lastName: string | null }) =>
      `${w.firstName}${w.lastName ? ` ${w.lastName}` : ""}`;

    if (upcoming.length === 0 && scoperti.length === 0) {
      return {
        text: `Nessun contratto in scadenza nei prossimi ${windowDays} giorni, e nessuno senza contratto in vigore.`,
      };
    }

    const pezzi: string[] = [];
    if (scoperti.length > 0) {
      /* I nomi nel testo e non solo nell'elenco: all'agente si chiede a voce,
         e «una persona senza contratto» senza dire chi obbliga a cercarla. */
      pezzi.push(
        `${scoperti.length === 1 ? "Una persona è" : `${scoperti.length} persone sono`} ` +
          `senza contratto in vigore adesso: ${scoperti.map((c) => nome(c.waiter)).join(", ")}.`,
      );
    }
    if (upcoming.length > 0) {
      pezzi.push(
        `${upcoming.length} ${upcoming.length === 1 ? "contratto scade" : "contratti scadono"} ` +
          `nei prossimi ${windowDays} giorni: ${upcoming.map(({ contract }) => nome(contract.waiter)).join(", ")}.`,
      );
    }

    return {
      text: pezzi.join(" "),
      structured: {
        type: "list",
        title: "Contratti da guardare",
        items: [
          ...scoperti.map((c) => ({
            title: nome(c.waiter),
            subtitle: "Senza contratto in vigore adesso",
          })),
          ...upcoming.map(({ contract }) => ({
            title: nome(contract.waiter),
            subtitle: getContractStatusDetail(contract),
          })),
        ],
      },
    };
  },
};
