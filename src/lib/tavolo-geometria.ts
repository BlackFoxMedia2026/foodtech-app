import type { TableShape } from "@prisma/client";

/**
 * La geometria di un tavolo sulla piantina: quanto è grande e dove stanno le
 * sedie.
 *
 * Sta in `lib/` e non accanto al componente perché la stessa risposta serve in
 * tre posti che non si conoscono fra loro — l'editor della Sala, la vista
 * operativa, la mappa delle Prenotazioni — e finché è stata scritta tre volte
 * i tre disegni sono divergiti: nella mappa un sei posti e un dieci posti
 * erano identici, nell'editor no.
 */

/** L'impronta standard di ogni forma, in pixel del canvas (100 px = 1 m).
 * È anche l'area di trascinamento e di aggancio: cambiarla sposterebbe i
 * tavoli già disposti, quindi non si tocca. */
export const DIMENSIONE_TAVOLO: Record<TableShape, { w: number; h: number }> = {
  ROUND: { w: 80, h: 80 },
  SQUARE: { w: 80, h: 80 },
  RECT: { w: 120, h: 70 },
  OVAL: { w: 130, h: 85 },
  CUSTOM: { w: 100, h: 80 },
  BOOTH: { w: 160, h: 90 },
  LOUNGE: { w: 140, h: 100 },
};

/**
 * Quanto più piccolo, secondo i posti.
 *
 * Su una piantina un due posti e un dieci posti disegnati identici tolgono
 * alla mappa la sola cosa per cui la si guarda: capire la sala con un colpo
 * d'occhio. La forma dice se è tondo o rettangolare, la dimensione dice
 * quanta gente ci sta.
 */
const SCALA_PER_POSTI: readonly { finoA: number; scala: number }[] = [
  { finoA: 2, scala: 0.62 },
  { finoA: 4, scala: 0.74 },
  { finoA: 6, scala: 0.86 },
  { finoA: 8, scala: 0.94 },
];
const SCALA_MASSIMA = 1;

export function scalaPerPosti(seats: number) {
  return SCALA_PER_POSTI.find((r) => seats <= r.finoA)?.scala ?? SCALA_MASSIMA;
}

export type TavoloMisurabile = {
  shape: TableShape;
  seats: number;
  width?: number | null;
  height?: number | null;
};

/**
 * La dimensione **disegnata** del piano del tavolo.
 *
 * Se qualcuno l'ha ridimensionato a mano nell'editor, vale la sua misura: un
 * ristoratore che allarga il tavolo della vetrata sa perché lo sta facendo.
 * Altrimenti vale la standard della forma, ristretta secondo i posti.
 */
export function dimensioneDisegnata(t: TavoloMisurabile): { w: number; h: number } {
  if (t.width && t.height) return { w: t.width, h: t.height };
  const base = DIMENSIONE_TAVOLO[t.shape];
  const scala = scalaPerPosti(t.seats);
  return { w: Math.round(base.w * scala), h: Math.round(base.h * scala) };
}

/** L'ingombro totale — piano più sedie — che serve a chi calcola i bordi
 * della sala e a chi decide quanto spazio occupa un tavolo sulla mappa. */
export function ingombroTavolo(t: TavoloMisurabile): { w: number; h: number } {
  const piano = dimensioneDisegnata(t);
  const margine = SPORGENZA_SEDIA * 2;
  return { w: piano.w + margine, h: piano.h + margine };
}

/** Quanto sporge una sedia oltre il bordo del piano. */
export const SPORGENZA_SEDIA = 13;
export const LARGHEZZA_SEDIA = 20;
export const PROFONDITA_SEDIA = 13;

export const MAX_SEDIE = 12;

export type Sedia = {
  /** Centro della sedia, relativo al centro del piano. */
  x: number;
  y: number;
  /** Gradi: 0 = sedia in alto, schienale verso l'esterno. */
  rotazione: number;
};

/**
 * Dove stanno le sedie.
 *
 * Due strategie, e la differenza si vede: attorno a un tavolo tondo o ovale
 * le sedie stanno su un'ellisse, spaziate uguali; attorno a un tavolo
 * squadrato stanno **sui lati**, come stanno davvero, perché quattro sedie
 * disposte su un cerchio attorno a un rettangolo finiscono agli angoli e
 * nessuno si siede in un angolo.
 *
 * Le forme con sedute incorporate — divanetto, lounge — non ricevono sedie:
 * disegnare sei sedie attorno a un divano è un errore di lettura, non un
 * dettaglio grafico.
 */
