import { z } from "zod";

export type BlockAlign = "left" | "center" | "right";

/**
 * Lo stile di un blocco: **tutto opzionale, sempre**.
 *
 * Non è un capriccio di tipizzazione. Le campagne salvate prima dell'editor
 * visuale sono array di blocchi senza `style`: se un solo campo fosse
 * obbligatorio, `BlockSchema` le rifiuterebbe al primo PATCH e una bozza
 * aperta e richiusa diventerebbe non salvabile. Assente significa «usa il
 * valore predefinito del compilatore», che è esattamente ciò che quelle
 * campagne rendevano prima.
 *
 * Le misure sono numeri di pixel, non stringhe CSS: il compilatore le scrive
 * lui con l'unità giusta, e un numero non può portare dentro l'HTML finale un
 * `calc()` o una `var()` che nessun client email saprebbe leggere.
 */
export interface BlockStyle {
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  backgroundColor?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  align?: BlockAlign;
  borderRadius?: number;
  /** Percentuale della larghezza disponibile — immagini e pulsanti. */
  width?: number;
  buttonColor?: string;
  buttonTextColor?: string;
  /** Spaziatura *interna* del pulsante — distinta dal padding della cella che lo contiene. */
  buttonPaddingV?: number;
  buttonPaddingH?: number;
}

export interface LogoBlock {
  id: string;
  type: "logo";
  imageUrl: string;
  align: BlockAlign;
  style?: BlockStyle;
}

export interface HeroImageBlock {
  id: string;
  type: "hero_image";
  imageUrl: string;
  alt: string;
  style?: BlockStyle;
}

export interface TitleBlock {
  id: string;
  type: "title";
  text: string;
  align: BlockAlign;
  /** 1, 2 o 3 — il livello sceglie corpo e peso predefiniti, sovrascrivibili da `style`. */
  level?: 1 | 2 | 3;
  style?: BlockStyle;
}

/**
 * Il testo, in due forme.
 *
 * `text` è la forma storica: testo semplice, paragrafi separati da riga vuota,
 * sempre passato per l'escape. `html` è quella nuova, scritta dall'editor
 * in linea, e contiene **solo** i tag della lista bianca di
 * `campaign-rich-text.ts` — mai marcatura arbitraria.
 *
 * Quando `html` c'è vince lui; `text` resta sincronizzato come versione piana
 * dello stesso contenuto, così una campagna scritta con l'editor nuovo e
 * riaperta da codice vecchio mostra ancora qualcosa di sensato invece del
 * vuoto.
 */
export interface TextBlock {
  id: string;
  type: "text";
  text: string;
  html?: string;
  style?: BlockStyle;
}

export interface ButtonCtaBlock {
  id: string;
  type: "button_cta";
  label: string;
  url: string;
  align: BlockAlign;
  style?: BlockStyle;
}

export interface ImageBlock {
  id: string;
  type: "image";
  imageUrl: string;
  alt: string;
  linkUrl?: string;
  style?: BlockStyle;
}

export interface DividerBlock {
  id: string;
  type: "divider";
  style?: BlockStyle;
}

/** Aria verticale misurabile: senza, si finisce a usare paragrafi vuoti. */
export interface SpacerBlock {
  id: string;
  type: "spacer";
  height: number;
  style?: BlockStyle;
}

export interface OfferBoxBlock {
  id: string;
  type: "offer_box";
  title: string;
  body: string;
  badge?: string;
  style?: BlockStyle;
}

/** Blocchi ammessi dentro le colonne di una riga — niente nidificazione ulteriore. */
export type SimpleBlock = TextBlock | ImageBlock | ButtonCtaBlock;

/** Come `SimpleBlock`, più ciò che ha senso dentro una colonna stretta. */
export type ColumnChildBlock = SimpleBlock | TitleBlock | DividerBlock | SpacerBlock;

/**
 * La riga a due colonne della prima versione: una sola colonna a sinistra e
 * una a destra, metà e metà, senza modo di aggiungere elementi dentro.
 * Sostituita da `columns`, che fa tutto questo e di più — resta qui, e resta
 * renderizzata, perché le campagne che la contengono esistono già.
 */
export interface TwoColumnsBlock {
  id: string;
  type: "two_columns";
  left: SimpleBlock[];
  right: SimpleBlock[];
  style?: BlockStyle;
}

