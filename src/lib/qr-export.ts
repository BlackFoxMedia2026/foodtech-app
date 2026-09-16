"use client";

import { disegnoInSvg, svgInDataUrl } from "./qr-svg";
import type { DisegnoQr, Forma } from "./qr-disegno";

/**
 * Scaricare il codice: PNG, SVG, PDF.
 *
 * Il PNG e l'SVG si fanno **qui**, nel browser: il disegno è già sotto gli
 * occhi di chi preme il pulsante, e mandarlo al server per riaverlo indietro
 * identico sarebbe un viaggio per niente. Il PDF no — dentro c'è un logo da
 * comporre dentro il file, e quello lo fa `api/qr-codes/[id]/pdf`.
 */

export const MISURE_PNG = [512, 1024, 2048] as const;
export type MisuraPng = (typeof MISURE_PNG)[number];

/* I loghi già portati dentro, per non richiederli a ogni download. */
const cache = new Map<string, string>();

/**
 * Il logo come dato, invece che come indirizzo.
 *
 * Serve per due motivi diversi che portano allo stesso posto: un SVG scaricato
 * deve contenere il logo (aperto altrove, un riferimento esterno non si carica)
 * e una tela che ha disegnato un'immagine di un'altra origine non si lascia
 * più leggere. Vedi `api/qr-codes/logo`.
 */
export async function logoComeDato(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  const gia = cache.get(url);
  if (gia) return gia;
  try {
    const res = await fetch(`/api/qr-codes/logo?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const { dataUrl } = (await res.json()) as { dataUrl?: string };
    if (!dataUrl) return null;
    cache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

/** Lo stesso disegno con i loghi portati dentro, pronto da esportare. */
export async function disegnoAutonomo(disegno: DisegnoQr): Promise<DisegnoQr> {
  const indirizzi = [...new Set(disegno.forme.flatMap((f) => (f.t === "immagine" ? [f.url] : [])))];
  if (indirizzi.length === 0) return disegno;

  const dati = new Map<string, string>();
  await Promise.all(
    indirizzi.map(async (u) => {
      const d = await logoComeDato(u);
      if (d) dati.set(u, d);
    }),
  );

  return {
    ...disegno,
    forme: disegno.forme.flatMap((f): Forma[] => {
      if (f.t !== "immagine") return [f];
      const d = dati.get(f.url);
      /* Un logo che non si riesce a portare dentro si toglie invece di
         lasciarlo come riferimento morto: un rettangolo vuoto in mezzo a un QR
         stampato è peggio di un QR senza logo. */
      return d ? [{ ...f, url: d }] : [];
    }),
  };
}

function scarica(href: string, nome: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function nomeFile(nome: string, estensione: string): string {
  const pulito =
    nome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "qr-code";
  return `foodtech-qr-${pulito}.${estensione}`;
}

export async function scaricaSvg(disegno: DisegnoQr, nome: string) {
  const svg = disegnoInSvg(await disegnoAutonomo(disegno));
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  scarica(href, nomeFile(nome, "svg"));
  URL.revokeObjectURL(href);
}

export async function scaricaPng(disegno: DisegnoQr, nome: string, larghezza: MisuraPng) {
  const autonomo = await disegnoAutonomo(disegno);
  const svg = disegnoInSvg(autonomo);
  const altezza = Math.round((larghezza * autonomo.altezza) / autonomo.larghezza);

  const immagine = new Image();
  immagine.decoding = "sync";
  await new Promise<void>((risolvi, rifiuta) => {
    immagine.onload = () => risolvi();
    immagine.onerror = () => rifiuta(new Error("svg_non_letto"));
    immagine.src = svgInDataUrl(svg);
  });

  const tela = document.createElement("canvas");
  tela.width = larghezza;
  tela.height = altezza;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("tela_non_disponibile");
  ctx.drawImage(immagine, 0, 0, larghezza, altezza);

  const href = tela.toDataURL("image/png");
  scarica(href, nomeFile(nome, "png"));
}
