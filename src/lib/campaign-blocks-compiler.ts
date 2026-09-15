import {
  COLUMN_RATIO_WEIGHTS,
  DEFAULT_BLOCK_PADDING,
  DEFAULT_EMAIL_SETTINGS,
  parseEmailDocument,
  type Block,
  type BlockStyle,
  type ColumnChildBlock,
  type EmailDocument,
  type EmailSettings,
  type SimpleBlock,
} from "./campaign-blocks";
import { escapeHtml, plainTextToRichHtml, sanitizeRichText } from "./campaign-rich-text";

function alignStyle(align: "left" | "center" | "right"): string {
  return `text-align:${align};`;
}

const DEFAULT_ACCENT_COLOR = "#c9a25a";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6,8}$/;

/** Colore d'accento del brand del locale (Impostazioni → Brand) per bottoni e badge; ricade sul gold neutro se non impostato o non valido. */
function resolveAccentColor(accentColor?: string): string {
  return accentColor && HEX_COLOR_RE.test(accentColor) ? accentColor : DEFAULT_ACCENT_COLOR;
}

/**
 * Un colore scritto dall'editor non finisce mai nell'HTML senza passare di qui.
 * Il pannello proprietà produce solo esadecimali, ma il documento arriva da un
 * campo JSON: un valore inventato a mano diventerebbe una dichiarazione CSS
 * arbitraria dentro l'email.
 */
function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (HEX_COLOR_RE.test(value) || /^#[0-9a-fA-F]{3,4}$/.test(value)) return value;
  return fallback;
}

