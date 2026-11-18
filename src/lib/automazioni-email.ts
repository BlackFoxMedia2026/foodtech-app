import { escapeHtml } from "@/lib/campaign-rich-text";
import { EMAIL_FONT_STACKS } from "@/lib/campaign-blocks";

/**
 * L'email delle automazioni: lo stile che il locale sceglie e l'HTML che parte.
 *
 * Sta qui, e non nel motore, per una ragione sola: **l'anteprima della
 * finestra «Modifica» e l'email vera sono lo stesso HTML**. Prima l'anteprima
 * era un disegno a parte che imitava il modello; con colori e caratteri
 * scelti dal locale le due cose avrebbero preso strade diverse, e
 * un'anteprima che non corrisponde all'invio non è un'anteprima.
 *
 * Lo stile è un **piccolo builder**, non l'editor delle campagne: sette
 * scelte chiuse (colore, sfondo, carattere, allineamento, logo, testo e
 * forma del pulsante). Un'automazione è un messaggio breve che parte da solo
 * per mesi; quello che conta è che somigli al locale, non che sia
 * impaginabile a piacere.
 */

export type CarattereEmail = (typeof EMAIL_FONT_STACKS)[number]["id"];
export type FormaPulsante = "pillola" | "morbido" | "squadrato";

export type AutomationStyle = {
  /** Il colore del pulsante e dei dettagli (bordo dell'omaggio). */
  colore: string;
  /** Il colore del foglio. */
  sfondo: string;
  carattere: CarattereEmail;
  allineamento: "sinistra" | "centro";
  /** Il logo del locale in testa, se il locale ne ha caricato uno. */
  logo: boolean;
  /** Le parole del pulsante. */
  pulsante: string;
  forma: FormaPulsante;
};

/** Come appariva l'email prima che lo stile si potesse scegliere. */
export const STILE_PREDEFINITO: AutomationStyle = {
  colore: "#0F2920",
  sfondo: "#ffffff",
  carattere: "sans",
  allineamento: "sinistra",
  logo: false,
  pulsante: "Prenota un tavolo",
  forma: "pillola",
};

export const SFONDI_EMAIL = [
  { id: "bianco", nome: "Bianco", hex: "#ffffff" },
  { id: "crema", nome: "Crema", hex: "#fbf7ef" },
  { id: "sabbia", nome: "Sabbia", hex: "#f3ebdd" },
] as const;

/** I colori proposti: dentro il verde e l'oro della casa, più un inchiostro. */
export const COLORI_EMAIL = [
  { nome: "Bosco", hex: "#0F2920" },
  { nome: "Salvia", hex: "#3d6b52" },
  { nome: "Oro", hex: "#b08a3e" },
  { nome: "Cuoio", hex: "#74432d" },
  { nome: "Inchiostro", hex: "#2b2b2b" },
] as const;

/**
 * Gli stili pronti: un tocco e l'email cambia faccia, poi si ritocca.
 * «Del locale» prende il colore di Impostazioni → Brand quando c'è.
 */
