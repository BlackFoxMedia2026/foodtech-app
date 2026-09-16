/**
 * Il disegno del codice: dai moduli alle forme.
 *
 * ## Perché non una libreria di QR «stilizzati»
 *
 * Perché il disegno serve in tre posti che non parlano la stessa lingua:
 * l'anteprima nel browser (SVG), il file da scaricare (SVG e PNG) e il foglio
 * da stampare (PDF, dove un QR va disegnato **come vettore** — vedi la nota in
 * `lib/qr-pdf.ts`: un QR sfocato è un tavolo che non paga). Una libreria che
 * sa produrre solo un `<canvas>` costringerebbe a rasterizzare anche la
 * stampa, cioè a perdere proprio la cosa che conta.
 *
 * Quindi qui non si produce un'immagine: si produce un **elenco di forme** in
 * uno spazio di coordinate neutro. Chi le vuole in SVG le rende in SVG
 * (`qr-svg.ts`), chi le vuole in PDF le rende in PDF (`qr-pdf-stampa.ts`), e le
 * due strade non possono divergere perché partono dalla stessa lista.
 *
 * ## Il vincolo che comanda su tutto
 *
 * Un QR personalizzato che non si legge non è un QR: è un adesivo. Ogni scelta
 * di stile qui dentro resta **dentro il modulo** — non si allarga oltre la sua
 * cella, non si sposta, non si buca — e la zona di quiete di quattro moduli
 * non è negoziabile. Quello che può ancora andare storto (contrasto, logo
 * troppo grande, codice troppo denso) lo dice `qr-validazione.ts`.
 */

import { testoSu } from "./colore-leggibile";

/* -------------------------------------------------------------------------- */
/*  Il disegno che si sceglie                                                 */
/* -------------------------------------------------------------------------- */

export const STILI_MODULI = ["classico", "arrotondato", "morbido", "punto", "moderno", "geometrico"] as const;
export type StileModuli = (typeof STILI_MODULI)[number];

export const STILI_ANGOLI = ["quadrato", "arrotondato", "cerchio", "morbido"] as const;
export type StileAngoli = (typeof STILI_ANGOLI)[number];

export const POSIZIONI_LOGO = ["centro", "sopra", "sotto", "cornice"] as const;
export type PosizioneLogo = (typeof POSIZIONI_LOGO)[number];

export const CORNICI = ["nessuna", "semplice", "cta-sopra", "cta-sotto", "badge", "card"] as const;
export type Cornice = (typeof CORNICI)[number];

export type DesignQr = {
  coloreQr: string;
  coloreSfondo: string;
  stileModuli: StileModuli;
  stileAngoli: StileAngoli;
  logoUrl: string | null;
  posizioneLogo: PosizioneLogo;
  cornice: Cornice;
  testoCornice: string;
};

/** Il verde del prodotto su crema: è già il QR che un locale stamperebbe. */
export const DESIGN_PREDEFINITO: DesignQr = {
  coloreQr: "#13332C",
  coloreSfondo: "#F2E7D0",
  stileModuli: "classico",
  stileAngoli: "arrotondato",
  logoUrl: null,
  posizioneLogo: "centro",
  cornice: "nessuna",
  testoCornice: "",
};

export const NOMI_STILI_MODULI: Record<StileModuli, string> = {
  classico: "Classico",
  arrotondato: "Arrotondato",
  morbido: "Soft",
  punto: "Dot",
  moderno: "Moderno",
  geometrico: "Geometrico",
};

export const NOMI_STILI_ANGOLI: Record<StileAngoli, string> = {
  quadrato: "Quadrato",
  arrotondato: "Arrotondato",
  cerchio: "Cerchio",
  morbido: "Soft square",
};

export const NOMI_CORNICI: Record<Cornice, string> = {
  nessuna: "Nessuna",
  semplice: "Semplice",
  "cta-sopra": "Invito sopra",
  "cta-sotto": "Invito sotto",
  badge: "Badge",
  card: "Card",
};

export const NOMI_POSIZIONI_LOGO: Record<PosizioneLogo, string> = {
  centro: "Al centro",
  sopra: "Sopra il QR",
  sotto: "Sotto il QR",
  cornice: "Nella cornice",
};

/** La cornice porta una scritta su cui mettere l'invito? */
export function corniceConTesto(c: Cornice): boolean {
  return c === "cta-sopra" || c === "cta-sotto" || c === "badge" || c === "card";
}

