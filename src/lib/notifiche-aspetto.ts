import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CalendarX,
  ChefHat,
  Clock,
  CreditCard,
  FileWarning,
  Gift,
  Mail,
  MessageCircle,
  PartyPopper,
  PhoneMissed,
  Star,
  UserRound,
  Wifi,
  type LucideIcon,
} from "lucide-react";

/**
 * Come si presenta una notifica, nella campanella e nella pagina: un'icona e
 * un tono per tipo (19 nov 2026). Solo verde e oro: «oro» è ciò che chiede
 * attenzione, «verde» una buona notizia, «neutro» il resto.
 */
export type TonoNotifica = "verde" | "oro" | "neutro";

const ASPETTO: Record<string, { icona: LucideIcon; tono: TonoNotifica; gruppo: string }> = {
  BOOKING_CREATED: { icona: CalendarCheck2, tono: "verde", gruppo: "Prenotazioni" },
  BOOKING_CANCELLED: { icona: CalendarX, tono: "oro", gruppo: "Prenotazioni" },
  WAITLIST_ACCEPTED: { icona: Clock, tono: "verde", gruppo: "Prenotazioni" },
  EVENT_REQUEST: { icona: PartyPopper, tono: "oro", gruppo: "Prenotazioni" },
  VIP_UNASSIGNED: { icona: Star, tono: "oro", gruppo: "Prenotazioni" },
  MISSED_CALL: { icona: PhoneMissed, tono: "oro", gruppo: "Prenotazioni" },
  NPS_DETRACTOR: { icona: AlertTriangle, tono: "oro", gruppo: "Ospiti" },
  REVIEW_RECEIVED: { icona: Star, tono: "verde", gruppo: "Ospiti" },
  CHAT_HANDOFF: { icona: MessageCircle, tono: "oro", gruppo: "Ospiti" },
  WIFI_LEAD: { icona: Wifi, tono: "verde", gruppo: "Ospiti" },
  GIFT_CARD_REDEEMED: { icona: Gift, tono: "verde", gruppo: "Incassi" },
  TABLE_PAYMENT: { icona: CreditCard, tono: "verde", gruppo: "Incassi" },
  TABLE_SETTLED: { icona: CreditCard, tono: "verde", gruppo: "Incassi" },
  PAYMENT_REFUND: { icona: CreditCard, tono: "oro", gruppo: "Incassi" },
  COMANDA_PRONTA: { icona: ChefHat, tono: "verde", gruppo: "Sala" },
  COMANDA_PRESA_IN_CARICO: { icona: ChefHat, tono: "neutro", gruppo: "Sala" },
  COMANDA_MODIFICATA: { icona: ChefHat, tono: "oro", gruppo: "Sala" },
  TAVOLO_ASSEGNATO: { icona: UserRound, tono: "neutro", gruppo: "Sala" },
  TURNO_IMMINENTE: { icona: Clock, tono: "neutro", gruppo: "Staff" },
  STAFF_CONTRACT_EXPIRING: { icona: FileWarning, tono: "oro", gruppo: "Staff" },
  STAFF_CONTRACT_EXPIRED: { icona: FileWarning, tono: "oro", gruppo: "Staff" },
  DEM_CAMPAIGN_SENT: { icona: Mail, tono: "verde", gruppo: "Marketing" },
  DEM_DOMAIN_VERIFIED: { icona: Mail, tono: "verde", gruppo: "Marketing" },
  DEM_QUOTA_WARNING: { icona: Mail, tono: "oro", gruppo: "Marketing" },
  DEM_QUOTA_NEAR_LIMIT: { icona: Mail, tono: "oro", gruppo: "Marketing" },
  DEM_QUOTA_EXHAUSTED: { icona: Mail, tono: "oro", gruppo: "Marketing" },
  DEM_DOMAIN_PROBLEM: { icona: Mail, tono: "oro", gruppo: "Marketing" },
  DEM_SENDING_PAUSED: { icona: Mail, tono: "oro", gruppo: "Marketing" },
  DEM_PAYMENT_FAILED: { icona: CreditCard, tono: "oro", gruppo: "Marketing" },
  AUTOMATION_FAILED: { icona: AlertTriangle, tono: "oro", gruppo: "Marketing" },
};

export function aspettoNotifica(kind: string | null | undefined) {
  return ASPETTO[kind ?? ""] ?? { icona: Bell, tono: "neutro" as TonoNotifica, gruppo: "Sistema" };
}

export const TINTA_TONO: Record<TonoNotifica, string> = {
  verde: "bg-sage-strong/15 text-sage-strong",
  oro: "bg-accent-strong/15 text-accent-strong",
  neutro: "bg-border/60 text-muted-foreground",
};

/** «adesso», «12 min fa», «3 ore fa», «ieri», «12 nov». */
export function quandoNotifica(iso: string, adesso: Date = new Date()): string {
  const t = new Date(iso);
  const min = Math.round((adesso.getTime() - t.getTime()) / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"} fa`;
  if (ore < 48) return "ieri";
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(t);
}
