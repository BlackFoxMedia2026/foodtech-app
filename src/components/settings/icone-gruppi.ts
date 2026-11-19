import {
  BadgeEuro,
  Building2,
  CalendarClock,
  CalendarCheck,
  Code,
  CreditCard,
  FileSpreadsheet,
  Gift,
  Globe,
  Inbox,
  KeyRound,
  LayoutGrid,
  ListChecks,
  MailCheck,
  MessageSquareText,
  Palette,
  PhoneCall,
  PiggyBank,
  Plug,
  Send,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Star,
  ThumbsUp,
  UserPlus,
  Users,
  Wallet,
  Wifi,
  type LucideIcon,
} from "lucide-react";

/**
 * L'icona di ogni gruppo delle Impostazioni, per titolo (19 nov 2026).
 *
 * Le pagine erano «tutto testo»: titolo, frase, righe di nomi e frasi. Una
 * cupola per gruppo dà a ogni scheda un segno che si riconosce scorrendo,
 * senza leggere. Si sceglie dal titolo e non con una prop, così ogni gruppo
 * — anche quelli dentro i componenti delle singole impostazioni — la prende
 * da solo. Un titolo nuovo che non è qui prende i cursori delle Impostazioni.
 */
const ICONE: Record<string, LucideIcon> = {
  Brand: Palette,
  "Locali del gruppo": Building2,
  "Organizzazione del servizio": LayoutGrid,
  "Turni di servizio": CalendarClock,
  "Quando si prenota dal sito": Globe,
  "Prenotazioni nel tuo calendario": CalendarCheck,
  Caparra: Wallet,
  "Messaggi via SMS": MessageSquareText,
  "Widget di prenotazione": Code,
  "Valore di un cliente": BadgeEuro,
  "Recensioni pubbliche": Star,
  "Raccolta punti": Gift,
  "Portale Wi-Fi": Wifi,
  "Porta dentro i tuoi clienti": FileSpreadsheet,
  "Il collegamento": PhoneCall,
  "Cosa è acceso": ListChecks,
  "Cosa rispondere": MessageSquareText,
  "Piano DEM": PiggyBank,
  "Dominio di invio": Send,
  Reputazione: ThumbsUp,
  "Accesso in due passi": ShieldCheck,
  "Il tuo accesso": Smartphone,
  "Chi ha accesso": Users,
  Pagamenti: CreditCard,
  Integrazioni: Plug,
  "Servizi della piattaforma": ServerCog,
  "Invii in corso": Inbox,
  "Clienti nuovi": UserPlus,
  "Già in rubrica": MailCheck,
  "Righe nel file": FileSpreadsheet,
  Prenotazioni: CalendarClock,
  Chiavi: KeyRound,
};

export function iconaGruppo(titolo: string): LucideIcon {
  return ICONE[titolo] ?? SlidersHorizontal;
}