function num(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

/**
 * Il padding di una cella: i valori del blocco se ci sono, altrimenti quelli
 * storici del tipo di blocco — è ciò che tiene identiche le campagne salvate
 * prima che i blocchi avessero uno stile.
 */
function padding(style: BlockStyle | undefined, fallback: [number, number, number, number]): string {
  const top = num(style?.paddingTop, fallback[0]);
  const right = num(style?.paddingRight, fallback[1]);
  const bottom = num(style?.paddingBottom, fallback[2]);
  const left = num(style?.paddingLeft, fallback[3]);
  return `padding:${top}px ${right}px ${bottom}px ${left}px;`;
}

function background(style: BlockStyle | undefined): string {
  return style?.backgroundColor ? `background-color:${safeColor(style.backgroundColor, "transparent")};` : "";
}

interface RenderContext {
  accent: string;
  settings: EmailSettings;
}

/** Il testo di un blocco: l'HTML ripulito se c'è, altrimenti il testo semplice convertito. */
function textBody(block: { text: string; html?: string }): string {
  return block.html ? sanitizeRichText(block.html) : plainTextToRichHtml(block.text);
}

function renderTextBlock(block: Extract<Block, { type: "text" }>, ctx: RenderContext): string {
  const s = block.style;
  const style =
    `${padding(s, DEFAULT_BLOCK_PADDING.text)}${background(s)}` +
    `font-family:${ctx.settings.fontFamily};` +
    `font-size:${num(s?.fontSize, 15)}px;` +
    `line-height:${s?.lineHeight ?? 1.6};` +
    `color:${safeColor(s?.color, ctx.settings.textColor)};` +
    (s?.letterSpacing ? `letter-spacing:${s.letterSpacing}px;` : "") +
    (s?.align ? alignStyle(s.align) : "");
  // I margini dei paragrafi si azzerano qui perché i client email applicano
  // margini propri a `<p>`, tutti diversi fra loro.
  const body = textBody(block)
    .replace(/<p>/g, '<p style="margin:0 0 12px 0;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 12px 0;padding-left:22px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 12px 0;padding-left:22px;">');
  return `<tr><td style="${style}">${body}</td></tr>`;
}

const TITLE_SIZES: Record<1 | 2 | 3, number> = { 1: 26, 2: 21, 3: 17 };

function renderSimpleBlock(block: SimpleBlock, ctx: RenderContext): string {
  switch (block.type) {
    case "text":
      return renderTextBlock(block, ctx);
    case "image": {
      const s = block.style;
      const width = num(s?.width, 100);
      const radius = num(s?.borderRadius, 0);
      const img = `<img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(
        block.alt
      )}" width="${width}%" style="display:block;width:${width}%;max-width:100%;border:0;${
        radius ? `border-radius:${radius}px;` : ""
      }${s?.align === "center" ? "margin:0 auto;" : s?.align === "right" ? "margin-left:auto;" : ""}" />`;
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.image)}${background(s)}${
        s?.align ? alignStyle(s.align) : ""
      }">${block.linkUrl ? `<a href="${escapeHtml(block.linkUrl)}">${img}</a>` : img}</td></tr>`;
    }
    case "button_cta": {
      const s = block.style;
      const radius = num(s?.borderRadius, 6);
      const padV = num(s?.buttonPaddingV, 13);
      const padH = num(s?.buttonPaddingH, 30);
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.button_cta)}${background(s)}${alignStyle(
        s?.align ?? block.align
      )}"><a href="${escapeHtml(
        block.url
      )}" style="display:inline-block;background:${safeColor(
        s?.buttonColor,
        ctx.accent
      )};color:${safeColor(s?.buttonTextColor, "#ffffff")};font-family:${
        ctx.settings.fontFamily
      };font-size:${num(s?.fontSize, 15)}px;font-weight:600;padding:${padV}px ${padH}px;border-radius:${radius}px;text-decoration:none;">${escapeHtml(
        block.label
      )}</a></td></tr>`;
    }
  }
}

function renderColumnChild(block: ColumnChildBlock, ctx: RenderContext): string {
  switch (block.type) {
    case "text":
    case "image":
    case "button_cta":
      return renderSimpleBlock(block, ctx);
    default:
      return renderBlock(block, ctx);
  }
}

function renderBlock(block: Block, ctx: RenderContext): string {
  const s = block.style;
  switch (block.type) {
    case "logo":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.logo)}${background(s)}${alignStyle(
        s?.align ?? block.align
      )}"><img src="${escapeHtml(block.imageUrl)}" alt="Logo" height="${num(
        s?.fontSize,
        48
      )}" style="display:inline-block;border:0;" /></td></tr>`;
    case "hero_image":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.hero_image)}${background(s)}"><img src="${escapeHtml(
        block.imageUrl
      )}" alt="${escapeHtml(block.alt)}" width="100%" style="display:block;width:100%;max-width:100%;border:0;${
        s?.borderRadius ? `border-radius:${num(s.borderRadius, 0)}px;` : ""
      }" /></td></tr>`;
    case "title": {
      const level = block.level ?? 1;
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.title)}${background(s)}${alignStyle(
        s?.align ?? block.align
      )}"><h${level} style="margin:0;font-family:${ctx.settings.fontFamily};font-size:${num(
        s?.fontSize,
        TITLE_SIZES[level]
      )}px;font-weight:${num(s?.fontWeight, 700)};line-height:${s?.lineHeight ?? 1.3};letter-spacing:${
        s?.letterSpacing ?? 0
      }px;color:${safeColor(s?.color, "#1a1a1a")};">${escapeHtml(block.text)}</h${level}></td></tr>`;
    }
    case "text":
    case "image":
    case "button_cta":
      return renderSimpleBlock(block, ctx);
    case "divider":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.divider)}${background(
        s
      )}"><hr style="border:none;border-top:1px solid ${safeColor(
        s?.color,
        "#e5e5e5"
      )};margin:0;" /></td></tr>`;
    case "spacer":
      return `<tr><td style="${background(s)}font-size:0;line-height:0;height:${num(
        block.height,
        24
      )}px;">&nbsp;</td></tr>`;
    case "offer_box":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.offer_box)}"><table role="presentation" width="100%" style="background:${safeColor(
        s?.backgroundColor,
        "#f7f1e6"
      )};border-radius:${num(s?.borderRadius, 8)}px;border-collapse:collapse;"><tr><td style="padding:16px;font-family:${
        ctx.settings.fontFamily
      };">${
        block.badge
          ? `<span style="display:inline-block;background:${ctx.accent};color:#ffffff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:8px;">${escapeHtml(
              block.badge
            )}</span><br/>`
          : ""
      }<strong style="font-size:17px;color:#1a1a1a;">${escapeHtml(
        block.title
      )}</strong><p style="margin:8px 0 0 0;font-size:14px;color:#333;">${escapeHtml(
        block.body
      )}</p></td></tr></table></td></tr>`;
    case "two_columns":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.two_columns)}"><table role="presentation" width="100%" style="border-collapse:collapse;"><tr><td class="tv-col" width="50%" valign="top" style="padding-right:8px;"><table role="presentation" width="100%" style="border-collapse:collapse;">${block.left
        .map((b) => renderSimpleBlock(b, ctx))
        .join("")}</table></td><td class="tv-col" width="50%" valign="top" style="padding-left:8px;"><table role="presentation" width="100%" style="border-collapse:collapse;">${block.right
        .map((b) => renderSimpleBlock(b, ctx))
        .join("")}</table></td></tr></table></td></tr>`;
    case "columns": {
      const weights = COLUMN_RATIO_WEIGHTS[block.ratio] ?? [50, 50];
      const cells = block.columns
        .slice(0, weights.length)
        .map((children, i) => {
          const gutterLeft = i === 0 ? 0 : 8;
          const gutterRight = i === block.columns.length - 1 ? 0 : 8;
          return `<td class="tv-col" width="${weights[i]}%" valign="${
            s?.align === "center" ? "middle" : "top"
          }" style="padding:0 ${gutterRight}px 0 ${gutterLeft}px;"><table role="presentation" width="100%" style="border-collapse:collapse;">${children
            .map((c) => renderColumnChild(c, ctx))
            .join("")}</table></td>`;
        })
        .join("");
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.columns)}${background(
        s
      )}"><table role="presentation" width="100%" style="border-collapse:collapse;"><tr>${cells}</tr></table></td></tr>`;
    }
    case "social_links":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.social_links)}${background(s)}${alignStyle(
        s?.align ?? "center"
      )}font-family:${ctx.settings.fontFamily};">${block.links
        .map(
          (l) =>
            `<a href="${escapeHtml(l.url)}" style="margin:0 6px;color:${safeColor(
              s?.color,
              "#6b6b6b"
            )};text-decoration:underline;font-size:13px;">${escapeHtml(l.platform)}</a>`
        )
        .join("")}</td></tr>`;
    case "coupon":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.coupon)}"><table role="presentation" width="100%" style="border-collapse:collapse;border:2px dashed ${safeColor(
        s?.color,
        ctx.accent
      )};border-radius:${num(s?.borderRadius, 8)}px;background:${safeColor(
        s?.backgroundColor,
        "#fdf8f1"
      )};"><tr><td style="padding:18px;text-align:center;font-family:${ctx.settings.fontFamily};"><div style="font-size:16px;font-weight:700;color:#1a1a1a;">${escapeHtml(
        block.title
      )}</div><div style="margin:10px 0;font-size:24px;font-weight:700;letter-spacing:3px;color:${
        ctx.accent
      };">${escapeHtml(block.code)}</div><div style="font-size:14px;color:#4a4a4a;line-height:1.5;">${escapeHtml(
        block.description
      )}</div>${
        block.expiry
          ? `<div style="margin-top:10px;font-size:12px;color:#8a8a8a;">Valido fino al ${escapeHtml(
              block.expiry
            )}</div>`
          : ""
      }</td></tr></table></td></tr>`;
    case "event":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.event)}"><table role="presentation" width="100%" style="border-collapse:collapse;background:${safeColor(
        s?.backgroundColor,
        "#f7f1e6"
      )};border-radius:${num(s?.borderRadius, 8)}px;"><tr><td style="padding:18px;font-family:${
        ctx.settings.fontFamily
      };"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${
        ctx.accent
      };font-weight:700;">${escapeHtml(
        block.dateLabel
      )}</div><div style="margin-top:6px;font-size:18px;font-weight:700;color:#1a1a1a;">${escapeHtml(
        block.title
      )}</div><p style="margin:8px 0 14px 0;font-size:14px;color:#4a4a4a;line-height:1.5;">${escapeHtml(
        block.description
      )}</p><a href="${escapeHtml(block.ctaUrl)}" style="display:inline-block;background:${
        ctx.accent
      };color:#ffffff;font-size:14px;font-weight:600;padding:10px 22px;border-radius:6px;text-decoration:none;">${escapeHtml(
        block.ctaLabel
      )}</a></td></tr></table></td></tr>`;
    case "contacts":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.contacts)}${background(s)}${alignStyle(
        s?.align ?? "center"
      )}font-family:${ctx.settings.fontFamily};font-size:14px;color:${safeColor(
        s?.color,
        "#4a4a4a"
      )};line-height:1.7;"><strong style="color:#1a1a1a;">${escapeHtml(block.restaurantName)}</strong>${
        block.address ? `<br/>${escapeHtml(block.address)}` : ""
      }${block.phone ? `<br/>${escapeHtml(block.phone)}` : ""}${
        block.hours ? `<br/>${escapeHtml(block.hours)}` : ""
      }</td></tr>`;
    case "footer":
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.footer)}${background(s)}${alignStyle(
        s?.align ?? "center"
      )}font-family:${ctx.settings.fontFamily};font-size:${num(s?.fontSize, 12)}px;color:${safeColor(
        s?.color,
        "#8a8a8a"
      )};">${escapeHtml(block.text)}</td></tr>`;
    case "unsubscribe_link": {
      const dark = block.theme === "dark";
      const bg = safeColor(s?.backgroundColor, dark ? "#1f2a24" : "#f7f1e6");
      const fg = safeColor(s?.color, dark ? "#b9c5bd" : "#8a8a8a");
      const lines = [block.restaurantName, block.address].filter(Boolean) as string[];
      return `<tr><td style="${padding(s, DEFAULT_BLOCK_PADDING.unsubscribe_link)}background-color:${bg};${alignStyle(
        s?.align ?? "center"
      )}font-family:${ctx.settings.fontFamily};font-size:${num(
        s?.fontSize,
        12
      )}px;color:${fg};line-height:1.6;">${
        lines.length > 0 ? `<div>${lines.map(escapeHtml).join(" · ")}</div>` : ""
      }<div style="margin-top:6px;"><a href="{{UNSUBSCRIBE_LINK}}" style="color:${fg};text-decoration:underline;">${escapeHtml(
        block.text
      )}</a></div></td></tr>`;
    }
  }
}

