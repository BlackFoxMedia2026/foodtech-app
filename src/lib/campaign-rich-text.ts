/**
 * Il testo formattato delle email, e perché è ripulito due volte.
 *
 * L'editor scrive in un `contentEditable`: quello che ne esce non è il nostro
 * markup, è quello che il browser ha deciso di produrre — `<font>`, `<div>`
 * annidati, attributi `class` di incollaggi da Word, e in linea di principio
 * qualunque cosa uno voglia incollarci dentro. Quel testo poi torna indietro
 * **renderizzato nel nostro prodotto** (il canvas lo mostra come HTML) e
 * **spedito a centinaia di persone**: sono due superfici diverse, e nessuna
 * delle due può fidarsi di ciò che arriva dal campo di testo.
 *
 * Quindi: lista bianca, non lista nera. Tutto ciò che non è esplicitamente
 * ammesso qui viene buttato — il tag sparisce e il suo testo resta, che è il
 * comportamento che un ristoratore si aspetta quando incolla da Word e vede
 * il grassetto sopravvivere e il resto no.
 *
 * La stessa funzione gira sul client (prima di salvare) e sul server (prima
 * di compilare l'HTML): il client è comodità, il server è la difesa.
 */

/** Tag ammessi e, per ciascuno, gli attributi ammessi. */
const ALLOWED_TAGS: Record<string, string[]> = {
  b: [],
  strong: [],
  i: [],
  em: [],
  u: [],
  s: [],
  br: [],
  p: ["style"],
  ul: [],
  ol: [],
  li: [],
  a: ["href", "style"],
  span: ["style"],
};

const VOID_TAGS = new Set(["br"]);

/** Proprietà CSS che hanno senso dentro una riga di testo e che ogni client email legge. */
const ALLOWED_CSS_PROPS = new Set([
  "color",
  "background-color",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
]);

const SAFE_CSS_VALUE = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z-]+(\s+[a-zA-Z-]+)*)$/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Un link è ammesso se porta dove ci si aspetta: web, posta, telefono — o se è
 * un token variabile, che al momento dell'invio diventerà uno di quelli.
 * `javascript:` e `data:` non passano, ed è tutto il punto di questa funzione.
 */
function sanitizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\{\{[A-Z_]+\}\}$/.test(value)) return value;
  if (/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(value)) {
    // Un URL non può contenere virgolette o parentesi angolari: se le contiene,
    // qualcuno sta cercando di uscire dall'attributo.
    if (/["'<>]/.test(value)) return null;
    return value;
  }
  return null;
}

function sanitizeStyle(raw: string): string | null {
  const declarations: string[] = [];
  for (const chunk of raw.split(";")) {
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;
    const prop = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();
    if (!ALLOWED_CSS_PROPS.has(prop)) continue;
    if (!SAFE_CSS_VALUE.test(value)) continue;
    declarations.push(`${prop}:${value}`);
  }
  return declarations.length > 0 ? declarations.join(";") : null;
}

const ATTR_RE = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function sanitizeAttributes(tag: string, rawAttrs: string): string {
  const allowed = ALLOWED_TAGS[tag];
  if (allowed.length === 0) return "";
  const out: string[] = [];
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(rawAttrs)) !== null) {
    const name = match[1].toLowerCase();
    if (!allowed.includes(name)) continue;
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name === "href") {
      const url = sanitizeUrl(value);
      if (url) out.push(`href="${escapeHtml(url)}"`);
      continue;
    }
    if (name === "style") {
      const style = sanitizeStyle(value);
      if (style) out.push(`style="${escapeHtml(style)}"`);
    }
  }
  return out.length > 0 ? ` ${out.join(" ")}` : "";
}

const TOKEN_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;

/**
 * Ripulisce l'HTML di un blocco di testo.
 *
 * Il testo fuori dai tag viene sempre riscritto con l'escape: anche quando il
 * contenuto arriva già "pulito", riscriverlo garantisce che una `<` rimasta
 * per sbaglio non apra un tag che nessuno ha voluto.
 */
export function sanitizeRichText(input: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(input)) !== null) {
    if (match.index > cursor) out.push(escapeHtml(input.slice(cursor, match.index)));
    cursor = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    const isClosing = match[0].startsWith("</");
    if (!(tag in ALLOWED_TAGS)) continue; // tag scartato, il suo testo resta

    if (VOID_TAGS.has(tag)) {
      if (!isClosing) out.push(`<${tag}/>`);
      continue;
    }

    if (isClosing) {
      const open = stack.lastIndexOf(tag);
      if (open === -1) continue; // chiusura orfana
      // Chiude anche ciò che era rimasto aperto dentro, così l'annidamento resta valido.
      for (let i = stack.length - 1; i >= open; i--) out.push(`</${stack[i]}>`);
      stack.splice(open);
      continue;
    }

    out.push(`<${tag}${sanitizeAttributes(tag, match[2])}>`);
    stack.push(tag);
  }

  if (cursor < input.length) out.push(escapeHtml(input.slice(cursor)));
  for (let i = stack.length - 1; i >= 0; i--) out.push(`</${stack[i]}>`);
  return out.join("");
}

/** Il testo semplice storico diventa HTML: riga vuota = paragrafo, a capo = `<br>`. */
export function plainTextToRichHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/**
 * La versione piana di un testo formattato — serve a tenere `text` allineato a
 * `html` dentro `TextBlock`, e a mostrare un riassunto leggibile dove non c'è
 * spazio per la formattazione.
 */
export function richHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
