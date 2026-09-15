/**
 * Il cartoncino da stampare e appoggiare sul tavolo.
 *
 * ## Perché un PDF scritto a mano
 *
 * Serviva un PDF vero — «Scarica PDF da stampa» del brief — e le strade erano
 * due: aggiungere una libreria di generazione PDF, o scriverne uno.
 *
 * Un PDF che contiene **solo rettangoli neri e quattro righe di testo** è un
 * file di poche centinaia di byte, e il formato per questo sottoinsieme è
 * elementare: un catalogo, una pagina, un flusso di comandi di disegno, una
 * tabella di riferimenti. Aggiungere un pacchetto da qualche megabyte per
 * ottenerlo avrebbe portato in casa molto più codice di quanto ne risparmia,
 * e per una superficie che non cambierà.
 *
 * Il vantaggio vero però è un altro: **il codice QR viene disegnato come
 * vettore**, quadrato per quadrato, non come immagine. Stampato resta nitido a
 * qualunque dimensione, da un adesivo di tre centimetri al cartoncino da
 * tavolo — e un QR sfocato è un QR che il telefono non legge, cioè un tavolo
 * che non paga.
 *
 * ## I limiti, dichiarati
 *
 * Usa Helvetica, uno dei font che ogni lettore PDF ha già, quindi non incorpora
 * niente. Il testo è codificato in Latin-1 (`WinAnsiEncoding`), che copre le
 * lettere accentate dell'italiano: per un nome di locale in cirillico o in
 * greco i caratteri fuori tabella diventano un punto interrogativo invece di
 * corrompere il file.
 */

/** Un punto PostScript è 1/72 di pollice: A6 è 105 × 148 mm. */
const A6 = { larghezza: 297.64, altezza: 419.53 };

/** Il testo come lo vuole un PDF: parentesi e barre rovesciate vanno protette. */
function testoPdf(v: string): string {
  return v.replace(/[\\()]/g, (c) => `\\${c}`);
}

/**
 * Da UTF-8 a Latin-1, che è ciò che `WinAnsiEncoding` sa leggere.
 *
 * Quello che non ci sta diventa `?`. È una perdita visibile e innocua; la
 * sola alternativa seria sarebbe incorporare un font Unicode, cioè portarsi
 * dentro qualche centinaio di chilobyte di font per stampare il nome di un
 * ristorante.
 */
function latin1(v: string): Buffer {
  return Buffer.from(
    [...v].map((c) => (c.charCodeAt(0) <= 0xff ? c : "?")).join(""),
    "latin1",
  );
}

export type ModuliQr = {
  /** Quanti quadrati per lato. */
  size: number;
  /** `true` dove il quadrato è nero. Lungo `size * size`. */
  data: { get(i: number): number } | Uint8Array | boolean[];
};

/**
 * Compone il cartoncino.
 *
 * `moduli` è la matrice che restituisce `QRCode.create(...).modules`: si
 * lavora sui quadrati e non sull'immagine, per il motivo detto sopra.
 */
export function cartoncinoQr(opts: {
  moduli: ModuliQr;
  locale: string;
  tavolo: string;
  invito: string;
  piede: string;
}): Buffer {
  const { moduli } = opts;
  // Il margine fa anche da «zona di quiete»: un QR ha bisogno di bianco
  // attorno per essere letto, e qui sono una cinquantina di punti, cioè una
  // decina di moduli — il doppio abbondante dei quattro richiesti.
  const margine = 55;
  const latoQr = A6.larghezza - margine * 2;
  const passo = latoQr / moduli.size;
  /** Il bordo superiore del codice. Sotto restano due righe di testo. */
  const baseQr = A6.altezza - 125;

  const nero = (i: number): boolean => {
    const d = moduli.data as { get?: (n: number) => number } & ArrayLike<number | boolean>;
    const v = typeof d.get === "function" ? d.get(i) : d[i];
    return !!v;
  };

  /* --- I quadrati del codice. --- */
  const disegno: string[] = ["0 0 0 rg"];
  for (let riga = 0; riga < moduli.size; riga++) {
    for (let col = 0; col < moduli.size; col++) {
      if (!nero(riga * moduli.size + col)) continue;
      const x = margine + col * passo;
      // L'origine del PDF è in basso a sinistra, quella della matrice in alto:
      // la riga si specchia, altrimenti il codice esce capovolto e illeggibile.
      const y = baseQr - (riga + 1) * passo;
      // Un filo di sovrapposizione: senza, fra un quadrato e l'altro resta una
      // fessura bianca da arrotondamento che alcune stampanti marcano, e un QR
      // con le righe bianche è un QR che il telefono non legge. È in
      // proporzione al modulo e non un valore fisso, così vale anche su un
      // adesivo piccolo — dove mezzo punto sarebbe un decimo del quadrato e
      // chiuderebbe il codice invece di risanarlo.
      const lato = (passo * 1.04).toFixed(2);
      disegno.push(`${x.toFixed(2)} ${y.toFixed(2)} ${lato} ${lato} re f`);
    }
  }

  /* --- Il testo. --- */
  const centro = (t: string, dimensione: number, y: number, grassetto = false) => {
    // La larghezza media di Helvetica è circa 0,5 em; per centrare quattro
    // righe di testo è un'approssimazione che basta, e non richiede di
    // portarsi dentro le tabelle di avanzamento del font.
    const larghezza = t.length * dimensione * (grassetto ? 0.55 : 0.5);
    const x = (A6.larghezza - larghezza) / 2;
    return `BT /${grassetto ? "FB" : "FR"} ${dimensione} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${testoPdf(t)}) Tj ET`;
  };

  disegno.push(centro(opts.locale, 15, A6.altezza - 58, true));
  disegno.push(centro(`TAVOLO ${opts.tavolo}`, 26, A6.altezza - 96, true));
  const fondoQr = baseQr - latoQr;
  disegno.push(centro(opts.invito, 12, fondoQr - 32));
  disegno.push("0.4 0.4 0.4 rg");
  disegno.push(centro(opts.piede, 8.5, 38));

  const contenuto = latin1(disegno.join("\n"));

  /* --- Gli oggetti del file. --- */
  const oggetti: Buffer[] = [
    latin1("<< /Type /Catalog /Pages 2 0 R >>"),
    latin1("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    latin1(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A6.larghezza.toFixed(2)} ${A6.altezza.toFixed(
        2,
      )}] /Resources << /Font << /FR 5 0 R /FB 6 0 R >> >> /Contents 4 0 R >>`,
    ),
    Buffer.concat([
      latin1(`<< /Length ${contenuto.length} >>\nstream\n`),
      contenuto,
      latin1("\nendstream"),
    ]),
    latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  ];

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
  const righe = [`xref`, `0 ${oggetti.length + 1}`, `0000000000 65535 f `];
  for (const o of offset) righe.push(`${String(o).padStart(10, "0")} 00000 n `);
  righe.push(
    `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>`,
    `startxref`,
    String(inizioXref),
    `%%EOF`,
  );
  pezzi.push(latin1(righe.join("\n") + "\n"));

  return Buffer.concat(pezzi);
}