/**
 * Le colonne su telefono.
 *
 * Outlook per Windows ignora le media query e continuerà a mostrare le colonne
 * affiancate: è accettabile, perché è il comportamento che l'email ha sempre
 * avuto. Dove la media query arriva (Gmail, Apple Mail, i client mobili, che
 * sono la maggioranza del traffico di un ristorante) le colonne si impilano
 * invece di diventare due strisce da 140 pixel.
 */
const RESPONSIVE_STYLE =
  '<style type="text/css">@media only screen and (max-width:620px){.tv-col{display:block!important;width:100%!important;padding:0 0 12px 0!important;}.tv-shell{width:100%!important;}}</style>';

/**
 * Compila un documento email in HTML "email-safe" (tabelle + stili inline — i
 * client email ignorano classi CSS esterne). I token variabile restano
 * placeholder letterali: la risoluzione è un passo separato, vedi
 * resolveGlobalVariables/resolveTestVariables/toBrevoMergeTags.
 * `accentColor` è il colore principale del brand (Impostazioni → Brand): usato
 * per bottoni e badge, ricade su un gold neutro se il locale non l'ha impostato.
 */
export function compileEmailDocument(doc: EmailDocument, accentColor?: string): string {
  const settings = { ...DEFAULT_EMAIL_SETTINGS, ...doc.settings };
  const ctx: RenderContext = { accent: resolveAccentColor(accentColor), settings };
  const rows = doc.blocks.map((b) => renderBlock(b, ctx)).join("");
  const width = Math.min(Math.max(num(settings.contentWidth, 600), 320), 800);
  return `${RESPONSIVE_STYLE}<table role="presentation" width="100%" style="background-color:${safeColor(
    settings.pageBackground,
    "#f4f1ea"
  )};border-collapse:collapse;margin:0;padding:0;"><tr><td align="center" style="padding:0;"><table role="presentation" class="tv-shell" width="${width}" style="width:${width}px;max-width:${width}px;margin:0 auto;background-color:${safeColor(
    settings.emailBackground,
    "#ffffff"
  )};border-collapse:collapse;">${rows}</table></td></tr></table>`;
}

