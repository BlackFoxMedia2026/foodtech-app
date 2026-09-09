import type { Tool } from "../types";

const SECTION_ROUTES: Record<string, string> = {
  panoramica: "/overview",
  prenotazioni: "/bookings",
  // «Vai in sala» apre la sala del locale, la stessa che apre la voce «Sala»
  // del menu: un nome, una destinazione. La sala viva del servizio si apre
  // dal Servizio, con la sua linguetta.
  sala: "/floor",
  piantina: "/floor",
  camerieri: "/waiters",
  ospiti: "/guests",
  esperienze: "/experiences",
  marketing: "/marketing",
  pagamenti: "/payments",
  analytics: "/insights",
};

export const navigateTool: Tool = {
  ability: null,
  async run(_ctx, params) {
    const key = (params.section ?? "").toLowerCase();
    const path = SECTION_ROUTES[key];
    if (!path) {
      return { text: "Non ho capito quale sezione del gestionale aprire." };
    }
    return {
      text: `Apro ${params.section}.`,
      structured: { type: "navigate", path, label: params.section },
    };
  },
};
