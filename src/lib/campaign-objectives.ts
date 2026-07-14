import type { SegmentFilterType } from "@/server/campaigns";

export interface CampaignObjective {
  id: string;
  label: string;
  description: string;
  icon: "UserX" | "PartyPopper" | "Cake" | "Crown" | "Star" | "Wand2";
  suggestedSegment: Partial<SegmentFilterType>;
  suggestedSubject: string;
  suggestedTemplateId?: string;
}

/**
 * Solo gli obiettivi con un segnale reale nello schema hanno un segmento
 * suggerito non vuoto (es. VIP → loyaltyTier, compleanni → birthdayThisMonth).
 * Per gli altri (evento, campagna personalizzata) NON esiste un dato che
 * permetta di indovinare un target sensato — il segmento resta vuoto e il
 * ristoratore lo imposta liberamente nello Step 2. Non è un bug, è onestà
 * sui dati disponibili.
 *
 * Lista volutamente limitata a 6 voci (max consigliato per non confondere un
 * utente non tecnico): i template rimossi da qui (giorno debole, nuovo menù,
 * pranzo di lavoro, aperitivo, degustazione) restano comunque selezionabili
 * in Step 3 tramite "Vedi tutti i template".
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
