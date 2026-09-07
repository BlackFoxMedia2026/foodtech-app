import { CalendarRange, CreditCard, LayoutDashboard, LineChart, ListOrdered, Megaphone, Radio, Settings, Sparkles, UserRound, UtensilsCrossed } from "lucide-react";
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
  { href: "/service", label: "Servizio", shortLabel: "Ora", icon: Radio },
  { href: "/bookings", label: "Prenotazioni", shortLabel: "Prenota", icon: CalendarRange },
  { href: "/floor", label: "Sala", shortLabel: "Sala", icon: DiningTableIcon },
  { href: "/waitlist", label: "Attesa", shortLabel: "Attesa", icon: ListOrdered },
  { href: "/guests", label: "Ospiti", shortLabel: "Ospiti", icon: TuxedoGuestIcon },
];

export const SECONDARY_NAV: NavItem[] = [
  // I camerieri si configurano prima del servizio, non durante: da qui in poi
  // e' lavoro da ufficio, e la barra ha spazio per sei voci, non per sette.
  { href: "/waiters", label: "Camerieri", icon: UserRound },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
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
  PRIMARY_NAV[1], // Servizio — durante il servizio è la schermata madre
  PRIMARY_NAV[3], // Sala
  PRIMARY_NAV[4], // Attesa
];

export function isNavActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;
}
