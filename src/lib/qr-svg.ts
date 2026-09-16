import type { DisegnoQr, Forma } from "./qr-disegno";

/**
 * Le forme in SVG.
 *
 * Una stringa e non un albero di elementi React, per una ragione pratica: lo
 * stesso SVG deve poter finire in tre posti diversi — dentro la pagina come
 * anteprima, dentro un file da scaricare, e dentro un `<canvas>` per diventare
 * un PNG. Una stringa li serve tutti e tre; dei nodi React solo il primo.
 */

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Nel testo di un SVG i tre caratteri del markup vanno protetti, sempre. */
export function escapeXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function forma(f: Forma): string {
  switch (f.t) {
    case "rett":
      return `<rect x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}" fill="${f.colore}"/>`;
    case "path":
      return `<path d="${f.d}" fill="${f.colore}"/>`;
    case "cerchio":
      return `<circle cx="${n(f.cx)}" cy="${n(f.cy)}" r="${n(f.r)}" fill="${f.colore}"/>`;
    case "testo":
      /* Il carattere è dichiarato per famiglia e non caricato: un SVG che si
         scarica e si apre su un'altra macchina non può contare su un font del
         prodotto, e un invito reso in un carattere di sistema è meglio di un
         invito che non compare. */
      return (
        `<text x="${n(f.x)}" y="${n(f.y)}" fill="${f.colore}" font-size="${n(f.dim)}"` +
        ` font-family="Montserrat, Helvetica, Arial, sans-serif"` +
        ` font-weight="${f.grassetto ? 600 : 400}" text-anchor="middle"` +
        ` letter-spacing="${n(f.dim * 0.01)}">${escapeXml(f.testo)}</text>`
      );
    case "immagine":
      /* `preserveAspectRatio` centra e non deforma: il marchio di un locale
         schiacciato è un marchio sbagliato, e su un cartoncino stampato resta
         sbagliato per anni. */
      return (
        `<image x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}"` +
        ` preserveAspectRatio="xMidYMid meet" href="${escapeXml(f.url)}"/>`
      );
  }
}

export function disegnoInSvg(d: DisegnoQr, opts: { lato?: number } = {}): string {
  const attributiMisura = opts.lato ? ` width="${opts.lato}" height="${n((opts.lato * d.altezza) / d.larghezza)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` viewBox="0 0 ${n(d.larghezza)} ${n(d.altezza)}"${attributiMisura} shape-rendering="geometricPrecision">` +
    d.forme.map(forma).join("") +
    `</svg>`
  );
}

/** Lo stesso SVG, pronto da mettere in un `src`. */
export function svgInDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
