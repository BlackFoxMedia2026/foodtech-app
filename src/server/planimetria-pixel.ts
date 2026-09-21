import sharp from "sharp";

/**
 * Le stanze lette dai pixel, non indovinate.
 *
 * ## Perché esiste
 *
 * Un modello di visione non misura: stima. Su una planimetria quotata
 * rispondeva coordinate che erano le **quote del disegno divise per mille**, e
 * anche dopo aver tolto quell'inganno restava a uno scarto di 0,127
 * dall'ingombro vero — abbastanza da disegnare la lavanderia grande come la
 * cucina.
 *
 * Una planimetria CAD però è un disegno al tratto: i muri sono pixel scuri e
 * le stanze sono aree bianche chiuse dentro i muri. Quella è geometria che si
 * **calcola**. Misurato sulla stessa planimetria, scarto dal centro vero:
 *
 *     modello di visione     cucina 0,217 · soggiorno 0,173 · lavanderia 0,078
 *     calcolo sui pixel      cucina 0,025 · soggiorno 0,053 · lavanderia 0,041
 *
 * Al modello resta quello che sa fare davvero: **leggere**. I nomi degli
 * ambienti, la destinazione d'uso e le quote in metri arrivano da lui, su
 * un'immagine in cui le regioni trovate qui sono già disegnate e numerate.
 *
 * ## Come
 *
 * Quattro passaggi, ognuno per un difetto preciso incontrato provando:
 *
 *  1. **linee lunghe per direzione.** Erosione e dilatazione lungo una riga
 *     tengono solo i tratti orizzontali o verticali lunghi. Spariscono testi,
 *     quote, arredi e il disegno della scala, che spezzavano le stanze in tre;
 *  2. **chiusura lungo la stessa direzione.** I vani porta si tappano *lungo*
 *     il muro: la porta si chiude, il muro non ingrassa e una stanzetta resta
 *     grande com'è. Una dilatazione tonda invece se la mangiava;
 *  3. **unione con l'inchiostro spesso.** I muri a risalti corti — una
 *     bovindo, una nicchia — sono più corti della soglia del passo 1, e senza
 *     questo il soggiorno perdeva da lì e colava fuori;
 *  4. **riempimento dal bordo.** Quello che il bianco non raggiunge partendo
 *     dai bordi del foglio è chiuso dentro qualcosa: sono le stanze.
 *
 * Le misure sono tutte in frazione di larghezza, non in pixel: la stessa
 * planimetria scansionata al doppio della risoluzione deve dare lo stesso
 * risultato.
 */

/** Sopra questa larghezza si lavora rimpicciolito: il risultato non cambia e
 * il conto dura un terzo. */
const LARGHEZZA_LAVORO = 1400;

/** Più chiaro di così è carta, non segno. */
const SOGLIA_INCHIOSTRO = 200;

/** Un tratto è muro se è lungo almeno il 4,2% della larghezza. Sotto, è
 * arredo, testo o quota. */
const LUNGHEZZA_MURO = 0.042;

/** Il varco più largo che si tappa: 5,3% della larghezza, cioè una porta
 * normale su una planimetria inquadrata. */
const VARCO_PORTA = 0.053;

/** Di quanto si ingrossa l'inchiostro originale prima di unirlo ai muri. */
const SPESSORE_INCHIOSTRO = 0.005;

/** Una stanza non è una striscia: almeno il 2,5% per lato, e non più lunga di
 * otto volte quanto è larga. Sotto questa soglia ci sono solo i corridoi
 * delle linee di quota. */
const LATO_MINIMO = 0.025;
const PROPORZIONE_MASSIMA = 8;
const AREA_MINIMA = 0.0008;

export type RegioneTrovata = {
  /** Progressivo da 1: è il numero disegnato sull'immagine che va al modello. */
  numero: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Frazione dell'immagine occupata: serve a ordinare per importanza. */
  area: number;
};

export type RilevamentoPixel = {
  regioni: RegioneTrovata[];
  /** L'ingombro dell'edificio sul foglio, in frazione dell'immagine. Serve a
   * riportare tutto il resto in coordinate **dell'edificio**: per l'editor
   * `0` è il muro di sinistra, non il bordo della scansione. */
  edificio: { x: number; y: number; width: number; height: number };
  /** L'originale con le regioni disegnate e numerate sopra, da mandare al
   * modello perché le legga. */
  dataUrlNumerata: string;
  larghezza: number;
  altezza: number;
};

