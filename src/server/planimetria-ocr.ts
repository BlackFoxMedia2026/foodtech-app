import sharp from "sharp";
import { createWorker } from "tesseract.js";

/**
 * Le scritte della planimetria, lette dove stanno.
 *
 * ## Perché un OCR e non il modello di visione
 *
 * Il compito è «dimmi dov'è scritto CUCINA». Un modello di visione lo sbaglia
 * di circa un decimo della larghezza — abbastanza da attaccare il nome alla
 * stanza accanto, che è il difetto che ha resistito a quattro strategie
 * diverse di abbinamento. «Dove sta un testo in un'immagine» però è il
 * mestiere dell'OCR da quarant'anni. Misurato sulla stessa planimetria:
 *
 *                       modello di visione   OCR
 *     CUCINA                        ~0,1     0,004
 *     BAR                     mai trovata    0,004
 *     RIP                     mai trovata    0,004
 *     DISP.                         ~0,1     0,003
 *     RISTORO                      ~0,15     0,025 → 0,005 dopo lo scorporo
 *
 * Mezzo secondo, in locale, senza chiamate e senza costo — e soprattutto
 * **sempre lo stesso risultato**, che su una funzione che il ristoratore
 * rifà due volte di fila conta quanto la precisione.
 *
 * ## La modalità conta più della lingua
 *
 * Con la segmentazione normale (quella da documento) tesseract legge tre
 * scritte su sette: presume righe e colonne, e una planimetria non ne ha.
 * In modalità **testo sparso** ne legge sei su sette. È l'unico parametro
 * che ha spostato davvero qualcosa.
 */

export type EtichettaLetta = {
  testo: string;
  /** Centro della scritta, in frazione dell'immagine. */
  x: number;
  y: number;
  confidenza: number;
};

export type NumeroLetto = {
  /** Il valore così com'è scritto: 1126 o 10,80. L'unità si decide dopo. */
  valore: number;
  x: number;
  y: number;
};

export type LetturaOcr = {
  etichette: EtichettaLetta[];
  numeri: NumeroLetto[];
};

/** Sotto questa confidenza è rumore del disegno letto come lettere. */
const CONFIDENZA_MINIMA = 60;

/**
 * Quello che su una planimetria è scritto ma non è il nome di una stanza.
 *
 * Non basta un elenco di parole intere: il riconoscitore spezza le
 * annotazioni e restituisce i cocci. Su una pianta di ristorante «porta a
 * vento» e «porta scorrevole» sono tornate come `portaa` e `orta`, con
 * confidenza 92 e 93 — più alta di `RISTORO`, che è un nome vero. La
 * confidenza non serve a distinguerli: serve il senso delle parole.
 */
const NON_SONO_NOMI = /port|orta|vento|scorrev|sez|scala|quota|pianta|prog\b|tav\b|^h$|^mq$|^mc$|^sf$/i;

/** «OO» sono gli sgabelli del bancone letti come lettere, e `Bi` è un pezzo
 * di muro. Un nome di ambiente ha almeno tre lettere e almeno due diverse. */
export function sembraUnNome(parola: string): boolean {
  const lettere = parola.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettere.length < 3) return false;
  if (new Set(lettere.toLowerCase()).size < 2) return false;
  return !NON_SONO_NOMI.test(lettere);
}

/**
 * Una scritta incollata a una quota — `6,5000RISTORO` — capita spesso: il
 * riconoscitore prende la misura e il nome come una parola sola. Scorporare
 * il nome non basta: va spostato anche il suo centro, altrimenti il punto
 * cade dove finisce il numero e la stanza giusta se lo perde. I caratteri si
 * assumono larghi uguali, che su una scritta corta sbaglia di pochissimo.
 */
export function scorpora(testo: string, x0: number, x1: number): { pulito: string; centro: number } | null {
  const trovato = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’ -]*/.exec(testo);
  if (!trovato) return null;
  const pulito = trovato[0].replace(/[^A-Za-zÀ-ÿ.'’ ]+$/, "").trim();
  if (!pulito) return null;
  const inizio = trovato.index;
  const larghezzaCarattere = (x1 - x0) / Math.max(testo.length, 1);
  return { pulito, centro: x0 + larghezzaCarattere * (inizio + pulito.length / 2) };
}

function comeNumero(testo: string): number | null {
  const pulito = testo.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "");
  if (!/\d/.test(pulito)) return null;
  const valore = Number(pulito.replace(",", "."));
  return Number.isFinite(valore) && valore > 0 ? valore : null;
}

/**
 * Oltre questo tempo si rinuncia e si passa oltre.
 *
 * Un motore esterno che si pianta non deve poter tenere appesa una richiesta
 * del ristoratore: è successo davvero — `tesseract` impacchettato da Next non
 * trovava il suo script e la chiamata non tornava **mai**, senza una riga di
 * errore. Il limite di tempo è la rete di sicurezza che resta anche dopo aver
 * tolto quella causa, perché la prossima sarà un'altra.
 */
const TEMPO_MASSIMO = 25_000;

export async function leggiEtichette(byte: ArrayBuffer): Promise<LetturaOcr | null> {
  return Promise.race([
    leggiDavvero(byte),
    new Promise<null>((risolvi) => setTimeout(() => risolvi(null), TEMPO_MASSIMO)),
  ]);
}

