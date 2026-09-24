/**
 * Quante voci entrano nella barra, e **in quale forma** — deciso sullo spazio
 * che la fila ha davvero, non sulla larghezza della finestra.
 *
 * Le soglie fisse (1280, 1536 px) sbagliavano in due direzioni: non sapevano
 * quanto è lungo il nome del locale a sinistra, né se a destra c'è anche
 * l'indicatore del telefono. A 1440 px, con «Aurora Bistrot» e nove voci, la
 * pillola finiva sotto la sfera dell'agente. Adesso la fila si misura, e il
 * conto è questo, nell'ordine:
 *
 * 1. **ampia** — tutte le voci col nome intero e il respiro pieno;
 * 2. **riga** — tutte le voci, con meno spazio fra icona e bordo;
 * 3. **riga con «Altro»** — il nome resta intero, le ultime voci passano nel
 *    menu. Vale finché in riga ne restano almeno `minimoInRiga`;
 * 4. **pila** — il nome sotto l'icona, come nella barra del telefono, e
 *    quello che non entra ancora in «Altro».
 *
 * Il testo non si accorcia mai oltre la forma della pila: prima di comprimere
 * una parola si sposta una voce.
 *
 * La voce accesa **non finisce mai dentro «Altro»**: se il suo posto in fila
 * è oltre il limite, cede il posto l'ultima voce visibile. Una barra che non
 * dice dove si è non sta facendo il suo lavoro.
 */

export type Forma = "ampia" | "riga" | "pila";

export const FORME: readonly Forma[] = ["ampia", "riga", "pila"];

export type Disposizione = {
  forma: Forma;
  /** Gli indici delle voci che stanno in barra, nell'ordine della barra. */
  visibili: number[];
};

export function disponiFila({
  spazio,
  larghezze,
  altro,
  attiva,
  gap,
  cornice,
  minimoInRiga = 5,
}: {
  /** La larghezza a disposizione della fila, cornice compresa. */
  spazio: number;
  /** La larghezza di ogni voce, per forma, nell'ordine della barra. */
  larghezze: Record<Forma, number[]>;
  /** La larghezza del pulsante «Altro», per forma. */
  altro: Record<Forma, number>;
  /** L'indice della voce accesa, o -1. */
  attiva: number;
  /** Lo spazio fra due voci. */
  gap: number;
  /** Bordo e imbottitura della pillola, sommati sui due lati. */
  cornice: number;
  /** Sotto questo numero di voci in riga si passa alla pila. */
  minimoInRiga?: number;
}): Disposizione {
  const n = larghezze.riga.length;
  const tutte = Array.from({ length: n }, (_, i) => i);

  const intera = (forma: Forma) =>
    cornice + somma(larghezze[forma]) + gap * Math.max(0, n - 1) <= spazio;

  if (intera("ampia")) return { forma: "ampia", visibili: tutte };
  if (intera("riga")) return { forma: "riga", visibili: tutte };

  const riga = conAltro(larghezze.riga, altro.riga, spazio, cornice, gap, attiva);
  if (riga.length >= Math.min(minimoInRiga, n)) return { forma: "riga", visibili: riga };

  if (intera("pila")) return { forma: "pila", visibili: tutte };
  return {
    forma: "pila",
    visibili: conAltro(larghezze.pila, altro.pila, spazio, cornice, gap, attiva),
  };
}

/** Le voci che entrano quando in fondo alla fila c'è anche «Altro». */
function conAltro(
  larghezze: number[],
  altro: number,
  spazio: number,
  cornice: number,
  gap: number,
  attiva: number,
): number[] {
  // Ogni voce porta con sé il suo gap: dopo l'ultima viene sempre «Altro».
  const budget = spazio - cornice - altro;
  const prese: number[] = [];
  let usato = 0;
  for (let i = 0; i < larghezze.length; i++) {
    if (usato + larghezze[i] + gap > budget) break;
    prese.push(i);
    usato += larghezze[i] + gap;
  }

  if (attiva >= 0 && !prese.includes(attiva)) {
    while (prese.length > 0 && usato + larghezze[attiva] + gap > budget) {
      const tolta = prese.pop()!;
      usato -= larghezze[tolta] + gap;
    }
    // Le voci prese stanno tutte prima della accesa: aggiungerla in coda
    // mantiene l'ordine della barra.
    prese.push(attiva);
  }
  return prese;
}

function somma(valori: number[]) {
  return valori.reduce((a, b) => a + b, 0);
}
