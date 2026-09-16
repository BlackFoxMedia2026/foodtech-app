import { deflateSync, inflateSync } from "zlib";

/**
 * Il logo del locale dentro un PDF.
 *
 * ## Perché non una libreria di immagini
 *
 * Perché servono due cose sole, e sono entrambe piccole.
 *
 * Un **JPEG** in un PDF non va convertito: il PDF sa già leggerlo: si scrivono
 * i byte così come sono e si dichiara `DCTDecode`. Sono dieci righe, e leggono
 * solo l'intestazione per sapere quanto è grande.
 *
 * Un **PNG** va aperto, e aprirlo è una cosa sola: `zlib` — che Node ha già —
 * più il passaggio di *unfiltering*, che è la somma riga per riga descritta
 * dallo standard. Da lì si ricompone in RGB e si richiude in `zlib`, che è
 * esattamente il `FlateDecode` che il PDF vuole.
 *
 * Portarsi dentro un decodificatore d'immagini generale — qualche megabyte,
 * spesso con codice nativo — per mettere un logo su un cartoncino sarebbe
 * costato molto più di quanto risparmia. E il logo su un cartoncino conta: è
 * la differenza fra un adesivo qualunque e il tavolo di quel ristorante.
 *
 * ## Quello che non fa, dichiarato
 *
 * Gli SVG non passano di qui: sono disegni, non pixel, e un lettore PDF non li
 * apre. Chi carica un SVG lo vede nell'anteprima e nel PNG; nel PDF il codice
 * esce senza logo, e l'interfaccia lo dice prima di scaricare.
 */

export type ImmaginePdf = {
  larghezza: number;
  altezza: number;
  /** Il filtro da dichiarare nel PDF. */
  filtro: "DCTDecode" | "FlateDecode";
  /** `DeviceRGB` o `DeviceGray`. */
  spazio: "DeviceRGB" | "DeviceGray";
  dati: Buffer;
};

/* -------------------------------------------------------------------------- */
/*  JPEG                                                                      */
/* -------------------------------------------------------------------------- */

const SOF_CON_MISURE = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function leggiJpeg(buf: Buffer): ImmaginePdf | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marcatore = buf[i + 1];
    if (marcatore === 0xd8 || marcatore === 0x01 || (marcatore >= 0xd0 && marcatore <= 0xd7)) {
      i += 2;
      continue;
    }
    const lunghezza = buf.readUInt16BE(i + 2);
    if (SOF_CON_MISURE.has(marcatore)) {
      const altezza = buf.readUInt16BE(i + 5);
      const larghezza = buf.readUInt16BE(i + 7);
      const componenti = buf[i + 9];
      /* Un JPEG in CMYK dentro un PDF richiede anche la tabella di
         trasformazione Adobe: rarissimo per un logo, e sbagliarlo darebbe
         colori invertiti su una stampa. Meglio niente logo che un logo blu. */
      if (componenti !== 1 && componenti !== 3) return null;
      return {
        larghezza,
        altezza,
        filtro: "DCTDecode",
        spazio: componenti === 1 ? "DeviceGray" : "DeviceRGB",
        dati: buf,
      };
    }
    i += 2 + lunghezza;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  PNG                                                                       */
/* -------------------------------------------------------------------------- */

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Ihdr = {
  larghezza: number;
  altezza: number;
  bit: number;
  tipo: number;
  interlacciato: boolean;
};

/** I canali per pixel, secondo il tipo di colore del PNG. */
function canaliPng(tipo: number): number {
  return tipo === 0 ? 1 : tipo === 2 ? 3 : tipo === 3 ? 1 : tipo === 4 ? 2 : 4;
}

/** La somma riga per riga che lo standard chiama «filtering». */
function togliFiltro(grezzo: Buffer, ihdr: Ihdr): Buffer {
  const canali = canaliPng(ihdr.tipo);
  const bitPerPixel = canali * ihdr.bit;
  /* Il passo del filtro è in **byte** e mai meno di uno: sotto gli otto bit
     per pixel i byte contengono più pixel, e il vicino da sottrarre resta il
     byte precedente. */
  const passo = Math.max(1, Math.ceil(bitPerPixel / 8));
  const byteRiga = Math.ceil((ihdr.larghezza * bitPerPixel) / 8);
  const fuori = Buffer.alloc(byteRiga * ihdr.altezza);

  let letto = 0;
  let precedente = Buffer.alloc(byteRiga);
  for (let r = 0; r < ihdr.altezza; r++) {
    const tipo = grezzo[letto++];
    const riga = grezzo.subarray(letto, letto + byteRiga);
    letto += byteRiga;
    const corrente = Buffer.alloc(byteRiga);
    for (let i = 0; i < byteRiga; i++) {
      const x = riga[i] ?? 0;
      const a = i >= passo ? corrente[i - passo] : 0;
      const b = precedente[i];
      const c = i >= passo ? precedente[i - passo] : 0;
      let v: number;
      switch (tipo) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = x;
      }
      corrente[i] = v & 0xff;
    }
    corrente.copy(fuori, r * byteRiga);
    precedente = corrente;
  }
  return fuori;
}