async function leggiDavvero(byte: ArrayBuffer): Promise<LetturaOcr | null> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker("eng");
    // 12 = testo sparso con rilevamento dell'orientamento; 11 è lo stesso
    // senza, e vale da ripiego quando i dati di orientamento non ci sono.
    await worker.setParameters({ tessedit_pageseg_mode: "12" as never });

    const meta = await sharp(Buffer.from(byte), { failOn: "none" }).metadata();
    const { data } = await worker.recognize(Buffer.from(byte), {}, { blocks: true });

    const parole: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = [];
    for (const blocco of data.blocks ?? []) {
      for (const paragrafo of blocco.paragraphs ?? []) {
        for (const riga of paragrafo.lines ?? []) {
          for (const parola of riga.words ?? []) parole.push(parola);
        }
      }
    }
    if (parole.length === 0) return null;

    // Le coordinate di tesseract sono in pixel dell'immagine originale: per
    // riportarle a frazione servono le sue dimensioni vere, non quelle di
    // ciò che ha letto.
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!(W > 0 && H > 0)) return null;

    const etichette: EtichettaLetta[] = [];
    const numeri: NumeroLetto[] = [];

    for (const p of parole) {
      const cy = (p.bbox.y0 + p.bbox.y1) / 2 / H;
      const valore = comeNumero(p.text);
      if (valore !== null && !/[A-Za-zÀ-ÿ]/.test(p.text)) {
        numeri.push({ valore, x: (p.bbox.x0 + p.bbox.x1) / 2 / W, y: cy });
        continue;
      }
      if (p.confidence < CONFIDENZA_MINIMA) continue;
      const scorporato = scorpora(p.text, p.bbox.x0, p.bbox.x1);
      if (!scorporato || !sembraUnNome(scorporato.pulito)) continue;
      etichette.push({
        testo: scorporato.pulito,
        x: scorporato.centro / W,
        y: cy,
        confidenza: p.confidence,
      });
    }

    return { etichette, numeri };
  } catch {
    return null;
  } finally {
    await worker?.terminate().catch(() => {});
  }
}

/**
 * Le dimensioni reali dell'edificio, dalle quote scritte ai margini.
 *
 * La quota complessiva è un numero scritto **fuori** dal disegno: sopra o
 * sotto per la larghezza, a sinistra o a destra per la profondità. L'unità si
 * deduce dalla grandezza, come la legge un umano: `1126` su un disegno edile
 * sono centimetri, `10,80` sono metri. Nessuno quota una sala in millimetri e
 * nessuno costruisce una sala di mille metri.
 *
 * **Prendere il numero più grande non basta.** Su una pianta di ristorante un
 * `88` letto male ha vinto contro il `10,80` vero, e la sala è diventata
 * larga ottantotto metri. Il controllo che lo smaschera è gratis: il rapporto
 * fra larghezza e profondità deve somigliare alla **forma dell'edificio sul
 * foglio**, che conosciamo al pixel. Fra tutte le coppie possibili si
 * sceglie quella che ci assomiglia di più — 10,80 × 9,00 fa 1,20, e
 * l'edificio disegnato sta a 1,20.
 */
export function misureDalleQuote(
  numeri: NumeroLetto[],
  edificio: { x: number; y: number; width: number; height: number },
  /** Quanto è largo l'edificio rispetto a quanto è alto, misurato sul
   * disegno. Senza, si ripiega sul numero più grande. */
  formaEdificio?: number,
): { widthM: number | null; depthM: number | null } {
  const inMetri = (v: number) => (v > 100 ? v / 100 : v);
  const plausibile = (v: number) => v >= 2 && v <= 200;

  const candidati = (elenco: NumeroLetto[]) =>
    [...new Set(elenco.map((n) => inMetri(n.valore)).filter(plausibile))].sort((a, b) => b - a);

  const larghezze = candidati(numeri.filter((n) => n.y < edificio.y || n.y > edificio.y + edificio.height));
  const profondita = candidati(numeri.filter((n) => n.x < edificio.x || n.x > edificio.x + edificio.width));

  if (!formaEdificio || !(formaEdificio > 0)) {
    return { widthM: larghezze[0] ?? null, depthM: profondita[0] ?? null };
  }

  let miglioreW: number | null = null;
  let miglioreD: number | null = null;
  let miglioreScarto = Infinity;
  for (const w of larghezze) {
    for (const d of profondita) {
      // Lo scarto si misura in rapporto e non in differenza: sbagliare di un
      // quinto su una sala lunga o su una corta è lo stesso errore.
      const scarto = Math.abs(Math.log(w / d / formaEdificio));
      if (scarto < miglioreScarto) {
        miglioreScarto = scarto;
        miglioreW = w;
        miglioreD = d;
      }
    }
  }

  // Oltre il 25% di scostamento dalla forma vera non è una quota complessiva:
  // è un numero che passava di lì.
  if (miglioreW !== null && miglioreScarto <= Math.log(1.25)) {
    return { widthM: miglioreW, depthM: miglioreD };
  }
  return { widthM: larghezze[0] ?? null, depthM: profondita[0] ?? null };
}
