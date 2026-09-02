import { getOverview } from "@/server/insights";
import type { Tool } from "../types";

export const getServiceCoversTool: Tool = {
  ability: null,
  async run(ctx) {
    const overview = await getOverview(ctx.venueId);
    return {
      text: `Hai ${overview.totalCovers} coperti previsti oggi${overview.serviceName ? ` per il servizio ${overview.serviceName}` : ""}.`,
      structured: { type: "metric", label: "Coperti oggi", value: String(overview.totalCovers) },
    };
  },
};

export const getOccupancyTool: Tool = {
  ability: null,
  async run(ctx) {
    const overview = await getOverview(ctx.venueId);
    return {
      text: `L'occupazione di oggi è al ${overview.occupancyPct}% (${overview.totalCovers} coperti su una capacità stimata di ${overview.capacity}).`,
      structured: { type: "metric", label: "Occupazione", value: `${overview.occupancyPct}%`, hint: `${overview.totalCovers}/${overview.capacity} coperti` },
    };
  },
};
