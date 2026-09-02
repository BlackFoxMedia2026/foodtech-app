import { getAnalytics } from "@/server/analytics";
import type { Tool } from "../types";

export const getPeriodRevenueTool: Tool = {
  ability: "view_revenue",
  async run(ctx) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    const analytics = await getAnalytics(ctx.venueId, from, to);
    const avgSpend = (analytics.avgSpendCents / 100).toFixed(2);

    return {
      text: `Negli ultimi 30 giorni: ${analytics.bookings} prenotazioni, ${analytics.covers} coperti, spesa media per ospite ${avgSpend}€.`,
      structured: { type: "metric", label: "Spesa media (30gg)", value: `${avgSpend}€`, hint: `${analytics.bookings} prenotazioni` },
    };
  },
};
