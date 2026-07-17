import type { Block, SimpleBlock } from "./campaign-blocks";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function alignStyle(align: "left" | "center" | "right"): string {
  return `text-align:${align};`;
}

const DEFAULT_ACCENT_COLOR = "#c9a25a";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6,8}$/;

/** Colore d'accento del brand del locale (Impostazioni → Brand) per bottoni e badge; ricade sul gold neutro se non impostato o non valido. */
function resolveAccentColor(accentColor?: string): string {
  return accentColor && HEX_COLOR_RE.test(accentColor) ? accentColor : DEFAULT_ACCENT_COLOR;
}

function renderSimpleBlock(block: SimpleBlock, accentColor: string): string {
  switch (block.type) {
    case "text":
      return `<tr><td style="padding:12px 24px;font-size:15px;line-height:1.5;color:#2b2b2b;">${escapeHtml(
        block.text
      )
        .split("\n\n")
        .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br/>")}</p>`)
        .join("")}</td></tr>`;
    case "image":
      return `<tr><td style="padding:12px 24px;">${
        block.linkUrl ? `<a href="${escapeHtml(block.linkUrl)}">` : ""
      }<img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(
        block.alt
      )}" width="100%" style="display:block;max-width:100%;border:0;" />${
        block.linkUrl ? "</a>" : ""
      }</td></tr>`;
    case "button_cta":
      return `<tr><td style="padding:12px 24px;${alignStyle(block.align)}"><a href="${escapeHtml(
        block.url
      )}" style="display:inline-block;background:${accentColor};color:#ffffff;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">${escapeHtml(
        block.label
      )}</a></td></tr>`;
  }
}

function renderBlock(block: Block, accentColor: string): string {
  switch (block.type) {
    case "logo":
      return `<tr><td style="padding:20px 24px 8px 24px;${alignStyle(
        block.align
      )}"><img src="${escapeHtml(block.imageUrl)}" alt="Logo" height="48" style="display:inline-block;" /></td></tr>`;
    case "hero_image":
      return `<tr><td style="padding:0;"><img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(
        block.alt
      )}" width="100%" style="display:block;max-width:100%;border:0;" /></td></tr>`;
    case "title":
      return `<tr><td style="padding:16px 24px 8px 24px;${alignStyle(
        block.align
      )}"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#1a1a1a;">${escapeHtml(
        block.text
      )}</h1></td></tr>`;
    case "text":
    case "image":
    case "button_cta":
      return renderSimpleBlock(block, accentColor);
    case "divider":
      return `<tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" /></td></tr>`;
    case "offer_box":
      return `<tr><td style="padding:12px 24px;"><table role="presentation" width="100%" style="background:#f7f1e6;border-radius:8px;"><tr><td style="padding:16px;">${
        block.badge
          ? `<span style="display:inline-block;background:${accentColor};color:#ffffff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:8px;">${escapeHtml(
              block.badge
            )}</span><br/>`
          : ""
      }<strong style="font-size:17px;color:#1a1a1a;">${escapeHtml(
        block.title
      )}</strong><p style="margin:8px 0 0 0;font-size:14px;color:#333;">${escapeHtml(
        block.body
      )}</p></td></tr></table></td></tr>`;
    case "two_columns":
      return `<tr><td style="padding:12px 24px;"><table role="presentation" width="100%"><tr><td width="50%" valign="top" style="padding-right:8px;"><table role="presentation" width="100%">${block.left
        .map((b) => renderSimpleBlock(b, accentColor))
        .join("")}</table></td><td width="50%" valign="top" style="padding-left:8px;"><table role="presentation" width="100%">${block.right
        .map((b) => renderSimpleBlock(b, accentColor))
        .join("")}</table></td></tr></table></td></tr>`;
    case "social_links":
      return `<tr><td style="padding:12px 24px;text-align:center;">${block.links
        .map(
          (l) =>
            `<a href="${escapeHtml(l.url)}" style="margin:0 6px;color:#6b6b6b;text-decoration:underline;">${escapeHtml(
              l.platform
            )}</a>`
        )
        .join("")}</td></tr>`;
    case "footer":
      return `<tr><td style="padding:16px 24px;text-align:center;font-size:12px;color:#8a8a8a;">${escapeHtml(
        block.text
      )}</td></tr>`;
    case "unsubscribe_link":
      return `<tr><td style="padding:8px 24px 20px 24px;text-align:center;font-size:12px;color:#8a8a8a;"><a href="{{UNSUBSCRIBE_LINK}}" style="color:#8a8a8a;">${escapeHtml(
        block.text
      )}</a></td></tr>`;
  }
}