export type ColumnRatio = "50-50" | "30-70" | "70-30" | "33-33-33";

/** Le proporzioni di ogni riga, in percentuale — l'ordine è quello delle colonne. */
export const COLUMN_RATIO_WEIGHTS: Record<ColumnRatio, number[]> = {
  "50-50": [50, 50],
  "30-70": [30, 70],
  "70-30": [70, 30],
  "33-33-33": [34, 33, 33],
};

export interface ColumnsBlock {
  id: string;
  type: "columns";
  ratio: ColumnRatio;
  columns: ColumnChildBlock[][];
  style?: BlockStyle;
}

export interface SocialLinksBlock {
  id: string;
  type: "social_links";
  links: { platform: string; url: string }[];
  style?: BlockStyle;
}

/** Il coupon del locale: il codice è il protagonista, il resto lo incornicia. */
export interface CouponBlock {
  id: string;
  type: "coupon";
  code: string;
  title: string;
  description: string;
  expiry?: string;
  style?: BlockStyle;
}

export interface EventBlock {
  id: string;
  type: "event";
  title: string;
  dateLabel: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  style?: BlockStyle;
}

export interface ContactsBlock {
  id: string;
  type: "contacts";
  restaurantName: string;
  address: string;
  phone: string;
  hours: string;
  style?: BlockStyle;
}

export interface FooterBlock {
  id: string;
  type: "footer";
  text: string;
  style?: BlockStyle;
}

/**
 * Obbligatorio in ogni campagna marketing — non eliminabile dall'editor.
 *
 * Porta con sé le righe di legge del piè di pagina (chi scrive e da dove):
 * erano un blocco `footer` a parte che si poteva cancellare per sbaglio,
 * lasciando un'email conforme solo per metà.
 */
export interface UnsubscribeLinkBlock {
  id: string;
  type: "unsubscribe_link";
  text: string;
  restaurantName?: string;
  address?: string;
  theme?: "light" | "dark";
  style?: BlockStyle;
}

export type Block =
  | LogoBlock
  | HeroImageBlock
  | TitleBlock
  | TextBlock
  | ButtonCtaBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | OfferBoxBlock
  | TwoColumnsBlock
  | ColumnsBlock
  | SocialLinksBlock
  | CouponBlock
  | EventBlock
  | ContactsBlock
  | FooterBlock
  | UnsubscribeLinkBlock;

const Align = z.enum(["left", "center", "right"]);

const StyleSchema = z
  .object({
    paddingTop: z.number(),
    paddingRight: z.number(),
    paddingBottom: z.number(),
    paddingLeft: z.number(),
    backgroundColor: z.string(),
    color: z.string(),
    fontFamily: z.string(),
    fontSize: z.number(),
    fontWeight: z.number(),
    lineHeight: z.number(),
    letterSpacing: z.number(),
    align: Align,
    borderRadius: z.number(),
    width: z.number(),
    buttonColor: z.string(),
    buttonTextColor: z.string(),
    buttonPaddingV: z.number(),
    buttonPaddingH: z.number(),
  })
  .partial()
  .optional();

const TextBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  text: z.string(),
  html: z.string().optional(),
  style: StyleSchema,
});

const ImageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  imageUrl: z.string(),
  alt: z.string(),
  linkUrl: z.string().optional(),
  style: StyleSchema,
});

const ButtonCtaBlockSchema = z.object({
  id: z.string(),
  type: z.literal("button_cta"),
  label: z.string(),
  url: z.string(),
  align: Align,
  style: StyleSchema,
});

const TitleBlockSchema = z.object({
  id: z.string(),
  type: z.literal("title"),
  text: z.string(),
  align: Align,
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  style: StyleSchema,
});

const DividerBlockSchema = z.object({ id: z.string(), type: z.literal("divider"), style: StyleSchema });

const SpacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal("spacer"),
  height: z.number(),
  style: StyleSchema,
});

const SimpleBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  ButtonCtaBlockSchema,
]);

const ColumnChildSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  ButtonCtaBlockSchema,
  TitleBlockSchema,
  DividerBlockSchema,
  SpacerBlockSchema,
]);

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("logo"), imageUrl: z.string(), align: Align, style: StyleSchema }),
  z.object({
    id: z.string(),
    type: z.literal("hero_image"),
    imageUrl: z.string(),
    alt: z.string(),
    style: StyleSchema,
  }),
  TitleBlockSchema,
  TextBlockSchema,
  ButtonCtaBlockSchema,
  ImageBlockSchema,
  DividerBlockSchema,
  SpacerBlockSchema,
  z.object({
    id: z.string(),
    type: z.literal("offer_box"),
    title: z.string(),
    body: z.string(),
    badge: z.string().optional(),
    style: StyleSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("two_columns"),
    left: z.array(SimpleBlockSchema),
    right: z.array(SimpleBlockSchema),
    style: StyleSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("columns"),
    ratio: z.enum(["50-50", "30-70", "70-30", "33-33-33"]),
    columns: z.array(z.array(ColumnChildSchema)),
    style: StyleSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("social_links"),
    links: z.array(z.object({ platform: z.string(), url: z.string() })),
    style: StyleSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("coupon"),
    code: z.string(),
    title: z.string(),
    description: z.string(),
    expiry: z.string().optional(),
    style: StyleSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("event"),
    title: z.string(),
    dateLabel: z.string(),
    description: z.string(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
    style: StyleSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("contacts"),
    restaurantName: z.string(),
    address: z.string(),
    phone: z.string(),
    hours: z.string(),
    style: StyleSchema,
  }),
  z.object({ id: z.string(), type: z.literal("footer"), text: z.string(), style: StyleSchema }),
  z.object({
    id: z.string(),
    type: z.literal("unsubscribe_link"),
    text: z.string(),
    restaurantName: z.string().optional(),
    address: z.string().optional(),
    theme: z.enum(["light", "dark"]).optional(),
    style: StyleSchema,
  }),
]);

/* ------------------------------------------------------------------ *
 * Il documento email: impostazioni globali + blocchi
 * ------------------------------------------------------------------ */

/**
 * La spaziatura predefinita di ogni tipo di blocco: sopra, destra, sotto,
 * sinistra. Sta qui e non nel compilatore perché la usano in due — il
 * compilatore per l'email vera, il canvas dell'editor per mostrarla — e due
 * copie della stessa tabella divergono sempre, di solito il giorno in cui
 * qualcuno cambia solo una delle due.
 */
export const DEFAULT_BLOCK_PADDING: Record<Block["type"], [number, number, number, number]> = {
  logo: [20, 24, 8, 24],
  hero_image: [0, 0, 0, 0],
  title: [16, 24, 8, 24],
  text: [12, 24, 12, 24],
  button_cta: [12, 24, 12, 24],
  image: [12, 24, 12, 24],
  divider: [8, 24, 8, 24],
  spacer: [0, 0, 0, 0],
  offer_box: [12, 24, 12, 24],
  two_columns: [12, 24, 12, 24],
  columns: [8, 24, 8, 24],
  social_links: [12, 24, 12, 24],
  coupon: [12, 24, 12, 24],
  event: [12, 24, 12, 24],
  contacts: [12, 24, 12, 24],
  footer: [16, 24, 16, 24],
  unsubscribe_link: [18, 24, 22, 24],
};

export interface EmailSettings {
  /** Larghezza del foglio in pixel: 600 è lo standard storico, 680 il massimo prudente. */
  contentWidth: number;
  /** Il colore del foglio. */
  emailBackground: string;
  /** Il colore attorno al foglio, visibile nei client che mostrano un margine. */
  pageBackground: string;
  fontFamily: string;
  textColor: string;
  linkColor: string;
}

/**
 * I caratteri che un client email sa davvero disegnare.
 *
 * Non ci sono i font del prodotto (Inter, Fraunces): un webfont in un'email
 * non arriva su Outlook e arriva a metà altrove, e un'email che cambia faccia
 * a seconda di chi la apre è peggio di una scritta in Georgia ovunque.
 */
export const EMAIL_FONT_STACKS = [
  { id: "sans", label: "Lineare (Helvetica)", stack: "Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Con grazie (Georgia)", stack: "Georgia, 'Times New Roman', serif" },
  { id: "modern", label: "Moderno (Trebuchet)", stack: "'Trebuchet MS', Verdana, sans-serif" },
  { id: "classic", label: "Classico (Times)", stack: "'Times New Roman', Times, serif" },
] as const;

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  contentWidth: 600,
  emailBackground: "#ffffff",
  pageBackground: "#f4f1ea",
  fontFamily: EMAIL_FONT_STACKS[0].stack,
  textColor: "#2b2b2b",
  linkColor: "#74432d",
};