/** Forma storica: un array piatto di blocchi con le impostazioni predefinite. */
export function compileBlocksToHtml(blocks: Block[], accentColor?: string): string {
  return compileEmailDocument(
    { version: 2, settings: { ...DEFAULT_EMAIL_SETTINGS }, blocks },
    accentColor
  );
}

/** Il punto d'ingresso del server: accetta il documento nuovo o l'array vecchio. */
export function compileCampaignContent(raw: unknown, accentColor?: string): string {
  return compileEmailDocument(parseEmailDocument(raw), accentColor);
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
  vars: { restaurantName: string; bookingLink: string; restaurantAddress?: string }
): string {
  return substituteTokens(html, {
    "{{RESTAURANT_NAME}}": vars.restaurantName,
    "{{RESTAURANT_ADDRESS}}": vars.restaurantAddress ?? "",
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
    restaurantAddress?: string;
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
    "{{RESTAURANT_ADDRESS}}": vars.restaurantAddress ?? "",
    "{{BOOKING_LINK}}": vars.bookingLink,
    "{{UNSUBSCRIBE_LINK}}": vars.unsubscribeLink,
    "{{LAST_VISIT_DATE}}": vars.lastVisitDate,
    "{{LOYALTY_LEVEL}}": vars.loyaltyLevel,
  });
}