/* ------------------------------------------------------------------ *
 * Morfologia
 * ------------------------------------------------------------------ */

/**
 * Minimo o massimo scorrevole su una finestra centrata, in tempo costante per
 * pixel (coda monotona). Con finestre da cinquanta pixel la differenza con
 * l'implementazione ingenua non è un dettaglio.
 */
function scorriLinea(
  dati: Uint8Array,
  larghezza: number,
  altezza: number,
  finestra: number,
  orizzontale: boolean,
  massimo: boolean,
): Uint8Array {
  if (finestra <= 1) return dati;
  const out = new Uint8Array(dati.length);
  const passi = orizzontale ? larghezza : altezza;
  const linee = orizzontale ? altezza : larghezza;
  const meta = Math.floor(finestra / 2);
  const coda = new Int32Array(passi);
  const valori = new Uint8Array(passi);

  for (let l = 0; l < linee; l++) {
    for (let i = 0; i < passi; i++) {
      valori[i] = dati[orizzontale ? l * larghezza + i : i * larghezza + l];
    }
    let testa = 0;
    let fine = 0;
    for (let i = 0; i < passi; i++) {
      while (fine > testa && (massimo ? valori[coda[fine - 1]] <= valori[i] : valori[coda[fine - 1]] >= valori[i])) fine--;
      coda[fine++] = i;
      const sinistra = i - finestra + 1;
      while (coda[testa] < sinistra) testa++;
      const centro = i - meta;
      if (centro >= 0) {
        const v = valori[coda[testa]];
        out[orizzontale ? l * larghezza + centro : centro * larghezza + l] = v;
      }
    }
    // La coda del bordo: gli ultimi `meta` pixel non hanno visto la finestra
    // intera, e vale il valore dell'ultima finestra buona.
    for (let centro = passi - meta; centro < passi; centro++) {
      if (centro < 0) continue;
      const v = valori[coda[testa]];
      out[orizzontale ? l * larghezza + centro : centro * larghezza + l] = v;
    }
  }
  return out;
}

const erodi = (d: Uint8Array, w: number, h: number, f: number, o: boolean) => scorriLinea(d, w, h, f, o, false);
const dilata = (d: Uint8Array, w: number, h: number, f: number, o: boolean) => scorriLinea(d, w, h, f, o, true);

/** Tiene solo i tratti lunghi almeno `finestra` in quella direzione. */
function soloLinee(d: Uint8Array, w: number, h: number, finestra: number, orizzontale: boolean): Uint8Array {
  return dilata(erodi(d, w, h, finestra, orizzontale), w, h, finestra, orizzontale);
}

/** Tappa i buchi lungo la direzione del muro. */
function chiudiVarchi(d: Uint8Array, w: number, h: number, varco: number, orizzontale: boolean): Uint8Array {
  return erodi(dilata(d, w, h, varco, orizzontale), w, h, varco, orizzontale);
}

function unisci(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] > b[i] ? a[i] : b[i];
  return out;
}

/** Dilatazione tonda, fatta come due passaggi in croce: costa molto meno e su
 * una maschera di muri la differenza non si vede. */
function ingrossa(d: Uint8Array, w: number, h: number, quanto: number): Uint8Array {
  return dilata(dilata(d, w, h, quanto, true), w, h, quanto, false);
}

/* ------------------------------------------------------------------ *
 * Regioni
 * ------------------------------------------------------------------ */

type Riquadro = { x1: number; y1: number; x2: number; y2: number; area: number };

/**
 * Le aree bianche che il riempimento partito dal bordo del foglio non
 * raggiunge: sono chiuse dentro i muri, quindi sono stanze.
 */
