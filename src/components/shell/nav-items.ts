import { CalendarRange, CreditCard, LayoutDashboard, LineChart, ListOrdered, Megaphone, Settings, Sparkles, UserRound } from "lucide-react";
import { DiningTableIcon, TuxedoGuestIcon } from "@/components/shell/nav-icons";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Etichetta corta per la barra in basso su telefono, dove lo spazio è quello che è. */
  shortLabel?: string;
  /** Percorsi aggiuntivi che contano come "attivo" anche se l'href non corrisponde
   * — es. Marketing resta evidenziata dentro /campaigns/*, rimasto al suo path per
   * non rompere il wizard esistente. */
  matchPrefixes?: string[];
};

/**
 * Le voci in due gruppi, e il criterio è una domanda sola: **serve mentre il
 * servizio è aperto?**
 *
 * Le prime sei sono i gesti di una serata: guardare la giornata, vedere chi
 * viene, sistemare la sala, gestire chi aspetta, sapere chi è in turno,
 * cercare un cliente. Le altre sono lavoro da ufficio, che si fa la mattina
 * dopo — e stanno sotto «Altro».
 *
 * Non è solo una questione di gusto: con dieci voci tutte in fila la barra non
 * ci stava più nemmeno a 1440 px, e «Analytics» finiva tagliata sotto la sfera
 * dell'agente.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/overview", label: "Panoramica", shortLabel: "Oggi", icon: LayoutDashboard },
  { href: "/bookings", label: "Prenotazioni", shortLabel: "Prenota", icon: CalendarRange },
  { href: "/floor", label: "Sala", shortLabel: "Sala", icon: DiningTableIcon },
  { href: "/waitlist", label: "Attesa", shortLabel: "Attesa", icon: ListOrdered },
  { href: "/waiters", label: "Camerieri", shortLabel: "Team", icon: UserRound },
  { href: "/guests", label: "Ospiti", shortLabel: "Ospiti", icon: TuxedoGuestIcon },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/experiences", label: "Esperienze", icon: Sparkles },
  { href: "/marketing", label: "Marketing", icon: Megaphone, matchPrefixes: ["/campaigns"] },
  { href: "/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/insights", label: "Analytics", icon: LineChart },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

/** Le quattro voci della barra in basso su telefono: la quarta è «Altro». */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0], // Oggi
  PRIMARY_NAV[2], // Sala
  PRIMARY_NAV[3], // Attesa
  PRIMARY_NAV[5], // Ospiti
];

export function isNavActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;
}
