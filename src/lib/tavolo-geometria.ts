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

export type Rettangolo = { x: number; y: number; w: number; h: number };

/** Lo spazio minimo di passaggio fra due tavoli, ingombro sedie incluso: sotto
 * questa soglia un cameriere con un vassoio non ci passa più. A differenza
 * delle guide di allineamento non è un suggerimento che si disattiva con un
 * tasto — è un vincolo fisico, come un muro: il tavolo semplicemente non
 * entra lì sotto. */
export const SPAZIO_MINIMO_PASSAGGIO_PX = 60; // 60 cm

/** Il rettangolo di collisione di un tavolo posizionato: il suo ingombro
 * (piano + sedie), non solo il piano. Le sedie sporgono ugualmente su ogni
 * lato, quindi il centro combacia con quello del piano — solo il rettangolo
 * si allarga del margine delle sedie. */
export function rettangoloIngombro(t: TavoloMisurabile & { posX: number; posY: number }): Rettangolo {
  const piano = dimensioneDisegnata(t);
  const ingombro = ingombroTavolo(t);
  const margineX = (ingombro.w - piano.w) / 2;
  const margineY = (ingombro.h - piano.h) / 2;
  return { x: t.posX - margineX, y: t.posY - margineY, w: ingombro.w, h: ingombro.h };
}

/** Gli intervalli `[inizio, fine]` coperti da `altri` lungo un asse — solo
 * quelli il cui ingombro sull'asse perpendicolare (gonfiato di `gap`) copre
 * ancora `[secMin, secMax]`: un tavolo due file più in là non blocca niente
 * su questa riga. Uniti, perché due ostacoli vicini senza spazio franco in
 * mezzo sono un unico muro, non due separati. */
function intervalliOccupati(
  altri: Rettangolo[],
  gap: number,
  secMin: number,
  secMax: number,
  asse: "x" | "y",
): Array<[number, number]> {
  const grezzi: Array<[number, number]> = [];
  for (const altro of altri) {
    const altroSecMin = (asse === "x" ? altro.y : altro.x) - gap;
    const altroSecMax = (asse === "x" ? altro.y + altro.h : altro.x + altro.w) + gap;
    if (altroSecMax <= secMin || altroSecMin >= secMax) continue;
    const prinMin = (asse === "x" ? altro.x : altro.y) - gap;
    const prinMax = (asse === "x" ? altro.x + altro.w : altro.y + altro.h) + gap;
    grezzi.push([prinMin, prinMax]);
  }
  grezzi.sort((a, b) => a[0] - b[0]);
  const uniti: Array<[number, number]> = [];
  for (const iv of grezzi) {
    const ultimo = uniti[uniti.length - 1];
    if (ultimo && iv[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], iv[1]);
    else uniti.push([...iv]);
  }
  return uniti;
}

/** Il punto più vicino a `pos` che lascia `[pos, pos+dim]` fuori da ogni
 * intervallo occupato — a sinistra del più vicino o a destra, quale costa
 * meno. `null` se `pos` è già libero (niente da correggere). */
function piuVicinoLibero(pos: number, dim: number, occupati: Array<[number, number]>): number | null {
  const libero = (p: number) => !occupati.some(([a, b]) => p < b && p + dim > a);
  if (libero(pos)) return null;
  let migliore: number | null = null;
  for (const [a, b] of occupati) {
    for (const candidato of [a - dim, b]) {
      if (libero(candidato) && (migliore === null || Math.abs(candidato - pos) < Math.abs(migliore - pos))) {
        migliore = candidato;
      }
    }
  }
  return migliore;
}

/**
 * Allontana `rect` da ogni rettangolo di `altri` finché non lascia almeno
 * `gap` di spazio libero fra i due ingombri.
 *
 * Non uno a uno (scappare dal primo ostacolo rimbalzando dentro il secondo,
 * quando sono vicini fra loro, è esattamente il bug che questa versione
 * sostituisce): per ciascun asse si uniscono gli ingombri di chi occupa
 * ancora la stessa riga/colonna in un'unica sequenza di tratti occupati, e si
 * cerca il punto libero più vicino fuori da tutti insieme. Si tiene il
 * risultato che costa meno spostamento fra i due assi; se nessuno dei due,
 * da solo, trova un punto libero (il caso raro in cui serve spostarsi in
 * diagonale), un'ultima ripulitura ostacolo-per-ostacolo chiude quel poco che
 * resta. */
export function rispettaSpazioMinimo(
  rect: Rettangolo,
  altri: Rettangolo[],
  gap: number = SPAZIO_MINIMO_PASSAGGIO_PX,
): Rettangolo {
  if (altri.length === 0) return rect;
  const { w, h } = rect;

  const occupatiX = intervalliOccupati(altri, gap, rect.y, rect.y + h, "x");
  const occupatiY = intervalliOccupati(altri, gap, rect.x, rect.x + w, "y");
  const candidatoX = piuVicinoLibero(rect.x, w, occupatiX);
  const candidatoY = piuVicinoLibero(rect.y, h, occupatiY);

  let x = rect.x;
  let y = rect.y;
  if (candidatoX !== null && (candidatoY === null || Math.abs(candidatoX - rect.x) <= Math.abs(candidatoY - rect.y))) {
    x = candidatoX;
  } else if (candidatoY !== null) {
    y = candidatoY;
  }

  // Ripulitura finale ostacolo-per-ostacolo: copre il raro caso diagonale che
  // un singolo asse non risolve da solo. Poche iterazioni bastano perché si
  // parte già da una posizione quasi libera, non dal punto originale.
  const MAX_GIRI = 8;
  for (let giro = 0; giro < MAX_GIRI; giro++) {
    let spostato = false;
    for (const altro of altri) {
      const minX = altro.x - gap;
      const maxX = altro.x + altro.w + gap;
      const minY = altro.y - gap;
      const maxY = altro.y + altro.h + gap;
      const invadeX = x < maxX && x + w > minX;
      const invadeY = y < maxY && y + h > minY;
      if (!invadeX || !invadeY) continue;

      const spingiSinistra = x + w - minX;
      const spingiDestra = maxX - x;
      const spingiSu = y + h - minY;
      const spingiGiu = maxY - y;
      const minimo = Math.min(spingiSinistra, spingiDestra, spingiSu, spingiGiu);

      if (minimo === spingiSinistra) x = minX - w;
      else if (minimo === spingiDestra) x = maxX;
      else if (minimo === spingiSu) y = minY - h;
      else y = maxY;
      spostato = true;
    }
    if (!spostato) break;
  }
  return { x, y, w, h };
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