/**
 * Risolve **tutti** i token per una persona vera, al momento dell'invio.
 *
 * Differisce da `toBrevoMergeTags` per una ragione che vale la pena dire: là i
 * token diventano segnaposto che risolve il fornitore, usando attributi di
 * contatto che vanno sincronizzati prima — e se la sincronizzazione non è
 * arrivata, il cliente riceve una email che dice «Ciao ,». Qui la sostituzione
 * la facciamo noi, con i dati che abbiamo in mano in questo istante: o il nome
 * c'è, o mettiamo la formula neutra, e non dipende da nessuno.
 *
 * `firstName` vuoto diventa «Ciao,» e non «Ciao ,»: è il motivo per cui la
 * formula di saluto non si compone qui a pezzi.
 */
export function resolveRecipientVariables(
  html: string,
  vars: {
    firstName: string | null;
    lastName: string | null;
    restaurantName: string;
    restaurantAddress?: string;
    bookingLink: string;
    unsubscribeLink: string;
    lastVisitDate?: string;
    loyaltyLevel?: string;
  }
): string {
  return substituteTokens(html, {
    "{{FIRSTNAME}}": vars.firstName?.trim() ?? "",
    "{{LASTNAME}}": vars.lastName?.trim() ?? "",
    "{{RESTAURANT_NAME}}": vars.restaurantName,
    "{{RESTAURANT_ADDRESS}}": vars.restaurantAddress ?? "",
    "{{BOOKING_LINK}}": vars.bookingLink,
    "{{UNSUBSCRIBE_LINK}}": vars.unsubscribeLink,
    "{{LAST_VISIT_DATE}}": vars.lastVisitDate ?? "",
    "{{LOYALTY_LEVEL}}": vars.loyaltyLevel ?? "",
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
