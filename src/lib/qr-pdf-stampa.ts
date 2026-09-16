import { canali } from "./colore-leggibile";
import { immaginePerPdf, type ImmaginePdf } from "./immagine-pdf";
import type { DisegnoQr, Forma } from "./qr-disegno";

/**
 * Il foglio da stampare.
 *
 * Nasce dalle **stesse forme** dell'anteprima (`qr-disegno.ts`), non da uno
 * screenshot: quello che il ristoratore ha visto sullo schermo è quello che
 * esce dalla stampante, modulo per modulo, e ogni quadrato è un vettore — a
 * qualunque ingrandimento resta un bordo netto, che è la sola cosa che un
 * telefono sa leggere.
 *
 * Il PDF è scritto a mano per la stessa ragione di `lib/qr-pdf.ts`: un file
 * fatto di rettangoli, curve e quattro parole di testo è poche centinaia di
 * byte, e il sottoinsieme del formato che serve a scriverlo è elementare.
 * L'unico pezzo che costa qualcosa è il logo, e sta in `immagine-pdf.ts`.
 *
 * Usa Helvetica, che ogni lettore PDF ha già, quindi non incorpora font. Il
 * testo è in Latin-1: per un nome in cirillico i caratteri fuori tabella
 * diventano un punto interrogativo invece di corrompere il file.
 */

/** A4 in punti PostScript: 210 × 297 mm. */
const A4 = { larghezza: 595.28, altezza: 841.89 };

/** Il codice non riempie il foglio: dodici centimetri sono già una locandina. */
const LARGHEZZA_MASSIMA = 340;

function testoPdf(v: string): string {
  return v.replace(/[\\()]/g, (c) => `\\${c}`);
}