/**
 * Compila i blocchi in HTML "email-safe" (tabelle + stili inline — i client email
 * ignorano classi CSS esterne). I token variabile restano placeholder letterali:
 * la risoluzione è un passo separato, vedi resolveGlobalVariables/resolveAllVariables/toBrevoMergeTags.
 * `accentColor` è il colore principale del brand (Impostazioni → Brand): usato per
 * bottoni e badge, ricade su un gold neutro se il locale non l'ha ancora impostato.
 */
export function compileBlocksToHtml(blocks: Block[], accentColor?: string): string {
  const resolvedAccent = resolveAccentColor(accentColor);
  const rows = blocks.map((b) => renderBlock(b, resolvedAccent)).join("");
  return `<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-collapse:collapse;">${rows}</table>`;
}

function substituteTokens(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [token, value] of Object.entries(vars)) {
    result = result.split(token).join(value);
  }
  return result;
}

/** Token validi per ogni campagna, indipendenti dal destinatario — risolti server-side prima dell'invio. */
export function resolveGlobalVariables(
  html: string,
  vars: { restaurantName: string; bookingLink: string }
): string {
  return substituteTokens(html, {
    "{{RESTAURANT_NAME}}": vars.restaurantName,
    "{{BOOKING_LINK}}": vars.bookingLink,
  });
}

/** Usato solo per l'invio di test: risolve TUTTI i token con dati di esempio realistici. */
export function resolveTestVariables(
  html: string,
  vars: {
    firstName: string;
    lastName: string;
    restaurantName: string;
    bookingLink: string;
    unsubscribeLink: string;
    lastVisitDate: string;
    loyaltyLevel: string;
  }
): string {
  return substituteTokens(html, {
    "{{FIRSTNAME}}": vars.firstName,
    "{{LASTNAME}}": vars.lastName,
    "{{RESTAURANT_NAME}}": vars.restaurantName,
    "{{BOOKING_LINK}}": vars.bookingLink,
    "{{UNSUBSCRIBE_LINK}}": vars.unsubscribeLink,
    "{{LAST_VISIT_DATE}}": vars.lastVisitDate,
    "{{LOYALTY_LEVEL}}": vars.loyaltyLevel,
  });
}

/**
 * Mappa i token per-destinatario rimanenti alla sintassi di merge-tag reale di Brevo,
 * da usare SOLO sull'HTML inviato a adapter.createCampaign (mai su test-send, che
 * risolve tutto localmente). FIRSTNAME/LASTNAME/UNSUB_TOKEN sono già sincronizzati
 * come attributi contatto in brevo-adapter.ts#createContact; LOYALTY_LEVEL/
 * LAST_VISIT_DATE richiedono di estendere createContact/syncContact con quegli
 * attributi custom prima che questa mappatura risolva davvero qualcosa per loro
 * in un invio reale.
 * Il link di disiscrizione punta al nostro endpoint /api/unsubscribe (non al tag
 * di sistema {{ unsubscribe }} di Brevo): usa il token per-contatto UNSUB_TOKEN,
 * risolto da Brevo stesso come qualsiasi altro merge tag al momento dell'invio.
 * NOTA: verificare la sintassi esatta dei merge tag Brevo (contact.FIRSTNAME vs altra
 * convenzione) prima del go-live.
 */
export function toBrevoMergeTags(html: string, origin: string): string {
  return substituteTokens(html, {
    "{{FIRSTNAME}}": "{{ contact.FIRSTNAME }}",
    "{{LASTNAME}}": "{{ contact.LASTNAME }}",
    "{{LOYALTY_LEVEL}}": "{{ contact.LOYALTY_LEVEL }}",
    "{{LAST_VISIT_DATE}}": "{{ contact.LAST_VISIT_DATE }}",
    "{{UNSUBSCRIBE_LINK}}": `${origin}/api/unsubscribe?token={{ contact.UNSUB_TOKEN }}`,
  });
}
