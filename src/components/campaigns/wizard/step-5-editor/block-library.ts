import {
  CalendarDays,
  Clock3,
  Heading,
  Image as ImageIcon,
  Link2,
  Minus,
  MousePointerClick,
  MoveVertical,
  Sparkles,
  Square,
  Tag,
  Ticket,
  Type,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Block, ColumnRatio } from "@/lib/campaign-blocks";
import { newId } from "@/lib/campaign-document-ops";

/** Ciò che il CRM sa già del locale e che un blocco può presentare senza chiederlo. */
export interface BlockDefaults {
  brandLogoUrl: string;
  restaurantName: string;
  address: string;
  phone: string;
}

export interface LibraryItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: "base" | "ristorante";
  create: (defaults: BlockDefaults) => Block;
}

/**
 * La libreria degli elementi.
 *
 * I blocchi del gruppo «ristorante» non sono tipi nuovi per il gusto di
 * esserlo: sono i pochi casi in cui il CRM conosce già il contenuto (indirizzo,
 * telefono, link di prenotazione) e può metterlo lui invece di farlo ribattere.
 * «Prenota un tavolo» non è un tipo a parte — è un pulsante col link giusto già
 * dentro, che è tutto ciò che serve.
 */
export const LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: "title",
    label: "Titolo",
    icon: Heading,
    group: "base",
    create: () => ({ id: newId(), type: "title", text: "Scrivi qui il titolo", align: "center", level: 1 }),
  },
  {
    id: "text",
    label: "Testo",
    icon: Type,
    group: "base",
    create: () => ({
      id: newId(),
      type: "text",
      text: "Scrivi qui il testo del messaggio.",
      html: "<p>Scrivi qui il testo del messaggio.</p>",
    }),
  },
  {
    id: "image",
    label: "Immagine",
    icon: ImageIcon,
    group: "base",
    create: () => ({ id: newId(), type: "image", imageUrl: "", alt: "" }),
  },
  {
    id: "button_cta",
    label: "Pulsante",
    icon: MousePointerClick,
    group: "base",
    create: () => ({ id: newId(), type: "button_cta", label: "Scopri di più", url: "", align: "center" }),
  },
  {
    id: "divider",
    label: "Divisore",
    icon: Minus,
    group: "base",
    create: () => ({ id: newId(), type: "divider" }),
  },
  {
    id: "spacer",
    label: "Spazio",
    icon: MoveVertical,
    group: "base",
    create: () => ({ id: newId(), type: "spacer", height: 24 }),
  },
  {
    id: "logo",
    label: "Logo",
    icon: Square,
    group: "base",
    create: (d) => ({ id: newId(), type: "logo", imageUrl: d.brandLogoUrl, align: "center" }),
  },
  {
    id: "social_links",
    label: "Social",
    icon: Link2,
    group: "base",
    create: () => ({
      id: newId(),
      type: "social_links",
      links: [
        { platform: "Instagram", url: "" },
        { platform: "Facebook", url: "" },
      ],
    }),
  },
  {
    id: "booking",
    label: "Prenota",
    icon: Utensils,
    group: "ristorante",
    create: () => ({
      id: newId(),
      type: "button_cta",
      label: "Prenota un tavolo",
      url: "{{BOOKING_LINK}}",
      align: "center",
    }),
  },
  {
    id: "coupon",
    label: "Coupon",
    icon: Ticket,
    group: "ristorante",
    create: () => ({
      id: newId(),
      type: "coupon",
      code: "CODICE",
      title: "Un regalo per te",
      description: "Mostra questo codice al tavolo per usufruire dell'offerta.",
    }),
  },
  {
    id: "event",
    label: "Evento",
    icon: CalendarDays,
    group: "ristorante",
    create: () => ({
      id: newId(),
      type: "event",
      title: "Una serata speciale",
      dateLabel: "Venerdì 24, ore 20:00",
      description: "Racconta qui che cosa succede e perché vale la pena esserci.",
      ctaLabel: "Prenota il tuo posto",
      ctaUrl: "{{BOOKING_LINK}}",
    }),
  },
  {
    id: "contacts",
    label: "Contatti",
    icon: Clock3,
    group: "ristorante",
    create: (d) => ({
      id: newId(),
      type: "contacts",
      restaurantName: d.restaurantName || "{{RESTAURANT_NAME}}",
      address: d.address,
      phone: d.phone,
      hours: "Aperto da martedì a domenica, 12:00–15:00 e 19:00–23:30",
    }),
  },
  {
    id: "offer_box",
    label: "Offerta",
    icon: Tag,
    group: "ristorante",
    create: () => ({
      id: newId(),
      type: "offer_box",
      title: "Offerta",
      body: "Descrivi qui l'offerta.",
      badge: "Novità",
    }),
  },
];

export const LIBRARY_BY_ID = new Map(LIBRARY_ITEMS.map((i) => [i.id, i]));

export interface StructureItem {
  ratio: ColumnRatio;
  label: string;
  /** Le larghezze relative dei riquadrini nell'icona della riga. */
  weights: number[];
}

/** Le righe della linguetta «Struttura». I nomi sono quelli che userebbe chi guarda, non quelli del CSS. */
export const STRUCTURE_ITEMS: StructureItem[] = [
  { ratio: "50-50", label: "Metà e metà", weights: [1, 1] },
  { ratio: "30-70", label: "Stretta e larga", weights: [3, 7] },
  { ratio: "70-30", label: "Larga e stretta", weights: [7, 3] },
  { ratio: "33-33-33", label: "Tre colonne", weights: [1, 1, 1] },
];

/** L'etichetta con cui un blocco si presenta nell'intestazione del pannello proprietà. */
export const BLOCK_TYPE_LABELS: Record<Block["type"], string> = {
  logo: "Logo",
  hero_image: "Immagine di testa",
  title: "Titolo",
  text: "Testo",
  button_cta: "Pulsante",
  image: "Immagine",
  divider: "Divisore",
  spacer: "Spazio",
  offer_box: "Offerta",
  two_columns: "Due colonne",
  columns: "Riga a colonne",
  social_links: "Social",
  coupon: "Coupon",
  event: "Evento",
  contacts: "Contatti e orari",
  footer: "Piè di pagina",
  unsubscribe_link: "Piè di pagina",
};