/**
 * La correzione d'errore, decisa dal disegno e mai da chi lo sceglie.
 *
 * `H` ricostruisce fino al 30% del codice: è quello che permette a un logo al
 * centro di coprire dei moduli senza rompere niente. Senza logo si sta su `Q`
 * (25%), che regge comunque una goccia di sugo sul cartoncino senza gonfiare
 * il codice di moduli.
 *
 * È esattamente il genere di parola che il ristoratore non deve mai leggere.
 */
export function livelloCorrezione(design: Pick<DesignQr, "logoUrl" | "posizioneLogo">): "Q" | "H" {
  return design.logoUrl && design.posizioneLogo === "centro" ? "H" : "Q";
}

/* -------------------------------------------------------------------------- */
/*  Le forme                                                                  */
/* -------------------------------------------------------------------------- */

export type Forma =
  | { t: "rett"; x: number; y: number; w: number; h: number; colore: string }
  | { t: "path"; d: string; colore: string }
  | { t: "cerchio"; cx: number; cy: number; r: number; colore: string }
  | { t: "testo"; x: number; y: number; testo: string; dim: number; colore: string; grassetto?: boolean }
  | { t: "immagine"; x: number; y: number; w: number; h: number; url: string };

export type DisegnoQr = {
  larghezza: number;
  altezza: number;
  /** Il riquadro del solo codice, per chi deve sapere dov'è. */
  riquadroQr: { x: number; y: number; lato: number };
  forme: Forma[];
};

/** Un modulo, in unità di disegno. Dodici tiene corti i decimali nei percorsi. */
const M = 12;
/** La zona di quiete: quattro moduli, il minimo perché un telefono legga. */
const QUIETE = 4;

/* -------------------------------------------------------------------------- */
/*  La matrice                                                                */
/* -------------------------------------------------------------------------- */

export type Matrice = { size: number; scuro(r: number, c: number): boolean };

type ModuliGrezzi = {
  size: number;
  data: { get(i: number): number } | ArrayLike<number | boolean>;
};

/** Da quello che restituisce `QRCode.create(...).modules` a qualcosa di leggibile. */
export function matriceDa(moduli: ModuliGrezzi): Matrice {
  const d = moduli.data as { get?: (n: number) => number } & ArrayLike<number | boolean>;
  const valore = (i: number) => (typeof d.get === "function" ? d.get(i) : d[i]);
  return {
    size: moduli.size,
    scuro(r, c) {
      if (r < 0 || c < 0 || r >= moduli.size || c >= moduli.size) return false;
      return !!valore(r * moduli.size + c);
    },
  };
}

/** I tre quadrati grandi: si disegnano a parte, con la loro forma. */
function inOcchio(r: number, c: number, size: number): boolean {
  const dentro = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return dentro(0, 0) || dentro(0, size - 7) || dentro(size - 7, 0);
}

/* -------------------------------------------------------------------------- */
/*  I percorsi                                                                */
/* -------------------------------------------------------------------------- */

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Gli angoli tondi sono curve di Bézier, non archi.
 *
 * `A` è più corto da scrivere in un SVG, ma il PDF non ha gli archi: chi rende
 * in PDF dovrebbe ricostruire centro e verso di ogni arco per convertirlo in
 * curve, che è il genere di conversione che funziona su nove angoli su dieci.
 * Un quarto di cerchio **è** una cubica con i due punti di controllo a
 * `0,5523 · r` lungo le tangenti: scriverla così qui significa che i due
 * formati disegnano letteralmente la stessa curva.
 */
const K = 0.5522847498;

