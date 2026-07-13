import type { SegmentFilterType } from "@/server/campaigns";

export interface CampaignObjective {
  id: string;
  label: string;
  description: string;
  icon: "UserX" | "PartyPopper" | "CalendarClock" | "UtensilsCrossed" | "Cake" | "Crown" | "Star" | "Briefcase" | "Wine" | "Sparkles" | "Wand2";
  suggestedSegment: Partial<SegmentFilterType>;
  suggestedSubject: string;
  suggestedTemplateId?: string;
}

/**
 * Solo gli obiettivi con un segnale reale nello schema hanno un segmento
 * suggerito non vuoto (es. VIP → loyaltyTier, compleanni → birthdayThisMonth).
 * Per gli altri (evento, nuovo menù, aperitivo, degustazione, pranzo di lavoro,
 * giorno debole, campagna personalizzata) NON esiste un dato che permetta di
 * indovinare un target sensato — il segmento resta vuoto e il ristoratore lo
 * imposta liberamente nello Step 2. Non è un bug, è onestà sui dati disponibili.
 */
export const CAMPAIGN_OBJECTIVES: CampaignObjective[] = [
  {
    id: "win_back",
    label: "Recupera clienti inattivi",
    description: "Raggiungi chi non prenota da tempo e invitalo a tornare.",
    icon: "UserX",
    suggestedSegment: { inactiveDays: 60 },
    suggestedSubject: "Ci manchi al tavolo",
    suggestedTemplateId: "win_back",
  },
  {
    id: "event",
    label: "Promuovi un evento",
    description: "Annuncia una serata speciale o un evento in programma.",
    icon: "PartyPopper",
    suggestedSegment: {},
    suggestedSubject: "Un evento speciale ti aspetta",
    suggestedTemplateId: "event_announcement",
  },
  {
    id: "fill_slow_day",
    label: "Riempi un giorno debole",
    description: "Incentiva le prenotazioni nei giorni con meno affluenza.",
    icon: "CalendarClock",
    suggestedSegment: {},
    suggestedSubject: "Questa settimana ti aspettiamo",
  },
  {
    id: "new_menu",
    label: "Comunica un nuovo menù",
    description: "Racconta le novità del menù ai tuoi clienti.",
    icon: "UtensilsCrossed",
    suggestedSegment: {},
    suggestedSubject: "Novità in menù",
    suggestedTemplateId: "new_menu",
  },
  {
    id: "birthday_month",
    label: "Compleanni del mese",
    description: "Fai gli auguri a chi festeggia questo mese.",
    icon: "Cake",
    suggestedSegment: { birthdayThisMonth: true },
    suggestedSubject: "Buon compleanno da parte nostra",
    suggestedTemplateId: "birthday",
  },
  {
    id: "vip",
    label: "Clienti VIP",
    description: "Un messaggio dedicato ai tuoi clienti più fedeli.",
    icon: "Crown",
    suggestedSegment: { loyaltyTier: "VIP" },
    suggestedSubject: "Qualcosa di speciale per te",
  },
  {
    id: "review_request",
    label: "Richiedi recensioni",
    description: "Chiedi un feedback a chi ti ha già visitato.",
    icon: "Star",
    suggestedSegment: { minTotalVisits: 1 },
    suggestedSubject: "Com'è andata la tua ultima visita?",
    suggestedTemplateId: "review_request",
  },
  {
    id: "business_lunch",
    label: "Pranzo di lavoro",
    description: "Promuovi la formula pranzo per il pubblico business.",
    icon: "Briefcase",
    suggestedSegment: {},
    suggestedSubject: "La soluzione ideale per il pranzo di lavoro",
    suggestedTemplateId: "business_lunch",
  },
  {
    id: "aperitivo",
    label: "Aperitivo / serata speciale",
    description: "Invita i clienti a una serata o un aperitivo speciale.",
    icon: "Wine",
    suggestedSegment: {},
    suggestedSubject: "Ti aspettiamo per l'aperitivo",
  },
  {
    id: "tasting_menu",
    label: "Degustazione / menu fisso",
    description: "Promuovi un percorso degustazione o un menu fisso.",
    icon: "Sparkles",
    suggestedSegment: {},
    suggestedSubject: "Un percorso di degustazione da provare",
  },
  {
    id: "custom",
    label: "Campagna personalizzata",
    description: "Parti da zero e costruisci la campagna come preferisci.",
    icon: "Wand2",
    suggestedSegment: {},
    suggestedSubject: "",
  },
];

export function getCampaignObjective(id: string | null): CampaignObjective | undefined {
  return CAMPAIGN_OBJECTIVES.find((o) => o.id === id);
}