export function posizioniSedie(shape: TableShape, larghezza: number, altezza: number, posti: number): Sedia[] {
  const n = Math.max(0, Math.min(posti, MAX_SEDIE));
  if (n === 0) return [];
  if (shape === "BOOTH" || shape === "LOUNGE") return [];

  if (shape === "ROUND" || shape === "OVAL") {
    const rx = larghezza / 2 + SPORGENZA_SEDIA;
    const ry = altezza / 2 + SPORGENZA_SEDIA;
    return Array.from({ length: n }, (_, i) => {
      const angolo = (2 * Math.PI * i) / n - Math.PI / 2;
      return {
        x: rx * Math.cos(angolo),
        y: ry * Math.sin(angolo),
        rotazione: (angolo * 180) / Math.PI + 90,
      };
    });
  }

  return sedieSuiLati(larghezza, altezza, n);
}

/**
 * La ripartizione sui quattro lati.
 *
 * I lati lunghi prendono le sedie a coppie, le teste una per volta e solo
 * quando servono: è così che si apparecchia davvero un rettangolo, ed è anche
 * l'unico modo perché due posti su un tavolo rettangolare risultino uno di
 * fronte all'altro invece che entrambi sullo stesso lato.
 */
function sedieSuiLati(larghezza: number, altezza: number, n: number): Sedia[] {
  const orizzontale = larghezza >= altezza;
  const latoLungo = orizzontale ? larghezza : altezza;
  const latoCorto = orizzontale ? altezza : larghezza;

  // Quante ne stanno fisicamente su una testa, senza sovrapporsi.
  const maxTeste = Math.max(1, Math.floor(latoCorto / (LARGHEZZA_SEDIA + 4)));
  let teste = 0;
  if (n > 4) teste = Math.min(maxTeste * 2, n - 4);
  else if (n === 3) teste = 1;
  teste = Math.min(teste, n);

  const perTesta = [Math.ceil(teste / 2), Math.floor(teste / 2)];
  const restanti = n - teste;
  const perLato = [Math.ceil(restanti / 2), Math.floor(restanti / 2)];

  const offLungo = (orizzontale ? altezza : larghezza) / 2 + SPORGENZA_SEDIA;
  const offCorto = latoLungo / 2 + SPORGENZA_SEDIA;

  const sedie: Sedia[] = [];

  perLato.forEach((quante, lato) => {
    const segno = lato === 0 ? -1 : 1;
    for (let i = 0; i < quante; i++) {
      const t = distribuisci(i, quante, latoLungo);
      sedie.push(
        orizzontale
          ? { x: t, y: segno * offLungo, rotazione: lato === 0 ? 0 : 180 }
          : { x: segno * offLungo, y: t, rotazione: lato === 0 ? 270 : 90 },
      );
    }
  });

  perTesta.forEach((quante, lato) => {
    const segno = lato === 0 ? -1 : 1;
    for (let i = 0; i < quante; i++) {
      const t = distribuisci(i, quante, latoCorto);
      sedie.push(
        orizzontale
          ? { x: segno * offCorto, y: t, rotazione: lato === 0 ? 270 : 90 }
          : { x: t, y: segno * offCorto, rotazione: lato === 0 ? 0 : 180 },
      );
    }
  });

  return sedie;
}

/** Il centro dell'i-esima di `quante` sedie distribuite su un lato lungo
 * `lunghezza`, misurato dal centro del lato. */
function distribuisci(i: number, quante: number, lunghezza: number) {
  if (quante <= 0) return 0;
  const passo = lunghezza / quante;
  return -lunghezza / 2 + passo * (i + 0.5);
}

export const ETICHETTE_FORMA: Record<TableShape, string> = {
  SQUARE: "Quadrato",
  ROUND: "Rotondo",
  RECT: "Rettangolare",
  OVAL: "Ovale",
  CUSTOM: "Personalizzato",
  BOOTH: "Divanetto",
  LOUNGE: "Lounge",
};

/** Il raggio degli angoli del piano, per forma. */
export const RAGGIO_FORMA: Record<TableShape, number | "full"> = {
  SQUARE: 6,
  ROUND: "full",
  RECT: 6,
  OVAL: "full",
  CUSTOM: 10,
  BOOTH: 16,
  LOUNGE: 24,
};
