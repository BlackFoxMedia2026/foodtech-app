import type { Block } from "@/lib/campaign-blocks";

export type AddableBlockType = Exclude<Block["type"], "unsubscribe_link">;

export const ADDABLE_BLOCK_LABELS: Record<AddableBlockType, string> = {
  logo: "Logo",
  hero_image: "Immagine hero",
  title: "Titolo",
  text: "Testo",
  button_cta: "Bottone CTA",
  image: "Immagine",
  divider: "Divisore",
  offer_box: "Box offerta",
  two_columns: "Due colonne",
  social_links: "Social links",
  footer: "Footer",
};

export function createDefaultBlock(type: AddableBlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case "logo":
      return { id, type, imageUrl: "", align: "center" };
    case "hero_image":
      return { id, type, imageUrl: "", alt: "" };
    case "title":
      return { id, type, text: "Titolo", align: "center" };
    case "text":
      return { id, type, text: "Scrivi qui il testo del messaggio." };
    case "button_cta":
      return { id, type, label: "Prenota ora", url: "{{BOOKING_LINK}}", align: "center" };
    case "image":
      return { id, type, imageUrl: "", alt: "" };
    case "divider":
      return { id, type };
    case "offer_box":
      return { id, type, title: "Offerta", body: "Descrivi qui l'offerta." };
    case "two_columns":
      return {
        id,
        type,
        left: [{ id: crypto.randomUUID(), type: "text", text: "Colonna sinistra" }],
        right: [{ id: crypto.randomUUID(), type: "text", text: "Colonna destra" }],
      };
    case "social_links":
      return { id, type, links: [{ platform: "Instagram", url: "" }] };
    case "footer":
      return { id, type, text: "© Il tuo ristorante" };
  }
}
