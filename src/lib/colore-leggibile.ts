/**
 * Il colore del testo non si sceglie: si **deriva** dal fondo.
 *
 * Il ristoratore sceglie il colore del suo marchio, e quel colore finisce sul
 * pulsante «Prenota» che vedono i suoi clienti. Scrivere «testo bianco» una
 * volta per tutte significa che chi sceglie un giallo o un azzurro chiaro si
 * ritrova un pulsante illeggibile e non lo sa: nel locale dimostrativo il
 * colore era `#24E5FF` e il testo bianco sopra faceva **1,53 : 1**.
 *
 * Qui il testo si calcola, e quando nessuno dei due colori del prodotto arriva
 * alla soglia lo si può **dire** a chi ha scelto, invece di lasciarlo scoprire
 * ai clienti.
 */

/** I due unici colori di testo del prodotto (vedi DESIGN.md). */
export const CREMA = "#F2E7D0";
export const INCHIOSTRO = "#2F1F11";

/** La soglia AA per il testo normale. */
export const SOGLIA_AA = 4.5;
/** La soglia AA per il testo grande (≥24px, o ≥18,66px in grassetto). */
export const SOGLIA_AA_GRANDE = 3;

const ESADECIMALE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Da `#abc` o `#aabbcc` ai tre canali. `null` se non è un colore. */
export function canali(colore: string): [number, number, number] | null {
  if (!ESADECIMALE.test(colore)) return null;
  let h = colore.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** La luminanza relativa secondo WCAG 2.1. */
export function luminanza([r, g, b]: [number, number, number]): number {
  const canale = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canale(r) + 0.7152 * canale(g) + 0.0722 * canale(b);
}

/** Il rapporto di contrasto fra due colori: da 1 (identici) a 21 (nero/bianco). */
export function contrasto(a: string, b: string): number | null {
  const ca = canali(a);
  const cb = canali(b);
  if (!ca || !cb) return null;
  const [chiaro, scuro] = [luminanza(ca), luminanza(cb)].sort((x, y) => y - x);
  return (chiaro + 0.05) / (scuro + 0.05);
}

export type TestoSuFondo = {
  /** Il colore da usare per il testo. */
  colore: string;
  /** Quanto contrasta con il fondo. */
  rapporto: number;
  /** `false` quando nemmeno il migliore dei due arriva alla soglia. */
  leggibile: boolean;
};

/**
 * Il colore di testo migliore fra crema e inchiostro, per un dato fondo.
 *
 * Se il fondo non è un colore valido si torna al crema, che è il testo
 * predefinito del prodotto: un colore scritto male non deve far sparire
 * un'etichetta.
 */
export function testoSu(fondo: string, soglia: number = SOGLIA_AA): TestoSuFondo {
  const conCrema = contrasto(CREMA, fondo);
  const conInchiostro = contrasto(INCHIOSTRO, fondo);
  if (conCrema === null || conInchiostro === null) {
    return { colore: CREMA, rapporto: 0, leggibile: false };
  }
  const [colore, rapporto] =
    conInchiostro > conCrema ? [INCHIOSTRO, conInchiostro] : [CREMA, conCrema];
  return { colore, rapporto, leggibile: rapporto >= soglia };
}

/** Arrotondato a due decimali, per mostrarlo a chi ha scelto il colore. */
export function rapportoLeggibile(rapporto: number): string {
  return rapporto.toFixed(2).replace(".", ",");
}

/** Da tre canali all'esadecimale. */
function esadecimale([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

/**
 * Un punto fra due colori, con `q` da 0 a 1.
 *
 * Serve per le scale d'intensità. Una scala fatta con una **velatura** lega
 * l'intensità alla luminosità, che è esattamente ciò di cui ha bisogno anche
 * il testo sopra: alzando l'intensità il numero diventa illeggibile. Una scala
 * fra due colori **entrambi scuri** separa le due cose — l'intensità viaggia
 * sulla tinta, e un solo colore di testo regge su tutta la scala.
 */
export function interpola(da: string, a: string, q: number): string {
  const ca = canali(da);
  const cb = canali(a);
  if (!ca || !cb) return da;
  const t = Math.min(1, Math.max(0, q));
  return esadecimale(ca.map((x, i) => x + (cb[i] - x) * t) as [number, number, number]);
}