function regioniChiuse(muri: Uint8Array, w: number, h: number): Riquadro[] {
  const stato = new Uint8Array(w * h); // 0 = da vedere, 1 = fuori, 2 = visto
  const pila = new Int32Array(w * h);
  let cima = 0;

  const accoda = (i: number) => {
    if (stato[i] === 0 && muri[i] === 0) {
      stato[i] = 1;
      pila[cima++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    accoda(x);
    accoda((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    accoda(y * w);
    accoda(y * w + w - 1);
  }
  while (cima > 0) {
    const i = pila[--cima];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) accoda(i - 1);
    if (x < w - 1) accoda(i + 1);
    if (y > 0) accoda(i - w);
    if (y < h - 1) accoda(i + w);
  }

  const riquadri: Riquadro[] = [];
  for (let start = 0; start < w * h; start++) {
    if (stato[start] !== 0 || muri[start] !== 0) continue;
    let area = 0;
    let x1 = w;
    let y1 = h;
    let x2 = 0;
    let y2 = 0;
    stato[start] = 2;
    pila[cima++] = start;
    while (cima > 0) {
      const i = pila[--cima];
      const x = i % w;
      const y = (i - x) / w;
      area++;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
      const vicini = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of vicini) {
        if (j >= 0 && stato[j] === 0 && muri[j] === 0) {
          stato[j] = 2;
          pila[cima++] = j;
        }
      }
    }
    riquadri.push({ x1, y1, x2, y2, area });
  }
  return riquadri;
}

/* ------------------------------------------------------------------ *
 * L'ingombro dell'edificio
 * ------------------------------------------------------------------ */

/** Un muro perimetrale occupa almeno questa frazione del lato. */
const MURO_LUNGO = 0.3;

/** ...e per essere un muro, e non una linea di quota, dev'essere spesso. */
const MURO_SPESSO = 0.003;

/**
 * Dove comincia e dove finisce l'edificio sul foglio.
 *
 * Una planimetria è circondata da quote, sezioni, cartigli e margini bianchi:
 * l'edificio occupa sì e no due terzi dell'immagine. Prendere il foglio per
 * l'edificio significa disegnare la sala al 64% e spostata — dieci metri e
 * ottanta che diventano sedici.
 *
 * Il perimetro si riconosce da due cose insieme: è **lungo** quanto il lato e
 * è **spesso**. Una linea di quota è lunga uguale ma alta un pixel, ed è
 * esattamente la differenza che la tiene fuori.
 */
function ingombroEdificio(
  inchiostro: Uint8Array,
  w: number,
  h: number,
): { x: number; y: number; width: number; height: number } | null {
  const spessore = Math.max(3, Math.round(w * MURO_SPESSO));

  const bande = (profilo: Int32Array, lungo: number): [number, number][] => {
    const out: [number, number][] = [];
    let inizio: number | null = null;
    for (let i = 0; i <= profilo.length; i++) {
      const pieno = i < profilo.length && profilo[i] >= lungo;
      if (pieno && inizio === null) inizio = i;
      if (!pieno && inizio !== null) {
        if (i - inizio >= spessore) out.push([inizio, i - 1]);
        inizio = null;
      }
    }
    return out;
  };

  const righe = new Int32Array(h);
  const colonne = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inchiostro[y * w + x]) {
        righe[y]++;
        colonne[x]++;
      }
    }
  }

  const orizzontali = bande(righe, w * MURO_LUNGO);
  const verticali = bande(colonne, h * MURO_LUNGO);
  if (orizzontali.length === 0 || verticali.length === 0) return null;

  const x1 = verticali[0][0];
  const y1 = orizzontali[0][0];
  const x2 = verticali[verticali.length - 1][1];
  const y2 = orizzontali[orizzontali.length - 1][1];
  if (x2 <= x1 || y2 <= y1) return null;

  return { x: x1 / w, y: y1 / h, width: (x2 - x1) / w, height: (y2 - y1) / h };
}

/* ------------------------------------------------------------------ *
 * L'ingresso
 * ------------------------------------------------------------------ */

