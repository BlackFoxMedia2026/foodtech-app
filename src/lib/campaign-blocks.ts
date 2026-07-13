import { z } from "zod";

export type BlockAlign = "left" | "center" | "right";

export interface LogoBlock {
  id: string;
  type: "logo";
  imageUrl: string;
  align: BlockAlign;
}

export interface HeroImageBlock {
  id: string;
  type: "hero_image";
  imageUrl: string;
  alt: string;
}

export interface TitleBlock {
  id: string;
  type: "title";
  text: string;
  align: BlockAlign;
}

export interface TextBlock {
  id: string;
  type: "text";
  text: string;
}

export interface ButtonCtaBlock {
  id: string;
  type: "button_cta";
  label: string;
  url: string;
  align: BlockAlign;
}

export interface ImageBlock {
  id: string;
  type: "image";
  imageUrl: string;
  alt: string;
  linkUrl?: string;
}

export interface DividerBlock {
  id: string;
  type: "divider";
}

export interface OfferBoxBlock {
  id: string;
  type: "offer_box";
  title: string;
  body: string;
  badge?: string;
}

/** Blocchi ammessi dentro le colonne di un TwoColumnsBlock — niente nidificazione ulteriore. */
export type SimpleBlock = TextBlock | ImageBlock | ButtonCtaBlock;

export interface TwoColumnsBlock {
  id: string;
  type: "two_columns";
  left: SimpleBlock[];
  right: SimpleBlock[];
}

export interface SocialLinksBlock {
  id: string;
  type: "social_links";
  links: { platform: string; url: string }[];
}

export interface FooterBlock {
  id: string;
  type: "footer";
  text: string;
}

/** Obbligatorio in ogni campagna marketing — non eliminabile dall'editor. */
export interface UnsubscribeLinkBlock {
  id: string;
  type: "unsubscribe_link";
  text: string;
}

export type Block =
  | LogoBlock
  | HeroImageBlock
  | TitleBlock
  | TextBlock
  | ButtonCtaBlock
  | ImageBlock
  | DividerBlock
  | OfferBoxBlock
  | TwoColumnsBlock
  | SocialLinksBlock
  | FooterBlock
  | UnsubscribeLinkBlock;

const Align = z.enum(["left", "center", "right"]);

const TextBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  text: z.string(),
});

const ImageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  imageUrl: z.string(),
  alt: z.string(),
  linkUrl: z.string().optional(),
});

const ButtonCtaBlockSchema = z.object({
  id: z.string(),
  type: z.literal("button_cta"),
  label: z.string(),
  url: z.string(),
  align: Align,
});

const SimpleBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  ButtonCtaBlockSchema,
]);

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("logo"), imageUrl: z.string(), align: Align }),
  z.object({ id: z.string(), type: z.literal("hero_image"), imageUrl: z.string(), alt: z.string() }),
  z.object({ id: z.string(), type: z.literal("title"), text: z.string(), align: Align }),
  TextBlockSchema,
  ButtonCtaBlockSchema,
  ImageBlockSchema,
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({
    id: z.string(),
    type: z.literal("offer_box"),
    title: z.string(),
    body: z.string(),
    badge: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("two_columns"),
    left: z.array(SimpleBlockSchema),
    right: z.array(SimpleBlockSchema),
  }),
  z.object({
    id: z.string(),
    type: z.literal("social_links"),
    links: z.array(z.object({ platform: z.string(), url: z.string() })),
  }),
  z.object({ id: z.string(), type: z.literal("footer"), text: z.string() }),
  z.object({ id: z.string(), type: z.literal("unsubscribe_link"), text: z.string() }),
]);

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

/** Variabili di merge disponibili nell'editor — vedi campaign-blocks-compiler.ts per la risoluzione. */
export const CAMPAIGN_VARIABLES = [
  { token: "{{FIRSTNAME}}", label: "Nome" },
  { token: "{{LASTNAME}}", label: "Cognome" },
  { token: "{{RESTAURANT_NAME}}", label: "Nome ristorante" },
  { token: "{{BOOKING_LINK}}", label: "Link prenotazione" },
  { token: "{{UNSUBSCRIBE_LINK}}", label: "Link disiscrizione" },
  { token: "{{LAST_VISIT_DATE}}", label: "Data ultima visita" },
  { token: "{{LOYALTY_LEVEL}}", label: "Livello fedeltà" },
] as const;
