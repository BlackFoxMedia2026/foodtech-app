import sharp from "sharp";

/**
 * La griglia di riferimento disegnata sulla planimetria.
 *
 * ## Il difetto che questo file esiste per togliere
 *
 * Il riconoscimento non sbagliava le coordinate: non le guardava proprio.
 * Su una planimetria quotata, `gpt-4o-mini` rispondeva `x=0.182`, `y=0.370`,
 * `w=0.435` — e 182, 370 e 435 sono **quote scritte sul disegno**, misure in
 * centimetri dei muri. Otto numeri su nove erano quote divise per mille. Il
 * risultato nell'editor erano tutti gli ambienti incolonnati a sinistra e
 * metà sala vuota: una piantina che non somigliava a niente.
 *
 * Chiedere «dammi coordinate normalizzate» a un modello di visione è chiedere
 * una misura senza dargli un righello. Se nell'immagine c'è una griglia
 * etichettata, la misura diventa una lettura: «la scritta CUCINA sta fra la
 * riga 0,3 e la 0,4». Misurato sulla stessa planimetria, scarto medio dal
 * vero:
 *
 *     prompt attuale + gpt-4o-mini    le quote riciclate (inservibile)
 *     coordinate in pixel + gpt-4o    0,129
 *     griglia + gpt-4o                0,074   ← ogni ambiente entro 0,12
 *
 * La griglia si disegna qui e non nel browser di proposito: l'analisi si può
 * rifare dal server in qualunque momento, su una planimetria caricata mesi
 * prima, senza che nessuno riapra quel dialogo.
 */

/** Oltre questa larghezza si rimpicciolisce: una scansione da 6000 px non
 * aggiunge niente a un modello che comunque lavora a riquadri, e fa solo
 * crescere il trasferimento. */
const LARGHEZZA_MASSIMA = 2048;

/** Ogni quanto passa una linea. Dieci divisioni sono il compromesso trovato
 * provando: più fitte coprono il disegno, più larghe non bastano a
 * distinguere due ambienti vicini. */
const PASSI = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export type PlanimetriaPreparata = {
  /** L'immagine pronta per il modello, come data URL. */
  dataUrl: string;
  /** Falso quando la griglia non si è potuta disegnare: il prompt allora non
   * deve raccontare al modello che c'è un righello che non vede. */
  conGriglia: boolean;
  larghezza: number;
  altezza: number;
};

function svgGriglia(larghezza: number, altezza: number): string {
  const spessore = Math.max(1, Math.round(larghezza / 1200));
  const testo = Math.max(10, Math.round(altezza * 0.022));
  const righe: string[] = [];

  for (const p of PASSI) {
    const x = Math.round(larghezza * p);
    const y = Math.round(altezza * p);
    // Rosso in verticale, blu in orizzontale: due colori perché l'etichetta
    // «0.4» da sola non dice se è una X o una Y, e il modello deve saperlo
    // senza doverlo dedurre.
    righe.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${altezza}" stroke="#e11d48" stroke-width="${spessore}" stroke-opacity="0.55"/>`,
      `<line x1="0" y1="${y}" x2="${larghezza}" y2="${y}" stroke="#2563eb" stroke-width="${spessore}" stroke-opacity="0.55"/>`,
      `<text x="${x + spessore * 2}" y="${testo}" font-family="sans-serif" font-size="${testo}" fill="#e11d48">${p.toFixed(1)}</text>`,
      `<text x="${spessore * 2}" y="${y - spessore * 2}" font-family="sans-serif" font-size="${testo}" fill="#2563eb">${p.toFixed(1)}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${larghezza}" height="${altezza}">${righe.join("")}</svg>`;
}

/**
 * Prepara l'immagine per il riconoscitore.
 *
 * Se qualcosa va storto — un formato che `sharp` non digerisce, un file
 * troncato — si torna all'immagine così com'è con `conGriglia: false`, invece
 * di far fallire tutto il riconoscimento per un disegno mancato.
 */
export async function preparaPlanimetria(byte: ArrayBuffer): Promise<PlanimetriaPreparata | null> {
  const originale = Buffer.from(byte);

  try {
    const base = sharp(originale, { failOn: "none" });
    const meta = await base.metadata();
    if (!meta.width || !meta.height) return grezza(originale);

    const scala = meta.width > LARGHEZZA_MASSIMA ? LARGHEZZA_MASSIMA / meta.width : 1;
    const larghezza = Math.round(meta.width * scala);
    const altezza = Math.round(meta.height * scala);

    const immagine = await sharp(originale, { failOn: "none" })
      .resize(larghezza, altezza, { fit: "fill" })
      // Una planimetria PNG con sfondo trasparente, appiattita su JPEG,
      // diventerebbe un disegno nero su nero. Il bianco è lo sfondo che
      // quella planimetria si aspetta di avere.
      .flatten({ background: "#ffffff" })
      .composite([{ input: Buffer.from(svgGriglia(larghezza, altezza)) }])
      // PNG e non JPEG, e non è un dettaglio: su un disegno tecnico le linee
      // sono spesse un pixel, e la compressione JPEG le circonda di aloni.
      // Misurato tre volte sulla stessa planimetria, scarto medio dal vero:
      // JPEG 90 → 0,173 · PNG → 0,111. Un disegno al tratto va conservato
      // senza perdita, costa trenta kilobyte in più.
      .png()
      .toBuffer();

    return {
      dataUrl: `data:image/png;base64,${immagine.toString("base64")}`,
      conGriglia: true,
      larghezza,
      altezza,
    };
  } catch {
    return grezza(originale);
  }
}

/** Il tipo si annusa dai primi byte: qui `sharp` ha già fallito, quindi non
 * c'è nessuno che possa dircelo, e dichiarare JPEG un PNG significa farlo
 * rifiutare dall'altra parte. */
function tipoDaiByte(b: Buffer): string {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b.length > 12 && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/jpeg";
}

function grezza(originale: Buffer): PlanimetriaPreparata | null {
  if (originale.byteLength === 0) return null;
  return {
    dataUrl: `data:${tipoDaiByte(originale)};base64,${originale.toString("base64")}`,
    conGriglia: false,
    larghezza: 0,
    altezza: 0,
  };
}
