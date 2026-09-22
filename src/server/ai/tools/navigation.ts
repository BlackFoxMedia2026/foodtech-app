import type { Tool } from "../types";

const SECTION_ROUTES: Record<string, string> = {
  panoramica: "/overview",
  prenotazioni: "/bookings",
  // «Vai in sala» apre la sala del locale, la stessa che apre la voce «Sala»
  // del menu: un nome, una destinazione. La sala viva del servizio si apre
  // dal Servizio, con la sua linguetta.
  sala: "/floor",
  piantina: "/floor",
  // «Camerieri» resta una chiave anche se la sezione ora si chiama Staff:
  // è la parola che la gente dice, e toglierla romperebbe un comando che
  // funzionava.
  staff: "/staff",
  personale: "/staff",
  camerieri: "/staff",
  cucina: "/staff",
  ospiti: "/guests",
  // «esperienze» non c'è: la sezione è sospesa e fuori dalla navigazione
  // (vedi `PROFILE_NAV`). Aprirla da qui sarebbe l'unica strada rimasta per
  // arrivarci, cioè il contrario di sospenderla.
  /*
    «Vai in marketing» apre le campagne, che è dove porta adesso anche la voce
    in barra: `/marketing` non è più una pagina ma un menu, e il suo percorso
    reindirizza qui. Mandare l'agente su un redirect funzionerebbe lo stesso —
    è una fermata in più per niente.
  */
  marketing: "/campaigns",
  campagne: "/campaigns",
  /*
    Gli strumenti del menu Marketing, con le parole che la gente dice. Prima
    «apri i coupon» non era un comando: l'unica chiave era «marketing» e
    portava all'indice, da cui bisognava ricominciare a mano — cioè
    esattamente il passaggio che quell'indice non fa più fare a nessuno.

    Solo nomi di **una parola**: la regola che le riconosce cattura un token
    solo (`intent-router.ts`), quindi «gift card» e «QR code» qui sarebbero
    chiavi che non si possono pronunciare. Al loro posto le parole che si
    dicono davvero — «buoni», «qr» — e ogni chiave sta anche in
    `SECTION_ROUTES` del router, altrimenti non arriva mai fin qui.
  */
  automazioni: "/marketing/automations",
  coupon: "/marketing/coupons",
  sconti: "/marketing/coupons",
  buoni: "/marketing/gift-cards",
  wifi: "/marketing/wifi",
  qr: "/marketing/qr-codes",
  eventi: "/eventi",
  gruppi: "/eventi",
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