export async function rilevaStanze(byte: ArrayBuffer): Promise<RilevamentoPixel | null> {
  try {
    const originale = Buffer.from(byte);
    const meta = await sharp(originale, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return null;

    const scala = meta.width > LARGHEZZA_LAVORO ? LARGHEZZA_LAVORO / meta.width : 1;
    const w = Math.round(meta.width * scala);
    const h = Math.round(meta.height * scala);

    const grigio = await sharp(originale, { failOn: "none" })
      .resize(w, h, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .greyscale()
      .raw()
      .toBuffer();

    const inchiostro = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inchiostro[i] = grigio[i] < SOGLIA_INCHIOSTRO ? 255 : 0;

    const lung = Math.max(9, Math.round(w * LUNGHEZZA_MURO));
    const varco = Math.max(11, Math.round(w * VARCO_PORTA));
    const spess = Math.max(3, Math.round(w * SPESSORE_INCHIOSTRO));

    const orizzontali = chiudiVarchi(soloLinee(inchiostro, w, h, lung, true), w, h, varco, true);
    const verticali = chiudiVarchi(soloLinee(inchiostro, w, h, lung, false), w, h, varco, false);
    const muri = ingrossa(unisci(unisci(orizzontali, verticali), ingrossa(inchiostro, w, h, spess)), w, h, spess);

    const minArea = AREA_MINIMA * w * h;
    const regioni: RegioneTrovata[] = [];
    for (const r of regioniChiuse(muri, w, h)) {
      if (r.area < minArea) continue;
      // I bordi hanno perso mezza dilatazione per lato: si restituisce.
      const mezzo = Math.floor(spess / 2);
      const x1 = Math.max(0, r.x1 - mezzo);
      const y1 = Math.max(0, r.y1 - mezzo);
      const x2 = Math.min(w - 1, r.x2 + mezzo);
      const y2 = Math.min(h - 1, r.y2 + mezzo);
      const larghezza = (x2 - x1) / w;
      const altezza = (y2 - y1) / h;
      const corto = Math.min(larghezza, altezza);
      if (corto < LATO_MINIMO) continue;
      if (Math.max(larghezza, altezza) / corto > PROPORZIONE_MASSIMA) continue;
      regioni.push({ numero: 0, x: x1 / w, y: y1 / h, width: larghezza, height: altezza, area: r.area / (w * h) });
    }

    // Le più grandi per prime: il numero 1 è la stanza principale, e nella
    // risposta del modello si legge meglio.
    regioni.sort((a, b) => b.area - a.area);
    regioni.forEach((r, i) => (r.numero = i + 1));
    if (regioni.length === 0) return null;

    // Se i muri perimetrali non si riconoscono, l'ingombro si ripiega
    // sull'unione dei riquadri: meno preciso, ma mai assurdo.
    const unione = {
      x: Math.min(...regioni.map((r) => r.x)),
      y: Math.min(...regioni.map((r) => r.y)),
      width: 0,
      height: 0,
    };
    unione.width = Math.max(...regioni.map((r) => r.x + r.width)) - unione.x;
    unione.height = Math.max(...regioni.map((r) => r.y + r.height)) - unione.y;

    return {
      regioni,
      edificio: ingombroEdificio(inchiostro, w, h) ?? unione,
      dataUrlNumerata: await immagineNumerata(originale, regioni, w, h),
      larghezza: w,
      altezza: h,
    };
  } catch {
    return null;
  }
}

/** L'originale con sopra i riquadri trovati e il loro numero: al modello si
 * chiede solo di leggere cosa c'è scritto dentro ognuno. */
async function immagineNumerata(
  originale: Buffer,
  regioni: RegioneTrovata[],
  w: number,
  h: number,
): Promise<string> {
  const raggio = Math.max(12, Math.round(w * 0.016));
  const pezzi = regioni.map((r) => {
    const x = Math.round(r.x * w);
    const y = Math.round(r.y * h);
    const rw = Math.round(r.width * w);
    const rh = Math.round(r.height * h);
    // Il pallino va nell'angolo in alto a sinistra, non al centro: al centro
    // copriva la scritta dell'ambiente — cioè esattamente la cosa che al
    // modello stiamo chiedendo di leggere. Su questa planimetria si era
    // mangiato «CUCINA», e la cucina è sparita dal risultato.
    const cx = x + raggio;
    const cy = y + raggio;
    return (
      `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="none" stroke="#e11d48" stroke-width="3"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${raggio}" fill="#e11d48"/>` +
      `<text x="${cx}" y="${cy + raggio * 0.38}" font-family="sans-serif" font-size="${Math.round(raggio * 1.2)}"` +
      ` font-weight="bold" fill="#ffffff" text-anchor="middle">${r.numero}</text>`
    );
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${pezzi.join("")}</svg>`;
  const png = await sharp(originale, { failOn: "none" })
    .resize(w, h, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