/** Il valore com'è scritto nel file: per la tavolozza è un indice, non un colore. */
function campioneGrezzo(riga: Buffer, indice: number, bit: number): number {
  if (bit === 8) return riga[indice] ?? 0;
  /* A sedici bit si tiene il byte alto: il PDF qui scrive otto bit per canale,
     e un logo non ha bisogno degli altri otto. */
  if (bit === 16) return riga[indice * 2] ?? 0;
  const perByte = 8 / bit;
  const b = riga[Math.floor(indice / perByte)] ?? 0;
  const scarto = 8 - bit * ((indice % perByte) + 1);
  return (b >> scarto) & ((1 << bit) - 1);
}

/** Lo stesso campione, riportato alla scala 0-255. */
function campione(riga: Buffer, indice: number, bit: number): number {
  const v = campioneGrezzo(riga, indice, bit);
  if (bit === 8 || bit === 16) return v;
  return Math.round((v * 255) / ((1 << bit) - 1));
}

function leggiPng(buf: Buffer, sfondo: [number, number, number]): ImmaginePdf | null {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(FIRMA_PNG)) return null;

  let i = 8;
  let ihdr: Ihdr | null = null;
  let tavolozza: Buffer | null = null;
  let trasparenza: Buffer | null = null;
  const pezzi: Buffer[] = [];

  while (i + 8 <= buf.length) {
    const lunghezza = buf.readUInt32BE(i);
    const nome = buf.toString("latin1", i + 4, i + 8);
    const corpo = buf.subarray(i + 8, i + 8 + lunghezza);
    if (nome === "IHDR") {
      ihdr = {
        larghezza: corpo.readUInt32BE(0),
        altezza: corpo.readUInt32BE(4),
        bit: corpo[8],
        tipo: corpo[9],
        interlacciato: corpo[12] === 1,
      };
    } else if (nome === "PLTE") tavolozza = Buffer.from(corpo);
    else if (nome === "tRNS") trasparenza = Buffer.from(corpo);
    else if (nome === "IDAT") pezzi.push(Buffer.from(corpo));
    else if (nome === "IEND") break;
    i += 12 + lunghezza;
  }

  /* L'interlacciamento (Adam7) ricostruisce l'immagine da sette passate: è
     rarissimo in un logo, e implementarlo per quel caso vorrebbe dire scrivere
     codice che non si prova mai. Meglio dire di no. */
  if (!ihdr || ihdr.interlacciato || pezzi.length === 0) return null;
  if (![1, 2, 4, 8, 16].includes(ihdr.bit)) return null;

  let grezzo: Buffer;
  try {
    grezzo = inflateSync(Buffer.concat(pezzi));
  } catch {
    return null;
  }

  const pixel = togliFiltro(grezzo, ihdr);
  const canali = canaliPng(ihdr.tipo);
  const bitPerPixel = canali * ihdr.bit;
  const byteRiga = Math.ceil((ihdr.larghezza * bitPerPixel) / 8);
  const rgb = Buffer.alloc(ihdr.larghezza * ihdr.altezza * 3);

  for (let r = 0; r < ihdr.altezza; r++) {
    const riga = pixel.subarray(r * byteRiga, (r + 1) * byteRiga);
    for (let c = 0; c < ihdr.larghezza; c++) {
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let alfa = 255;

      if (ihdr.tipo === 3) {
        if (!tavolozza) return null;
        const indice = campioneGrezzo(riga, c, ihdr.bit);
        rr = tavolozza[indice * 3] ?? 0;
        gg = tavolozza[indice * 3 + 1] ?? 0;
        bb = tavolozza[indice * 3 + 2] ?? 0;
        alfa = trasparenza ? (trasparenza[indice] ?? 255) : 255;
      } else if (ihdr.tipo === 0 || ihdr.tipo === 4) {
        const base = c * canali;
        rr = gg = bb = campione(riga, base, ihdr.bit);
        if (ihdr.tipo === 4) alfa = campione(riga, base + 1, ihdr.bit);
      } else {
        const base = c * canali;
        rr = campione(riga, base, ihdr.bit);
        gg = campione(riga, base + 1, ihdr.bit);
        bb = campione(riga, base + 2, ihdr.bit);
        if (ihdr.tipo === 6) alfa = campione(riga, base + 3, ihdr.bit);
      }

      /* Il PDF può portare una maschera di trasparenza, ma qui non serve: il
         logo va sopra il riquadro chiaro che il disegno ha già messo sotto, e
         comporlo su quel colore dà lo stesso risultato con un oggetto in meno
         nel file. */
      const q = alfa / 255;
      const p = (r * ihdr.larghezza + c) * 3;
      rgb[p] = Math.round(rr * q + sfondo[0] * (1 - q));
      rgb[p + 1] = Math.round(gg * q + sfondo[1] * (1 - q));
      rgb[p + 2] = Math.round(bb * q + sfondo[2] * (1 - q));
    }
  }

  return {
    larghezza: ihdr.larghezza,
    altezza: ihdr.altezza,
    filtro: "FlateDecode",
    spazio: "DeviceRGB",
    dati: deflateSync(rgb),
  };
}

/**
 * Prepara un'immagine per il PDF, componendola su `sfondo` dove è trasparente.
 *
 * `null` quando il formato non si sa leggere: chi chiama disegna il codice
 * senza logo invece di produrre un PDF rotto.
 */
export function immaginePerPdf(buf: Buffer, sfondo: [number, number, number]): ImmaginePdf | null {
  return leggiJpeg(buf) ?? leggiPng(buf, sfondo);
}
