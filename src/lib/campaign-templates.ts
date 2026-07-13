import type { Block, WithoutId } from "./campaign-blocks";

export interface CampaignTemplate {
  id: string;
  name: string;
  category: string;
  objectiveTags: string[];
  tone: "formale" | "amichevole" | "urgente" | "elegante";
  previewText: string;
  blocks: Block[];
}

function blocks(templateId: string, list: WithoutId<Block>[]): Block[] {
  return list.map((b, i) => ({ ...b, id: `${templateId}-${i}` })) as Block[];
}

/**
 * 9 template curati, NON una combinazione per ogni obiettivo/tipo di locale
 * (sarebbe contenuto finto in blocco). Obiettivi dello Step 1 SENZA un template
 * dedicato: "fill_slow_day" (parzialmente coperto da generic_promo),
 * "tasting_menu" (nessuno) e "custom" (per definizione parte da zero).
 * L'unsubscribe è aggiunto automaticamente dal wizard all'istanziazione, non è
 * incluso qui.
 */
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "win_back",
    name: "Torna a trovarci",
    category: "Recupero clienti",
    objectiveTags: ["win_back"],
    tone: "amichevole",
    previewText: "Un invito caldo per chi non prenota da un po'.",
    blocks: blocks("win_back", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "Ci sei mancato/a", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nÈ da un po' che non ti vediamo da {{RESTAURANT_NAME}}. Ti aspettiamo per un nuovo tavolo insieme.",
      },
      { type: "button_cta", label: "Prenota ora", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "event_announcement",
    name: "Evento in programma",
    category: "Eventi",
    objectiveTags: ["event"],
    tone: "elegante",
    previewText: "Annuncia una serata o un evento speciale.",
    blocks: blocks("event_announcement", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "hero_image", imageUrl: "", alt: "Evento" },
      { type: "title", text: "Un evento speciale ti aspetta", align: "center" },
      { type: "text", text: "Ciao {{FIRSTNAME}},\n\nAbbiamo organizzato una serata speciale da {{RESTAURANT_NAME}}. Non mancare." },
      { type: "button_cta", label: "Prenota il tuo posto", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "new_menu",
    name: "Novità in menù",
    category: "Menù",
    objectiveTags: ["new_menu"],
    tone: "amichevole",
    previewText: "Racconta le novità del menù.",
    blocks: blocks("new_menu", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "Novità in menù", align: "center" },
      { type: "text", text: "Ciao {{FIRSTNAME}},\n\nAbbiamo rinnovato il nostro menù con nuovi piatti da scoprire da {{RESTAURANT_NAME}}." },
      { type: "image", imageUrl: "", alt: "Nuovo piatto" },
      { type: "button_cta", label: "Prenota per assaggiarlo", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "birthday",
    name: "Buon compleanno",
    category: "Compleanni",
    objectiveTags: ["birthday_month"],
    tone: "amichevole",
    previewText: "Auguri per chi festeggia questo mese.",
    blocks: blocks("birthday", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "Buon compleanno, {{FIRSTNAME}}!", align: "center" },
      { type: "offer_box", title: "Un pensiero per te", body: "Vieni a festeggiare da {{RESTAURANT_NAME}} questo mese.", badge: "Compleanno" },
      { type: "button_cta", label: "Prenota il tuo tavolo", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "review_request",
    name: "Richiesta recensione",
    category: "Recensioni",
    objectiveTags: ["review_request"],
    tone: "formale",
    previewText: "Chiedi un feedback dopo la visita.",
    blocks: blocks("review_request", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "Com'è andata la tua visita?", align: "center" },
      { type: "text", text: "Ciao {{FIRSTNAME}},\n\nGrazie per averci scelto. Un tuo feedback ci aiuta a migliorare." },
      { type: "button_cta", label: "Lascia una recensione", url: "#", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "business_lunch",
    name: "Formula pranzo di lavoro",
    category: "Pranzo",
    objectiveTags: ["business_lunch"],
    tone: "formale",
    previewText: "Promuovi la formula pranzo per il pubblico business.",
    blocks: blocks("business_lunch", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "La soluzione ideale per il pranzo di lavoro", align: "center" },
      { type: "text", text: "Ciao {{FIRSTNAME}},\n\nScopri la nostra formula pranzo veloce e curata, pensata per i tuoi impegni di lavoro." },
      { type: "button_cta", label: "Prenota il pranzo", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "vip_offer",
    name: "Un pensiero per i clienti VIP",
    category: "Fidelizzazione",
    objectiveTags: ["vip"],
    tone: "elegante",
    previewText: "Un messaggio esclusivo per i clienti più fedeli.",
    blocks: blocks("vip_offer", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "Qualcosa di speciale per te", align: "center" },
      { type: "offer_box", title: "Riservato a te", body: "Come cliente {{LOYALTY_LEVEL}} di {{RESTAURANT_NAME}}, ti aspettiamo con un'attenzione speciale.", badge: "VIP" },
      { type: "button_cta", label: "Prenota ora", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "aperitivo_invite",
    name: "Invito aperitivo",
    category: "Serate",
    objectiveTags: ["aperitivo"],
    tone: "amichevole",
    previewText: "Invita i clienti a una serata o un aperitivo speciale.",
    blocks: blocks("aperitivo_invite", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "hero_image", imageUrl: "", alt: "Aperitivo" },
      { type: "title", text: "Ti aspettiamo per l'aperitivo", align: "center" },
      { type: "text", text: "Ciao {{FIRSTNAME}},\n\nUna serata speciale ti aspetta da {{RESTAURANT_NAME}}." },
      { type: "button_cta", label: "Prenota il tuo posto", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
  {
    id: "generic_promo",
    name: "Promozione generica",
    category: "Generico",
    objectiveTags: ["fill_slow_day", "custom"],
    tone: "amichevole",
    previewText: "Un template neutro per una promozione generica.",
    blocks: blocks("generic_promo", [
      { type: "logo", imageUrl: "", align: "center" },
      { type: "title", text: "Ti aspettiamo da {{RESTAURANT_NAME}}", align: "center" },
      { type: "text", text: "Ciao {{FIRSTNAME}},\n\nScrivi qui il messaggio della tua promozione." },
      { type: "button_cta", label: "Prenota ora", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}}" },
    ]),
  },
];

export function getCampaignTemplate(id: string | null): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}

export function templatesForObjective(objectiveId: string | null): CampaignTemplate[] {
  if (!objectiveId) return CAMPAIGN_TEMPLATES;
  return CAMPAIGN_TEMPLATES.filter((t) => t.objectiveTags.includes(objectiveId));
}