function latin1(v: string): Buffer {
  return Buffer.from([...v].map((c) => (c.charCodeAt(0) <= 0xff ? c : "?")).join(""), "latin1");
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** Da `#RRGGBB` ai tre valori 0-1 che il PDF vuole. */
function coloreRg(hex: string): string {
  const c = canali(hex) ?? [0, 0, 0];
  return c.map((v) => n(v / 255)).join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Dai percorsi SVG agli operatori PDF                                       */
/* -------------------------------------------------------------------------- */

/**
 * Il sottoinsieme di percorso che `qr-disegno` produce: `M H V L C Z`.
 *
 * Non c'è `A`, e non per caso: gli archi in `qr-disegno` sono già scritti come
 * curve di Bézier proprio perché il PDF non ha gli archi, e una conversione
 * qui sarebbe un secondo posto in cui i due formati possono divergere.
 */
function percorsoInPdf(d: string): string {
  const pezzi = d.match(/[MHVLCZ][^MHVLCZ]*/gi) ?? [];
  const out: string[] = [];
  let x = 0;
  let y = 0;
  for (const pezzo of pezzi) {
    const comando = pezzo[0].toUpperCase();
    const numeri = (pezzo.slice(1).match(/-?\d*\.?\d+/g) ?? []).map(Number);
    switch (comando) {
      case "M":
        x = numeri[0];
        y = numeri[1];
        out.push(`${n(x)} ${n(y)} m`);
        break;
      case "L":
        x = numeri[0];
        y = numeri[1];
        out.push(`${n(x)} ${n(y)} l`);
        break;
      case "H":
        x = numeri[0];
        out.push(`${n(x)} ${n(y)} l`);
        break;
      case "V":
        y = numeri[0];
        out.push(`${n(x)} ${n(y)} l`);
        break;
      case "C":
        out.push(
          `${n(numeri[0])} ${n(numeri[1])} ${n(numeri[2])} ${n(numeri[3])} ${n(numeri[4])} ${n(numeri[5])} c`,
        );
        x = numeri[4];
        y = numeri[5];
        break;
      case "Z":
        out.push("h");
        break;
    }
  }
  return out.join(" ");
}

/** Un cerchio: quattro curve, con lo stesso coefficiente degli angoli tondi. */
function cerchioInPdf(cx: number, cy: number, r: number): string {
  const k = 0.5522847498 * r;
  return [
    `${n(cx - r)} ${n(cy)} m`,
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
    "h",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Il foglio                                                                 */
/* -------------------------------------------------------------------------- */

export type LogoPerStampa = {
  url: string;
  byte: Buffer;
};

export function foglioQr(opts: {
  disegno: DisegnoQr;
  /** Il nome del QR, in piccolo in fondo: serve a chi stampa dieci fogli. */
  nome: string;
  /** Il colore su cui comporre le parti trasparenti dei loghi. */
  sfondo: string;
  /** I byte delle immagini richiamate dal disegno, per URL. */
  loghi?: LogoPerStampa[];
}): Buffer {
  const { disegno } = opts;

  const scala = Math.min(
    LARGHEZZA_MASSIMA / disegno.larghezza,
    (A4.altezza - 220) / disegno.altezza,
  );
  const larghezza = disegno.larghezza * scala;
  const altezza = disegno.altezza * scala;
  const ox = (A4.larghezza - larghezza) / 2;
  const oy = (A4.altezza - altezza) / 2 - 20;

  /* --- Le immagini, preparate una volta sola. --- */
  const fondo = (canali(opts.sfondo) ?? [255, 255, 255]) as [number, number, number];
  const immagini = new Map<string, { nome: string; img: ImmaginePdf }>();
  for (const logo of opts.loghi ?? []) {
    if (immagini.has(logo.url)) continue;
    const img = immaginePerPdf(logo.byte, fondo);
    if (img) immagini.set(logo.url, { nome: `Im${immagini.size + 1}`, img });
  }

  /* --- Il disegno. --- */
  const comandi: string[] = [
    "q",
    /* Il sistema di coordinate del disegno ha l'origine in alto a sinistra,
       quello del PDF in basso: la `d` negativa specchia l'asse verticale una
       volta per tutte, invece di far specchiare ogni forma a chi la scrive. */
    `${n(scala)} 0 0 ${n(-scala)} ${n(ox)} ${n(A4.altezza - oy)} cm`,
  ];

  let coloreCorrente = "";
  const usaColore = (hex: string) => {
    const rg = coloreRg(hex);
    if (rg !== coloreCorrente) {
      comandi.push(`${rg} rg`);
      coloreCorrente = rg;
    }
  };

  for (const f of disegno.forme) {
    switch (f.t) {
      case "rett":
        usaColore(f.colore);
        comandi.push(`${n(f.x)} ${n(f.y)} ${n(f.w)} ${n(f.h)} re f`);
        break;
      case "path":
        usaColore(f.colore);
        comandi.push(`${percorsoInPdf(f.d)} f`);
        break;
      case "cerchio":
        usaColore(f.colore);
        comandi.push(`${cerchioInPdf(f.cx, f.cy, f.r)} f`);
        break;
      case "testo": {
        usaColore(f.colore);
        /* Helvetica è larga in media mezzo em, un po' di più in grassetto: per
           centrare una riga di invito è un'approssimazione che basta, e non
           richiede di portarsi dentro le tabelle di avanzamento del font. */
        const larghezzaTesto = f.testo.length * f.dim * (f.grassetto ? 0.55 : 0.5);
        const x = f.x - larghezzaTesto / 2;
        /* La matrice del testo specchia a sua volta: sotto la `cm` di prima le
           due inversioni si annullano e le lettere escono dritte. */
        comandi.push(
          `BT /${f.grassetto ? "FB" : "FR"} ${n(f.dim)} Tf 1 0 0 -1 ${n(x)} ${n(f.y)} Tm (${testoPdf(f.testo)}) Tj ET`,
        );
        coloreCorrente = "";
        break;
      }
      case "immagine": {
        const voce = immagini.get(f.url);
        if (!voce) break;
        /* L'immagine si disegna nel quadrato unitario con la `v` verso l'alto:
           l'altezza negativa la rimette nel verso del disegno. */
        comandi.push(
          `q ${n(f.w)} 0 0 ${n(-f.h)} ${n(f.x)} ${n(f.y + f.h)} cm /${voce.nome} Do Q`,
        );
        coloreCorrente = "";
        break;
      }
    }
  }

  comandi.push("Q");

  /* --- Il nome, in fondo e in piccolo. --- */
  if (opts.nome.trim()) {
    const t = opts.nome.trim().slice(0, 60);
    const larghezzaTesto = t.length * 9 * 0.5;
    comandi.push("0.45 0.45 0.45 rg");
    comandi.push(
      `BT /FR 9 Tf ${n((A4.larghezza - larghezzaTesto) / 2)} 46 Td (${testoPdf(t)}) Tj ET`,
    );
  }

  const contenuto = latin1(comandi.join("\n"));

  /* --- Gli oggetti del file. --- */
  const vociImmagini = [...immagini.values()];
  const primoIdImmagine = 7;
  const risorseImmagini = vociImmagini
    .map((v, i) => `/${v.nome} ${primoIdImmagine + i} 0 R`)
    .join(" ");

  const oggetti: Buffer[] = [
    latin1("<< /Type /Catalog /Pages 2 0 R >>"),
    latin1("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    latin1(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(A4.larghezza)} ${n(A4.altezza)}]` +
        ` /Resources << /Font << /FR 5 0 R /FB 6 0 R >>` +
        (risorseImmagini ? ` /XObject << ${risorseImmagini} >>` : "") +
        ` >> /Contents 4 0 R >>`,
    ),
    Buffer.concat([latin1(`<< /Length ${contenuto.length} >>\nstream\n`), contenuto, latin1("\nendstream")]),
    latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  ];

  for (const { img } of vociImmagini) {
    oggetti.push(
      Buffer.concat([
        latin1(
          `<< /Type /XObject /Subtype /Image /Width ${img.larghezza} /Height ${img.altezza}` +
            ` /ColorSpace /${img.spazio} /BitsPerComponent 8 /Filter /${img.filtro}` +
            ` /Length ${img.dati.length} >>\nstream\n`,
        ),
        img.dati,
        latin1("\nendstream"),
      ]),
    );
  }

  /* --- Il file, con la tabella dei riferimenti. --- */
  const pezzi: Buffer[] = [latin1("%PDF-1.4\n")];
  let posizione = pezzi[0].length;
  const offset: number[] = [];

  oggetti.forEach((corpo, i) => {
    offset.push(posizione);
    const blocco = Buffer.concat([latin1(`${i + 1} 0 obj\n`), corpo, latin1("\nendobj\n")]);
    pezzi.push(blocco);
    posizione += blocco.length;
  });

  const inizioXref = posizione;
  const righe = ["xref", `0 ${oggetti.length + 1}`, "0000000000 65535 f "];
  for (const o of offset) righe.push(`${String(o).padStart(10, "0")} 00000 n `);
  righe.push(
    `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(inizioXref),
    "%%EOF",
  );
  pezzi.push(latin1(righe.join("\n") + "\n"));

  return Buffer.concat(pezzi);
}
