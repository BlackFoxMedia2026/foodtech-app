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
 * Placeholder visivo (SVG inline, nessuna chiamata di rete) per i campi
 * logo/foto dei template: senza, l'anteprima mostrerebbe riquadri vuoti/rotti
 * e non "renderebbe l'idea" del template. Il bordo tratteggiato e la scritta
 * segnalano chiaramente che va sostituito con la foto vera del locale prima
 * dell'invio — non è pensato per restare nell'email reale.
 */
function placeholderImage(label: string, width: number, height: number): string {
  const fontSize = Math.max(13, Math.round(height / 9));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#F4E9DE"/><rect x="3" y="3" width="${width - 6}" height="${height - 6}" fill="none" stroke="#CD3A04" stroke-width="2" stroke-dasharray="10 8"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="#B0300E" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const LOGO_PLACEHOLDER = placeholderImage("IL TUO LOGO", 240, 72);

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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "Ci sei mancato/a", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nÈ da un po' che non ti vediamo da {{RESTAURANT_NAME}} e ci hai un po' mancato. Nel frattempo abbiamo rinnovato qualcosa nel menù e vorremmo tanto riaverti a tavola con noi.\n\nChe ne dici di prenotare per la prossima occasione? Ti aspettiamo con lo stesso calore di sempre.",
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DELL'EVENTO", 600, 280), alt: "Evento" },
      { type: "title", text: "Un evento speciale ti aspetta", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nAbbiamo organizzato una serata speciale da {{RESTAURANT_NAME}}: musica dal vivo, un menù dedicato e l'atmosfera che solo le grandi occasioni sanno regalare.\n\nI posti sono limitati: prenota il tuo tavolo prima che si riempia.",
      },
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "Novità in menù", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nAbbiamo rinnovato il nostro menù con nuovi piatti pensati per stupirti: ingredienti di stagione, ricette curate nei dettagli e qualche sorpresa che non ti aspetti.\n\nVieni a scoprirlo da {{RESTAURANT_NAME}}, prenota il tuo tavolo quando vuoi.",
      },
      { type: "image", imageUrl: placeholderImage("FOTO DEL PIATTO", 600, 360), alt: "Nuovo piatto" },
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "Buon compleanno, {{FIRSTNAME}}!", align: "center" },
      {
        type: "offer_box",
        title: "Un pensiero per te",
        body: "Per il tuo compleanno vogliamo festeggiare con te: vieni a trovarci questo mese da {{RESTAURANT_NAME}} e lasciati coccolare con un pensiero speciale offerto dalla casa.",
        badge: "Compleanno",
      },
      { type: "button_cta", label: "Prenota il tuo tavolo", url: "{{BOOKING_LINK}}", align: "center" },
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "La soluzione ideale per il pranzo di lavoro", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nTra una riunione e l'altra non hai tempo da perdere, ma non per questo devi rinunciare a un pranzo di qualità. La nostra formula pranzo è pensata apposta per te: servizio rapido, piatti curati e un ambiente giusto anche per un incontro di lavoro.\n\nPrenota il tuo tavolo e torna in ufficio soddisfatto.",
      },
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "Qualcosa di speciale per te", align: "center" },
      {
        type: "offer_box",
        title: "Riservato a te",
        body: "Come cliente {{LOYALTY_LEVEL}} di {{RESTAURANT_NAME}} meriti un'attenzione speciale: la prossima volta che vieni a trovarci, ti riserviamo una sorpresa pensata apposta per i nostri ospiti più fedeli.",
        badge: "VIP",
      },
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DELLA SERATA", 600, 280), alt: "Aperitivo" },
      { type: "title", text: "Ti aspettiamo per l'aperitivo", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nChe ne dici di un aperitivo diverso dal solito? Da {{RESTAURANT_NAME}} ti aspettano cocktail curati, stuzzichini sfiziosi e la compagnia giusta per iniziare bene la serata.\n\nPortati chi vuoi: da noi c'è sempre posto per un brindisi in più.",
      },
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
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "Ti aspettiamo da {{RESTAURANT_NAME}}", align: "center" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nAbbiamo pensato a un'occasione speciale per te da {{RESTAURANT_NAME}}. Prenota il tuo tavolo e vieni a scoprirla di persona.\n\n[Personalizza qui il messaggio con i dettagli della tua promozione]",
      },
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