export function stiliPronti(coloreLocale: string | null): { id: string; nome: string; stile: AutomationStyle }[] {
  const base = STILE_PREDEFINITO;
  return [
    {
      id: "locale",
      // Senza un colore del brand è lo stile di sempre, e va chiamato così.
      nome: hexValido(coloreLocale) ? "Del locale" : "Classico",
      stile: { ...base, colore: hexValido(coloreLocale) ?? base.colore, logo: true },
    },
    {
      id: "bosco",
      nome: "Bosco",
      stile: { ...base, colore: "#0F2920", sfondo: "#fbf7ef", carattere: "serif", allineamento: "centro" },
    },
    {
      id: "oro",
      nome: "Oro",
      stile: { ...base, colore: "#b08a3e", sfondo: "#ffffff", carattere: "serif", allineamento: "centro" },
    },
    {
      id: "essenziale",
      nome: "Essenziale",
      stile: { ...base, colore: "#2b2b2b", sfondo: "#ffffff", carattere: "modern", forma: "squadrato" },
    },
  ];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function hexValido(v: unknown): string | null {
  return typeof v === "string" && HEX.test(v) ? v : null;
}

/**
 * Lo stile come arriva dal database o dal client, reso sicuro.
 *
 * Il documento è un campo JSON e ogni valore finisce in un `style` dentro
 * un'email spedita a clienti veri: un colore che non è un esadecimale, o un
 * carattere che non è nella lista, ricade sul predefinito invece di
 * diventare CSS scritto a mano.
 */
export function normalizzaStile(v: unknown): AutomationStyle {
  const s = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof AutomationStyle, unknown>>;
  const d = STILE_PREDEFINITO;
  return {
    colore: hexValido(s.colore) ?? d.colore,
    sfondo: hexValido(s.sfondo) ?? d.sfondo,
    carattere: EMAIL_FONT_STACKS.some((f) => f.id === s.carattere) ? (s.carattere as CarattereEmail) : d.carattere,
    allineamento: s.allineamento === "centro" ? "centro" : "sinistra",
    logo: s.logo === true,
    pulsante: typeof s.pulsante === "string" && s.pulsante.trim() ? s.pulsante.trim().slice(0, 40) : d.pulsante,
    forma: s.forma === "morbido" || s.forma === "squadrato" ? s.forma : "pillola",
  };
}

/** Testo chiaro o scuro sul pulsante, secondo quanto è chiaro il colore. */
export function inchiostroSu(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1d1d1b" : "#ffffff";
}

export function fontDi(carattere: CarattereEmail): string {
  return (EMAIL_FONT_STACKS.find((f) => f.id === carattere) ?? EMAIL_FONT_STACKS[0]).stack;
}

const RAGGIO: Record<FormaPulsante, string> = { pillola: "999px", morbido: "8px", squadrato: "0" };

/** Il logo solo da un indirizzo web o del sito: finisce in un `src`. */
function srcLogo(url: string | null | undefined, origine: string): string | null {
  if (!url || /["'<>\s\\]/.test(url)) return null;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return `${origine.replace(/\/+$/, "")}${url}`;
  return null;
}

/** Il testo del locale: protetto, e i ritorni a capo restano ritorni a capo. */
function paragrafo(testo: string): string {
  return escapeHtml(testo).replace(/\r?\n/g, "<br />");
}

/**
 * L'HTML dell'email. Ogni parte modificabile porta un `data-parte`: nelle
 * email non fa niente, nell'anteprima serve ad accendere la parte che si sta
 * cambiando.
 */
export function emailAutomazione(opts: {
  guestName: string;
  venueName: string;
  intro: string;
  url: string;
  venuePhone: string | null;
  coupon?: { code: string; descrizione: string; validUntil: Date } | null;
  unsubscribeUrl: string;
  stile: AutomationStyle;
  logoUrl?: string | null;
  /** Per completare un logo salvato come percorso del sito. */
  origine: string;
}): string {
  const s = normalizzaStile(opts.stile);
  const align = s.allineamento === "centro" ? "center" : "left";
  const logo = s.logo ? srcLogo(opts.logoUrl, opts.origine) : null;
  const venue = escapeHtml(opts.venueName);
  const scadenza = opts.coupon
    ? new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(opts.coupon.validUntil)
    : "";

  return `
    <div style="background:${s.sfondo};padding:28px 20px;">
      <div style="max-width:520px;margin:0 auto;font-family:${fontDi(s.carattere)};color:#2F1F11;text-align:${align};">
        ${
          logo
            ? `<p data-parte="logo" style="margin:0 0 22px;"><img src="${escapeHtml(logo)}" alt="${venue}" height="48" style="height:48px;max-width:180px;border:0;display:inline-block;" /></p>`
            : ""
        }
        <p style="font-size:16px;margin:0 0 14px;">Ciao ${escapeHtml(opts.guestName)},</p>
        <p data-parte="testo" style="font-size:16px;line-height:1.55;margin:0 0 18px;">${paragrafo(opts.intro)}</p>
        ${
          opts.coupon
            ? `<div data-parte="omaggio" style="border:1px solid ${s.colore}55;border-radius:12px;padding:16px;margin:0 0 18px;text-align:center;">
                 <p style="margin:0 0 6px;font-size:15px;">${escapeHtml(opts.coupon.descrizione)}</p>
                 <p style="margin:0;font-size:22px;letter-spacing:2px;font-weight:600;color:${s.colore};">${escapeHtml(opts.coupon.code)}</p>
                 <p style="margin:8px 0 0;font-size:13px;color:#6b5a45;">Valido fino al ${scadenza}, solo per te.</p>
               </div>`
            : ""
        }
        <p data-parte="pulsante" style="margin:0 0 20px;">
          <a href="${escapeHtml(opts.url)}"
             style="display:inline-block;background:${s.colore};color:${inchiostroSu(s.colore)};text-decoration:none;padding:12px 22px;border-radius:${RAGGIO[s.forma]};font-size:15px;font-weight:600;">
            ${escapeHtml(s.pulsante)}
          </a>
        </p>
        ${
          opts.venuePhone
            ? `<p style="font-size:13px;color:#6b5a45;margin:0 0 14px;">Se preferisci sentirci, siamo allo ${escapeHtml(opts.venuePhone)}.</p>`
            : ""
        }
        <p style="font-size:13px;color:#6b5a45;margin:0;">A presto!<br/><strong style="color:#2F1F11;">${venue}</strong></p>
        <p style="font-size:11px;color:#8a7a65;margin:24px 0 0;">
          Ricevi questa email perché hai acconsentito a ricevere comunicazioni da ${venue}.
          <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#8a7a65;">Non voglio più ricevere queste email</a>.
        </p>
      </div>
    </div>
  `;
}