/** Un rettangolo con un raggio per angolo: [alto-sx, alto-dx, basso-dx, basso-sx]. */
function rettAngoli(
  x: number,
  y: number,
  w: number,
  h: number,
  raggi: [number, number, number, number],
): string {
  const max = Math.min(w, h) / 2;
  const [a, b, c, d] = raggi.map((r) => Math.max(0, Math.min(r, max)));
  const curva = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
    `C${n(x1)},${n(y1)} ${n(x2)},${n(y2)} ${n(x3)},${n(y3)}`;

  return [
    `M${n(x + a)},${n(y)}`,
    `H${n(x + w - b)}`,
    b ? curva(x + w - b + K * b, y, x + w, y + b - K * b, x + w, y + b) : "",
    `V${n(y + h - c)}`,
    c ? curva(x + w, y + h - c + K * c, x + w - c + K * c, y + h, x + w - c, y + h) : "",
    `H${n(x + d)}`,
    d ? curva(x + d - K * d, y + h, x, y + h - d + K * d, x, y + h - d) : "",
    `V${n(y + a)}`,
    a ? curva(x, y + a - K * a, x + a - K * a, y, x + a, y) : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Un quadrato con gli angoli tagliati: la forma di «Geometrico». */
function ottagono(x: number, y: number, lato: number, taglio: number): string {
  const t = taglio;
  return [
    `M${n(x + t)},${n(y)}`,
    `H${n(x + lato - t)}`,
    `L${n(x + lato)},${n(y + t)}`,
    `V${n(y + lato - t)}`,
    `L${n(x + lato - t)},${n(y + lato)}`,
    `H${n(x + t)}`,
    `L${n(x)},${n(y + lato - t)}`,
    `V${n(y + t)}`,
    "Z",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Il corpo del codice                                                       */
/* -------------------------------------------------------------------------- */

function formeCorpo(m: Matrice, stile: StileModuli, x0: number, y0: number, colore: string): Forma[] {
  const forme: Forma[] = [];
  const attivo = (r: number, c: number) => m.scuro(r, c) && !inOcchio(r, c, m.size);
  const px = (c: number) => x0 + c * M;
  const py = (r: number) => y0 + r * M;

  if (stile === "moderno") {
    /* Le colonne: i moduli in fila verticale si fondono in una barra sola con
       le estremità tonde. È lo stile che cambia di più l'aspetto senza mai
       uscire dalla cella — la barra resta larga quanto un modulo. */
    const larghezza = M * 0.86;
    const scarto = (M - larghezza) / 2;
    for (let c = 0; c < m.size; c++) {
      let r = 0;
      while (r < m.size) {
        if (!attivo(r, c)) {
          r++;
          continue;
        }
        let fine = r;
        while (fine + 1 < m.size && attivo(fine + 1, c)) fine++;
        const h = (fine - r + 1) * M;
        const raggio = larghezza / 2;
        forme.push({
          t: "path",
          d: rettAngoli(px(c) + scarto, py(r), larghezza, h, [raggio, raggio, raggio, raggio]),
          colore,
        });
        r = fine + 1;
      }
    }
    return forme;
  }

  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!attivo(r, c)) continue;
      const x = px(c);
      const y = py(r);
      switch (stile) {
        case "classico":
          /* Un filo di sovrapposizione: fra un quadrato e l'altro resta
             altrimenti una fessura da arrotondamento che alcune stampanti
             marcano, e un QR rigato è un QR che il telefono non legge. */
          forme.push({ t: "rett", x, y, w: M * 1.04, h: M * 1.04, colore });
          break;
        case "arrotondato":
          forme.push({
            t: "path",
            d: rettAngoli(x, y, M, M, [M * 0.3, M * 0.3, M * 0.3, M * 0.3]),
            colore,
          });
          break;
        case "punto":
          /* Il raggio è **mezzo modulo esatto**, cioè il cerchio più grande che
             sta nella cella, e non un pallino più piccolo con l'aria intorno.
             A 0,44 il codice era bello e non si leggeva: un lettore vero non
             trovava più i moduli (provato con un decodificatore, non a occhio).
             Il cerchio inscritto tocca i vicini e mantiene il disegno a punti
             restando dentro la cella. */
          forme.push({ t: "cerchio", cx: x + M / 2, cy: y + M / 2, r: M * 0.5, colore });
          break;
        case "geometrico":
          forme.push({ t: "path", d: ottagono(x, y, M, M * 0.28), colore });
          break;
        case "morbido":
        default: {
          /* Il raggio di ogni angolo guarda i due vicini che lo formano: dove
             il modulo continua, l'angolo sparisce e i due si fondono. */
          const su = attivo(r - 1, c);
          const giu = attivo(r + 1, c);
          const sx = attivo(r, c - 1);
          const dx = attivo(r, c + 1);
          const R = M * 0.5;
          forme.push({
            t: "path",
            d: rettAngoli(x, y, M * 1.02, M * 1.02, [
              su || sx ? 0 : R,
              su || dx ? 0 : R,
              giu || dx ? 0 : R,
              giu || sx ? 0 : R,
            ]),
            colore,
          });
          break;
        }
      }
    }
  }
  return forme;
}

/* -------------------------------------------------------------------------- */
/*  Gli occhi                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Un occhio: l'anello esterno 7×7 spesso un modulo, e il punto 3×3.
 *
 * Il vuoto in mezzo si ottiene ridisegnando il quadrato interno col colore di
 * fondo, invece che con un percorso a due anelli: il fondo qui è sempre pieno
 * (un QR senza fondo non si stampa), e due riempimenti semplici si comportano
 * allo stesso modo in SVG e in PDF — dove le regole di riempimento dei
 * percorsi compositi sono la prima cosa che diverge.
 */
function formeOcchio(x: number, y: number, stile: StileAngoli, colore: string, sfondo: string): Forma[] {
  const lato = 7 * M;

  if (stile === "cerchio") {
    return [
      { t: "cerchio", cx: x + lato / 2, cy: y + lato / 2, r: lato / 2, colore },
      { t: "cerchio", cx: x + lato / 2, cy: y + lato / 2, r: lato / 2 - M, colore: sfondo },
      { t: "cerchio", cx: x + lato / 2, cy: y + lato / 2, r: 1.5 * M, colore },
    ];
  }

  const quattro = (q: number): [number, number, number, number] => [q, q, q, q];
  const rEsterno = stile === "quadrato" ? 0 : stile === "morbido" ? M * 0.8 : M * 1.8;
  const rInterno = Math.max(0, rEsterno - M * 0.55);
  const rPunto = stile === "quadrato" ? 0 : stile === "morbido" ? M * 0.35 : M * 0.75;

  return [
    { t: "path", d: rettAngoli(x, y, lato, lato, quattro(rEsterno)), colore },
    { t: "path", d: rettAngoli(x + M, y + M, 5 * M, 5 * M, quattro(rInterno)), colore: sfondo },
    { t: "path", d: rettAngoli(x + 2 * M, y + 2 * M, 3 * M, 3 * M, quattro(rPunto)), colore },
  ];
}

/* -------------------------------------------------------------------------- */
/*  La composizione                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Quanto del lato può occupare il logo al centro.
 *
 * Il ventidue per cento del lato è circa il 5% dell'area: la correzione `H`
 * ne ricostruisce fino al 30%, quindi resta un margine largo per il resto —
 * una piega, un riflesso, una goccia. Oltre il trenta per cento di lato si
 * entra nel territorio in cui il codice si legge sul monitor e non sul tavolo,
 * ed è per questo che la misura è una costante e non un cursore.
 */
export const LOGO_CENTRO_MAX = 0.22;
/** Sopra e sotto il codice il logo può essere più grande: non copre niente. */
const LOGO_BANDA = 7 * M;

/**
 * Il testo della cornice, accorciato prima che sfondi il riquadro.
 *
 * Meglio un invito tagliato che un invito che esce dal cartoncino: chi scrive
 * trenta parole lo vede subito nell'anteprima.
 */
export const MAX_TESTO_CORNICE = 34;

export function componiQr({ matrice, design }: { matrice: Matrice; design: DesignQr }): DisegnoQr {
  const latoQr = (matrice.size + QUIETE * 2) * M;
  const conTesto = corniceConTesto(design.cornice) && design.testoCornice.trim().length > 0;
  const testo = design.testoCornice.trim().slice(0, MAX_TESTO_CORNICE);

  /* Il logo «nella cornice» ha senso solo se una cornice con la scritta c'è:
     altrimenti scivola sotto il codice, dove almeno si vede. */
  const posizioneLogo: PosizioneLogo =
    design.posizioneLogo === "cornice" && !conTesto ? "sotto" : design.posizioneLogo;
  const logo = design.logoUrl;

  const bordo = design.cornice === "semplice" || design.cornice === "card" ? M * 1.4 : 0;
  const padX = design.cornice === "nessuna" ? 0 : M * 1.6;
  const padY = design.cornice === "nessuna" ? 0 : M * 1.6;

  const altezzaBarra = conTesto ? M * 5 : 0;
  const bandaSopra = logo && posizioneLogo === "sopra" ? LOGO_BANDA : 0;
  const bandaSotto = logo && posizioneLogo === "sotto" ? LOGO_BANDA : 0;
  const barraSopra = conTesto && design.cornice === "cta-sopra" ? altezzaBarra : 0;
  const barraSotto = conTesto && design.cornice !== "cta-sopra" ? altezzaBarra : 0;

  const larghezza = latoQr + padX * 2;
  const altezza = latoQr + padY * 2 + barraSopra + barraSotto + bandaSopra + bandaSotto;

  const forme: Forma[] = [];

  /* Il fondo. Sempre pieno: un QR trasparente, appoggiato su una tovaglia
     scura, semplicemente non esiste. */
  const raggioCarta = design.cornice === "nessuna" ? 0 : M * 1.8;
  forme.push({
    t: "path",
    d: rettAngoli(0, 0, larghezza, altezza, [raggioCarta, raggioCarta, raggioCarta, raggioCarta]),
    colore: design.coloreSfondo,
  });

  if (bordo > 0) {
    /* Il bordo si disegna come due riquadri sovrapposti invece che come un
       tratto: il tratto in PDF ha una larghezza propria e un'origine diversa,
       e i due formati divergerebbero di mezzo millimetro. */
    const r2 = Math.max(0, raggioCarta - bordo * 0.4);
    const r3 = Math.max(0, r2 - bordo);
    forme.push({
      t: "path",
      d: rettAngoli(bordo * 0.5, bordo * 0.5, larghezza - bordo, altezza - bordo, [r2, r2, r2, r2]),
      colore: design.coloreQr,
    });
    forme.push({
      t: "path",
      d: rettAngoli(bordo * 1.5, bordo * 1.5, larghezza - bordo * 3, altezza - bordo * 3, [r3, r3, r3, r3]),
      colore: design.coloreSfondo,
    });
  }

  let y = padY;
  const inchiostroBarra = testoSu(design.coloreQr).colore;

  if (barraSopra > 0) {
    forme.push(
      ...barra(padX, y, larghezza - padX * 2, barraSopra, design, testo, inchiostroBarra, logo, posizioneLogo),
    );
    y += barraSopra;
  }

  if (bandaSopra > 0 && logo) {
    forme.push(...logoCentrato(padX, y, larghezza - padX * 2, bandaSopra, logo));
    y += bandaSopra;
  }

  /* --- Il codice. --- */
  const qrX = padX;
  const qrY = y;
  const o = QUIETE * M;
  forme.push(...formeCorpo(matrice, design.stileModuli, qrX + o, qrY + o, design.coloreQr));
  for (const [dr, dc] of [
    [0, 0],
    [0, matrice.size - 7],
    [matrice.size - 7, 0],
  ] as const) {
    forme.push(
      ...formeOcchio(qrX + o + dc * M, qrY + o + dr * M, design.stileAngoli, design.coloreQr, design.coloreSfondo),
    );
  }

  /* --- Il logo al centro, con la sua zona di rispetto. --- */
  if (logo && posizioneLogo === "centro") {
    const latoLogo = Math.round((latoQr * LOGO_CENTRO_MAX) / M) * M;
    const pad = M * 0.6;
    const cx = qrX + latoQr / 2;
    const cy = qrY + latoQr / 2;
    const lato = latoLogo + pad * 2;
    /* Il riquadro chiaro sotto il logo non è estetica: senza, il logo si
       appoggia sui moduli e il telefono legge una macchia. */
    forme.push({
      t: "path",
      d: rettAngoli(cx - lato / 2, cy - lato / 2, lato, lato, [M * 0.8, M * 0.8, M * 0.8, M * 0.8]),
      colore: design.coloreSfondo,
    });
    forme.push({
      t: "immagine",
      x: cx - latoLogo / 2,
      y: cy - latoLogo / 2,
      w: latoLogo,
      h: latoLogo,
      url: logo,
    });
  }

  y += latoQr;

  if (bandaSotto > 0 && logo) {
    forme.push(...logoCentrato(padX, y, larghezza - padX * 2, bandaSotto, logo));
    y += bandaSotto;
  }

  if (barraSotto > 0) {
    forme.push(
      ...barra(padX, y, larghezza - padX * 2, barraSotto, design, testo, inchiostroBarra, logo, posizioneLogo),
    );
    y += barraSotto;
  }

  return { larghezza, altezza, riquadroQr: { x: qrX, y: qrY, lato: latoQr }, forme };
}

/** La scritta dell'invito. Nel «badge» è una pillola; nella «card» è solo testo. */
function barra(
  x: number,
  y: number,
  w: number,
  h: number,
  design: DesignQr,
  testo: string,
  inchiostro: string,
  logo: string | null,
  posizioneLogo: PosizioneLogo,
): Forma[] {
  const forme: Forma[] = [];
  const conLogo = !!logo && posizioneLogo === "cornice";
  const dim = M * 2.6;

  if (design.cornice === "card") {
    /* Nella card l'invito sta sul fondo della carta, non su una fascia: la
       carta è già la cornice. */
    const colore = testoSu(design.coloreSfondo).colore;
    if (conLogo && logo) forme.push(...logoCentrato(x, y, w, h * 0.5, logo));
    forme.push({
      t: "testo",
      x: x + w / 2,
      y: y + (conLogo ? h * 0.86 : h * 0.62),
      testo,
      dim,
      colore,
      grassetto: true,
    });
    return forme;
  }

  const pillola = design.cornice === "badge";
  const larghezzaPillola = pillola ? Math.min(w, testo.length * dim * 0.62 + M * 4) : w;
  const xPillola = x + (w - larghezzaPillola) / 2;
  const altezzaPillola = pillola ? h * 0.72 : h;
  const yPillola = y + (h - altezzaPillola) / 2;
  const raggio = pillola ? altezzaPillola / 2 : M * 1.2;

  forme.push({
    t: "path",
    d: rettAngoli(xPillola, yPillola, larghezzaPillola, altezzaPillola, [raggio, raggio, raggio, raggio]),
    colore: design.coloreQr,
  });

  if (conLogo && logo) {
    const latoLogo = altezzaPillola * 0.62;
    forme.push({
      t: "immagine",
      x: xPillola + M * 0.9,
      y: yPillola + (altezzaPillola - latoLogo) / 2,
      w: latoLogo,
      h: latoLogo,
      url: logo,
    });
  }

  forme.push({
    t: "testo",
    x: x + w / 2 + (conLogo ? M * 0.9 : 0),
    y: yPillola + altezzaPillola / 2 + dim * 0.35,
    testo,
    dim,
    colore: inchiostro,
    grassetto: true,
  });
  return forme;
}

function logoCentrato(x: number, y: number, w: number, h: number, url: string): Forma[] {
  const lato = h * 0.78;
  return [{ t: "immagine", x: x + (w - lato) / 2, y: y + (h - lato) / 2, w: lato, h: lato, url }];
}

/* -------------------------------------------------------------------------- */
/*  Le miniature dei preset                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Un pezzetto di codice finto, per far vedere uno stile invece di nominarlo.
 *
 * «Soft» e «Moderno» non vogliono dire niente scritti in una tendina: la
 * differenza fra due stili di modulo si vede in mezzo secondo e non si spiega
 * in una riga. Il campione è una matrice fissa, non un QR vero: serve a
 * mostrare la forma, non a essere inquadrato.
 */
const CAMPIONE = ["0110110", "1011011", "1101101", "0110110", "1011011", "1101101", "0110110"];

/**
 * Le forme di un campione di stile, in uno spazio quadrato di `lato`.
 *
 * `formeCorpo` salta i tre angoli riservati agli occhi, e in una matrice di
 * sette righe **tutte** le celle cadrebbero lì dentro: il campione si finge
 * quindi al centro di una matrice più grande, così nessuna cella è in un
 * angolo, e lo stile che si vede è lo stesso codice che disegna quello vero.
 */
export function formeCampioneModuli(stile: StileModuli, colore: string): { lato: number; forme: Forma[] } {
  const lato = CAMPIONE.length;
  const grande: Matrice = {
    size: lato + 14,
    scuro: (r, c) => {
      const rr = r - 7;
      const cc = c - 7;
      return rr >= 0 && cc >= 0 && rr < lato && cc < lato && CAMPIONE[rr][cc] === "1";
    },
  };
  return { lato: lato * M, forme: formeCorpo(grande, stile, -7 * M, -7 * M, colore) };
}

/** Un occhio da solo, per la scelta della forma degli angoli. */
export function formeCampioneAngoli(
  stile: StileAngoli,
  colore: string,
  sfondo: string,
): { lato: number; forme: Forma[] } {
  return { lato: 7 * M, forme: formeOcchio(0, 0, stile, colore, sfondo) };
}

export { M as MODULO, QUIETE };