export interface EmailDocument {
  version: 2;
  settings: EmailSettings;
  blocks: Block[];
}

const EmailSettingsSchema = z.object({
  contentWidth: z.number().min(320).max(800),
  emailBackground: z.string(),
  pageBackground: z.string(),
  fontFamily: z.string(),
  textColor: z.string(),
  linkColor: z.string(),
});

export const EmailDocumentSchema = z.object({
  version: z.literal(2),
  settings: EmailSettingsSchema,
  blocks: z.array(BlockSchema),
});

/**
 * Ciò che può arrivare nel campo `contentBlocks`: il documento nuovo **oppure**
 * l'array piatto di prima. Le due forme convivono per sempre, non per una
 * finestra di migrazione: una bozza salvata a settembre non deve smettere di
 * aprirsi perché nel frattempo il formato è cresciuto.
 */
export const EmailContentSchema = z.union([EmailDocumentSchema, z.array(BlockSchema)]);
export type EmailContentInput = z.infer<typeof EmailContentSchema>;

/** Normalizza qualunque delle due forme (o niente) in un documento completo. */
export function parseEmailDocument(raw: unknown): EmailDocument {
  if (Array.isArray(raw)) {
    return { version: 2, settings: { ...DEFAULT_EMAIL_SETTINGS }, blocks: raw as Block[] };
  }
  if (raw && typeof raw === "object" && "blocks" in raw) {
    const doc = raw as Partial<EmailDocument>;
    return {
      version: 2,
      settings: { ...DEFAULT_EMAIL_SETTINGS, ...(doc.settings ?? {}) },
      blocks: doc.blocks ?? [],
    };
  }
  return { version: 2, settings: { ...DEFAULT_EMAIL_SETTINGS }, blocks: [] };
}

/** Omit distributivo: Omit<Block,"id"> semplice collassa all'intersezione dei membri
 * dell'union (solo "type"), perdendo i campi specifici di ogni variante. */
export type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export function hasUnsubscribeBlock(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === "unsubscribe_link");
}

export function withUnsubscribeBlock(blocks: Block[]): Block[] {
  if (hasUnsubscribeBlock(blocks)) return blocks;
  return [
    ...blocks,
    {
      id: `unsubscribe-${blocks.length}`,
      type: "unsubscribe_link",
      text: "Non vuoi più ricevere queste email? Disiscriviti",
    },
  ];
}

/** Blocchi puramente decorativi/di servizio: non contano come "contenuto reale" di un'email. */
const DECORATIVE_BLOCK_TYPES = new Set<Block["type"]>([
  "unsubscribe_link",
  "footer",
  "logo",
  "divider",
  "spacer",
]);

export function hasSubstantiveContent(blocks: Block[]): boolean {
  return blocks.some((b) => !DECORATIVE_BLOCK_TYPES.has(b.type));
}

/** Variabili di merge disponibili nell'editor — vedi campaign-blocks-compiler.ts per la risoluzione. */
export const CAMPAIGN_VARIABLES = [
  { token: "{{FIRSTNAME}}", label: "Nome", group: "Persona" },
  { token: "{{LASTNAME}}", label: "Cognome", group: "Persona" },
  { token: "{{LOYALTY_LEVEL}}", label: "Livello fedeltà", group: "Persona" },
  { token: "{{LAST_VISIT_DATE}}", label: "Data ultima visita", group: "Persona" },
  { token: "{{RESTAURANT_NAME}}", label: "Nome ristorante", group: "Ristorante" },
  { token: "{{RESTAURANT_ADDRESS}}", label: "Indirizzo", group: "Ristorante" },
  { token: "{{BOOKING_LINK}}", label: "Link prenotazione", group: "Prenotazioni" },
  { token: "{{UNSUBSCRIBE_LINK}}", label: "Link disiscrizione", group: "Altro" },
] as const;

/** L'ordine in cui i gruppi compaiono nel popover delle variabili. */
export const CAMPAIGN_VARIABLE_GROUPS = ["Persona", "Ristorante", "Prenotazioni", "Altro"] as const;
