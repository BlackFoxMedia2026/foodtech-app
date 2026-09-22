import OpenAI from "openai";
import { z } from "zod";
import {
  FloorPlanAnalysisSchema,
  type FloorPlanAnalysis,
} from "@/lib/floorplan-analysis";
import { leggiFile } from "@/server/archivio-file";
import { preparaPlanimetria, type PlanimetriaPreparata } from "@/server/planimetria-griglia";
import { rilevaStanze, type RegioneTrovata, type RilevamentoPixel } from "@/server/planimetria-pixel";
import { leggiEtichette, misureDalleQuote, type EtichettaLetta, type LetturaOcr } from "@/server/planimetria-ocr";
import { normalizzaTipoArea } from "@/lib/floorplan-analysis";

/**
 * Il riconoscimento della planimetria.
 *
 * Una funzione sola, con due strade dentro: il modello di visione quando c'è
 * una chiave e un'immagine che si può guardare, un perimetro di ripiego
 * quando non c'è. Il ripiego **non finge**: mette `source: "fallback"` nel
 * risultato e una riga in `note`, e l'interfaccia dice al ristoratore che la
 * piantina è un punto di partenza da correggere, non una lettura del suo
 * locale. Una piantina inventata spacciata per riconosciuta è peggio di
 * nessuna piantina: si scopre quando un cameriere cerca un tavolo dove non
 * c'è.
 *
 * Il contratto verso l'esterno (`FloorPlanAnalysis`) è lo stesso nei due
 * casi, quindi sostituire questa implementazione con una chiamata a un
 * servizio di computer vision dedicato non tocca una riga dell'editor.
 */

const VISION_MODELS_DEFAULT = "gpt-4o-mini";

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

/** Il modello guarda immagini: i PDF non li può leggere, e fingere il
 * contrario significherebbe spendere una chiamata per ricevere un rifiuto. */
const TIPI_IMMAGINE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function tipoImmagine(url: string): string | null {
  const path = url.split("?")[0].toLowerCase();
  const ext = Object.keys(TIPI_IMMAGINE).find((e) => path.endsWith(e));
  return ext ? TIPI_IMMAGINE[ext] : null;
}

/** Limite di sicurezza: il caricamento ne accetta 10 MB, e in base64 ne
 * diventano circa 13,3. Oltre non si prova nemmeno. */
const MAX_BYTE_IMMAGINE = 10 * 1024 * 1024;

/**
 * L'immagine arriva al modello **come dato, non come indirizzo**.
 *
 * Passare l'URL sarebbe più corto, ma vorrebbe dire che il riconoscimento
 * funziona solo quando la planimetria sta su un indirizzo pubblico
 * raggiungibile da fuori. Non è il caso di un archivio privato, non è il caso
 * di un ambiente di sviluppo, e non è una cosa che l'utente possa capire dal
 * messaggio d'errore. Leggerla qui costa un trasferimento in più e toglie una
 * condizione invisibile al funzionamento.
 *
 * `leggiFile` sa da quale dei due archivi viene l'indirizzo: se è quello della
 * cartella locale i byte si prendono dal disco, senza che il server faccia una
 * richiesta HTTP a sé stesso mentre ne sta servendo un'altra.
 */
async function immagineComeDato(url: string): Promise<PlanimetriaPreparata | null> {
  if (!tipoImmagine(url)) return null;
  const buffer = await leggiFile(url);
  if (!buffer) return null;
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTE_IMMAGINE) return null;
  // Qui sopra l'immagine prende la griglia di riferimento: senza, il modello
  // non misura, indovina. Vedi `server/planimetria-griglia.ts`.
  return preparaPlanimetria(buffer);
}


/* ------------------------------------------------------------------ *
 * La strada buona: geometria dai pixel, nomi dal modello
 * ------------------------------------------------------------------ */

/**
 * Al modello si chiede quello che sa fare: leggere.
 *
 * Le stanze sono già state trovate e numerate sull'immagine da
 * `server/planimetria-pixel.ts`. Qui non si chiede più «dove sono»: si chiede
 * «come si chiama la numero 3» — e per le quote, quanto misura davvero la
 * sala. Due domande a cui un modello di visione risponde bene, al posto di una
 * misura che non sa prendere.
 */

/* ------------------------------------------------------------------ *
 * Geometria dai pixel, nomi dall'OCR
 * ------------------------------------------------------------------ */

/** Una regione senza nessuna scritta dentro è una stanza solo se è grande.
 * Sotto questa soglia, e senza un nome che la reclami, è un tavolo, una sedia
 * o l'arco di una porta: su una pianta di ristorante ne ho contati venti. */
const AREA_SENZA_NOME = 0.01;

type Stanza = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: string;
  label: string | null;
};

/** Il riquadro più stretto che contiene il punto: fra una sala e la nicchia
 * dentro la sala, la scritta appartiene alla nicchia. */
function regioneCheContiene(regioni: RegioneTrovata[], e: EtichettaLetta): RegioneTrovata | null {
  let scelta: RegioneTrovata | null = null;
  for (const r of regioni) {
    if (e.x < r.x || e.x > r.x + r.width || e.y < r.y || e.y > r.y + r.height) continue;
    if (!scelta || r.area < scelta.area) scelta = r;
  }
  return scelta;
}

/**
 * Una stanza con più scritte dentro si divide fra quelle scritte.
 *
 * È il caso che ci ha fatto sbagliare la sala di un ristorante: fra il ristoro
 * e il bar **non c'è un muro**. Lo spazio è unico e il bancone è un arredo,
 * quindi il calcolo sui pixel li unisce — e ha ragione. Il «BAR» esiste
 * perché c'è scritto BAR, non perché ci sia una parete.
 *
 * La divisione si fa a metà strada fra una scritta e l'altra, lungo il lato
 * in cui sono più distanti fra loro. Non è il confine vero, è il confine
 * ragionevole: sulla pianta di prova cade a 0,49 dove il bancone sta a 0,55.
 */
function dividiTraScritte(r: RegioneTrovata, dentro: EtichettaLetta[]): Stanza[] {
  if (dentro.length === 1) {
    return [
      {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        kind: normalizzaTipoArea(null, dentro[0].testo),
        label: dentro[0].testo,
      },
    ];
  }

  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
  const orizzontale = spread(dentro.map((e) => e.x)) >= spread(dentro.map((e) => e.y));
  const ordinate = [...dentro].sort((a, b) => (orizzontale ? a.x - b.x : a.y - b.y));
  const inizio = orizzontale ? r.x : r.y;
  const lunghezza = orizzontale ? r.width : r.height;

  return ordinate.map((e, i) => {
    const prima = i === 0 ? inizio : ((orizzontale ? ordinate[i - 1].x : ordinate[i - 1].y) + (orizzontale ? e.x : e.y)) / 2;
    const dopo =
      i === ordinate.length - 1
        ? inizio + lunghezza
        : ((orizzontale ? e.x : e.y) + (orizzontale ? ordinate[i + 1].x : ordinate[i + 1].y)) / 2;
    return {
      x: orizzontale ? prima : r.x,
      y: orizzontale ? r.y : prima,
      width: orizzontale ? dopo - prima : r.width,
      height: orizzontale ? r.height : dopo - prima,
      kind: normalizzaTipoArea(null, e.testo),
      label: e.testo,
    };
  });
}

function componiDaOcr(
  rilevamento: RilevamentoPixel,
  ocr: LetturaOcr,
  input: AnalyzeInput,
): FloorPlanAnalysis | null {
  const dentroA = new Map<number, EtichettaLetta[]>();
  for (const e of ocr.etichette) {
    const r = regioneCheContiene(rilevamento.regioni, e);
    if (!r) continue;
    const elenco = dentroA.get(r.numero) ?? [];
    elenco.push(e);
    dentroA.set(r.numero, elenco);
  }

  const stanze: Stanza[] = [];
  for (const r of rilevamento.regioni) {
    const scritte = dentroA.get(r.numero);
    if (scritte && scritte.length > 0) {
      stanze.push(...dividiTraScritte(r, scritte));
    } else if (r.area >= AREA_SENZA_NOME) {
      stanze.push({ x: r.x, y: r.y, width: r.width, height: r.height, kind: "AREA_ZONE", label: null });
    }
  }
  if (stanze.length === 0) return null;

  const edificio = rilevamento.edificio;
  // La forma dell'edificio sul disegno: serve a riconoscere quale coppia di
  // numeri è davvero la quota complessiva.
  const forma =
    (edificio.width * rilevamento.larghezza) / Math.max(edificio.height * rilevamento.altezza, 1);
  const quote = misureDalleQuote(ocr.numeri, edificio, forma);

  return assembla(riferiteAllEdificio(stanze, edificio), {
    widthM: input.hintWidthM ?? quote.widthM ?? 12,
    depthM: input.hintDepthM ?? quote.depthM ?? 8,
  });
}

/**
 * Le coordinate si riferiscono **all'edificio**, non al foglio.
 *
 * È il difetto che si vedeva a occhio nell'editor e che nessuna misura di
 * precisione avrebbe mai mostrato: `analysisToElements` moltiplica la
 * coordinata per la larghezza della sala in metri, quindi per lui `0` è il
 * muro di sinistra e `1` è quello di destra. Noi gli passavamo coordinate
 * riferite all'immagine, dove il disegno è circondato da quote, sezioni e
 * margini bianchi e l'edificio occupa sì e no due terzi.
 *
 * Il risultato era una pianta **disegnata al 64% e spostata in alto a
 * sinistra**: i rapporti fra le stanze restavano giusti, le misure no. Dieci
 * metri e ottanta di sala diventavano sedici, e la cucina finiva in mezzo
 * alla sala invece che contro il muro.
 */
function riferiteAllEdificio(
  stanze: Stanza[],
  edificio: { x: number; y: number; width: number; height: number },
): Stanza[] {
  const w = edificio.width || 1;
  const h = edificio.height || 1;
  const fuori: Stanza[] = [];

  for (const s of stanze) {
    const x1 = (s.x - edificio.x) / w;
    const y1 = (s.y - edificio.y) / h;
    const x2 = x1 + s.width / w;
    const y2 = y1 + s.height / h;

    // Tagliata ai muri. Un riquadro che sborda fuori dall'edificio ha preso
    // dentro il corridoio delle linee di quota, che sul foglio sta di fianco
    // al disegno e nella sala non esiste.
    const cx1 = Math.min(Math.max(x1, 0), 1);
    const cy1 = Math.min(Math.max(y1, 0), 1);
    const cx2 = Math.min(Math.max(x2, 0), 1);
    const cy2 = Math.min(Math.max(y2, 0), 1);
    const larghezza = cx2 - cx1;
    const altezza = cy2 - cy1;
    if (larghezza <= 0.005 || altezza <= 0.005) continue;

    // Se dopo il taglio ne resta meno di metà, quel riquadro era soprattutto
    // margine: non è una stanza.
    const intero = (x2 - x1) * (y2 - y1);
    if (intero > 0 && (larghezza * altezza) / intero < 0.5) continue;

    fuori.push({ ...s, x: cx1, y: cy1, width: larghezza, height: altezza });
  }
  return fuori;
}

/** Perimetro e tramezzi dai riquadri, e l'analisi che ne esce. Le stanze
 * arrivano già riferite all'edificio, quindi il perimetro è tutto il mondo. */
function assembla(stanze: Stanza[], misure: { widthM: number; depthM: number }): FloorPlanAnalysis | null {
  const t = 0.012;
  const esito = FloorPlanAnalysisSchema.safeParse({
    version: 1,
    source: "ai",
    confidence: 0.9,
    widthM: misure.widthM,
    depthM: misure.depthM,
    walls: [
      { x1: 0, y1: 0, x2: 1, y2: 0, thickness: t },
      { x1: 1, y1: 0, x2: 1, y2: 1, thickness: t },
      { x1: 1, y1: 1, x2: 0, y2: 1, thickness: t },
      { x1: 0, y1: 1, x2: 0, y2: 0, thickness: t },
    ],
    dividers: stanze.flatMap((s) => [
      { x1: s.x, y1: s.y, x2: s.x + s.width, y2: s.y, thickness: t / 2 },
      { x1: s.x + s.width, y1: s.y, x2: s.x + s.width, y2: s.y + s.height, thickness: t / 2 },
      { x1: s.x + s.width, y1: s.y + s.height, x2: s.x, y2: s.y + s.height, thickness: t / 2 },
      { x1: s.x, y1: s.y + s.height, x2: s.x, y2: s.y, thickness: t / 2 },
    ]),
    rooms: stanze,
  });
  return esito.success ? esito.data : null;
}


const PROMPT_NOMI = `Ricevi una planimetria con sopra una GRIGLIA di riferimento: linee ROSSE verticali etichettate 0.1 ... 0.9 (coordinata X) e linee BLU orizzontali etichettate 0.1 ... 0.9 (coordinata Y).

Il tuo compito e' LEGGERE, non misurare. Due cose.

1) Le SCRITTE che danno il nome agli ambienti: CUCINA, SALA, BAGNO, WC, LAVANDERIA, DISPENSA, SOGGIORNO, MAGAZZINO, UFFICIO, INGRESSO, TERRAZZA... Per ognuna dimmi il testo e dove si trova il CENTRO DI QUELLA SCRITTA, letto sulla griglia — la posizione delle lettere sul foglio, non della stanza.
   - "kind": ESATTAMENTE uno di AREA_ZONE, AREA_KITCHEN, AREA_BAR, AREA_WC, AREA_STORAGE, AREA_PRIVATE, AREA_ENTRANCE, AREA_TERRACE, AREA_STAIRS. Se l'ambiente non rientra in nessuno (soggiorno, camera, corridoio) usa AREA_ZONE.
   - NON elencare le quote (182, 1126, 85...), le sigle di sezione (A, B), le altezze (H=m 2.85) ne' le superfici (S=mq 15.11): solo i nomi degli ambienti.

2) Le QUOTE COMPLESSIVE, per sapere quanto misura l'edificio in METRI. Attenzione all'unita': su un disegno edile 1126 sono centimetri, cioe' 11,26 m. La quota complessiva orizzontale va in "widthM", quella complessiva verticale in "depthM", mai due quote dello stesso lato. Se non ci sono quote, stima e abbassa la confidenza.

Rispondi SOLO con JSON: {"scritte":[{"testo":"CUCINA","x":0.42,"y":0.30,"kind":"AREA_KITCHEN"}],"widthM":0,"depthM":0,"confidence":0}`;

const NomiSchema = z.object({
  scritte: z
    .array(
      z.object({
        testo: z.string().min(1).max(40),
        x: z.coerce.number().min(-0.5).max(1.5),
        y: z.coerce.number().min(-0.5).max(1.5),
        kind: z.string().nullable().default(null),
      }),
    )
    .max(60)
    .default([]),
  widthM: z.coerce.number().min(1).max(500).nullable().default(null),
  depthM: z.coerce.number().min(1).max(500).nullable().default(null),
  confidence: z.coerce.number().min(0).max(1).default(0.6),
});

async function leggiNomi(ai: OpenAI, immagine: PlanimetriaPreparata) {
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || VISION_MODELS_DEFAULT;
  const completion = await ai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 2000,
    messages: [
      { role: "system", content: PROMPT_NOMI },
      {
        role: "user",
        content: [
          { type: "text", text: "Leggi i nomi degli ambienti di questa planimetria e le quote complessive." },
          { type: "image_url", image_url: { url: immagine.dataUrl, detail: "high" } },
        ],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("empty_response");
  const esito = NomiSchema.safeParse(JSON.parse(stripCodeFence(raw)));
  if (!esito.success) throw new Error("invalid_shape");
  return esito.data;
}

/** Sotto questa area una regione senza nome è un ritaglio, non una stanza:
 * si tiene solo se una scritta la reclama. */
const AREA_DEGNA_DI_NOME = 0.01;

/**
 * Oltre questa distanza dal bordo del riquadro, una scritta non gli
 * appartiene.
 *
 * È stretta apposta. Il modello sbaglia la posizione di una scritta di circa
 * un decimo, e un decimo basta a cadere nella stanza accanto: allargando la
 * soglia si guadagnano due nomi e se ne sbaglia uno. Ma un riquadro **senza
 * nome** nell'editor si rinomina in un clic, mentre un riquadro col nome
 * sbagliato è una trappola — il ristoratore lo legge, si fida, e se ne accorge
 * il giorno in cui un cameriere cerca la dispensa dove c'è il bagno.
 */
const DISTANZA_MASSIMA = 0.06;

function componiDaPixel(
  rilevamento: RilevamentoPixel,
  nomi: z.infer<typeof NomiSchema>,
  input: AnalyzeInput,
): FloorPlanAnalysis | null {
  /*
    L'abbinamento lo facciamo noi, e questo è il punto di tutto il file.

    Chiedere al modello «come si chiama il riquadro numero 3» sembrava più
    diretto, ed è stato provato: appiccicava lo stesso nome a tutti e otto i
    riquadri, soggiorno compreso. Abbinare numeri a rettangoli è un compito
    visivo che sbaglia. Leggere una scritta e dire dov'è, invece, lo fa bene:
    sbaglia la posizione di un decimo scarso, che su riquadri che *noi*
    conosciamo al pixel basta e avanza.

    Una scritta che cade dentro un riquadro è il nome di quel riquadro. Se non
    cade dentro nessuno, va al più vicino, ma solo se è davvero vicino.
  */
  /*
    Scritta e riquadro si sposano solo se **si scelgono a vicenda**, e solo se
    la scritta cade dentro il riquadro o a un soffio dal bordo.

    Quattro strade sono state provate e misurate su questa planimetria. Tenere
    i riquadri numerati sull'immagine e chiedere «come si chiama il 3»: il
    modello appiccica lo stesso nome a tutti. Dargli i riquadri come elenco di
    coordinate: chiama «cucina» il salone. Abbinare partendo dalle scritte:
    «SOGGIORNO» si attacca al primo ritaglio vicino. Partendo dai riquadri: il
    bovindo ruba «CUCINA». Il gradimento reciproco con soglia stretta è
    l'unica che non produce nomi sbagliati — ne produce di mancanti, che è il
    danno che si ripara in un clic.

    La distanza si misura dal **bordo** e non dal centro: il centro di un
    salone è lontano da qualunque scritta, e misurando da lì un ripostiglio
    vicino alla scritta vincerebbe sempre contro la stanza a cui quella
    scritta appartiene.
  */
  const distanza = (r: { x: number; y: number; width: number; height: number }, i: number) => {
    const s = nomi.scritte[i];
    const dx = Math.max(r.x - s.x, 0, s.x - (r.x + r.width));
    const dy = Math.max(r.y - s.y, 0, s.y - (r.y + r.height));
    return Math.hypot(dx, dy);
  };

  const nomeDi = new Map<number, { label: string; kind: string | null }>();
  for (const r of rilevamento.regioni) {
    let miglioreScritta = -1;
    let d1 = Infinity;
    nomi.scritte.forEach((_, i) => {
      const d = distanza(r, i);
      if (d < d1) {
        d1 = d;
        miglioreScritta = i;
      }
    });
    if (miglioreScritta < 0 || d1 > DISTANZA_MASSIMA) continue;

    // ...e quella scritta deve scegliere questo riquadro. A parità vince il
    // primo dell'elenco, che è il più grande: la scritta di una sala sta
    // dentro la sala, non nella nicchia attaccata.
    let miglioreRegione = -1;
    let d2 = Infinity;
    for (const altra of rilevamento.regioni) {
      const d = distanza(altra, miglioreScritta);
      if (d < d2) {
        d2 = d;
        miglioreRegione = altra.numero;
      }
    }
    if (miglioreRegione !== r.numero) continue;

    nomeDi.set(r.numero, {
      label: nomi.scritte[miglioreScritta].testo,
      kind: nomi.scritte[miglioreScritta].kind,
    });
  }

  const stanze: Stanza[] = rilevamento.regioni
    .filter((r) => nomeDi.has(r.numero) || r.area >= AREA_DEGNA_DI_NOME)
    .map((r) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      kind: normalizzaTipoArea(nomeDi.get(r.numero)?.kind, nomeDi.get(r.numero)?.label),
      label: nomeDi.get(r.numero)?.label ?? null,
    }));

  if (stanze.length === 0) return null;

  // Anche qui le coordinate vanno riferite all'edificio e non al foglio:
  // vedi `riferiteAllEdificio`, è lo stesso difetto.
  return assembla(riferiteAllEdificio(stanze, rilevamento.edificio), {
    widthM: input.hintWidthM ?? nomi.widthM ?? 12,
    depthM: input.hintDepthM ?? nomi.depthM ?? 8,
  });
}

const SYSTEM_PROMPT = `Sei un sistema di computer vision specializzato in planimetrie di locali pubblici (ristoranti, bar, pizzerie).
Ricevi l'immagine di una planimetria e restituisci la sua struttura in JSON.

COME SI LEGGONO LE COORDINATE
Sull'immagine e' stata sovrapposta una GRIGLIA di riferimento: linee ROSSE verticali etichettate 0.1 ... 0.9 (coordinata X, da sinistra a destra) e linee BLU orizzontali etichettate 0.1 ... 0.9 (coordinata Y, dall'alto in basso). Ogni coordinata che scrivi si legge su quella griglia: guarda fra quali linee cade la cosa che stai descrivendo. 0 = bordo sinistro/alto dell'immagine, 1 = bordo destro/basso. Usa numeri con 3 decimali.

L'ERRORE DA NON FARE
Sulle planimetrie sono scritte delle QUOTE: numeri come 182, 370, 944, 1126, 85, 210. Sono misure in centimetri dell'edificio reale, servono per widthM e depthM, e NON SONO COORDINATE. Non usarle mai come x, y, width o height, nemmeno divise per mille. Le coordinate si leggono solo sulla griglia.

COME PROCEDERE PER OGNI AMBIENTE
Parti dalla sua SCRITTA sul disegno (CUCINA, SALA, BAGNO, DISPENSA...): trova dove si trova quella scritta rispetto alla griglia, poi allarga il rettangolo fino ai muri che la racchiudono. Prima di rispondere ricontrolla: il rettangolo di ogni ambiente contiene davvero la sua scritta? Un ambiente che nell'immagine sta in alto a destra deve avere x grande e y piccolo.

I CAMPI
- "walls": i muri portanti e il perimetro. Ogni muro e' un segmento {x1,y1,x2,y2,thickness}. thickness e' relativo alla larghezza dell'immagine (tipicamente 0.006-0.02).
- "dividers": tramezzi e divisori interni sottili, stesso formato dei muri.
- "doors" e "windows": {x,y,width,angle}. x,y e' il CENTRO dell'apertura sul muro; angle in gradi, 0 = apertura su muro orizzontale, 90 = su muro verticale.
- "rooms": gli ambienti riconoscibili come rettangoli {x,y,width,height,kind,label}. x,y e' l'angolo in alto a sinistra. "kind" e' ESATTAMENTE uno di: AREA_ZONE, AREA_KITCHEN, AREA_BAR, AREA_WC, AREA_STORAGE, AREA_PRIVATE, AREA_ENTRANCE, AREA_TERRACE, AREA_STAIRS. Non inventare altri valori: se l'ambiente non rientra in nessuno (un soggiorno, una camera, un corridoio) usa AREA_ZONE e metti il nome vero in "label". "label" e' il testo leggibile sulla planimetria se c'e' (es. "DISPENSA", "LAVAGGIO", "SOGGIORNO"), altrimenti null.
- "serviceAreas": banconi, banchi di servizio, zone di passaggio, stesso formato di rooms.
- "entrances": ingressi e uscite {x,y,width,angle}.
- "labels": scritte presenti sulla planimetria che non corrispondono a un ambiente {x,y,text}.
- "widthM" e "depthM": le dimensioni reali della sala in metri. QUI le quote servono: se la planimetria le porta, usale (attenzione all'unita': 1126 su un disegno edile sono centimetri, cioe' 11,26 m). Prendi la quota complessiva orizzontale per widthM e quella complessiva verticale per depthM, non due quote dello stesso lato. Se non ci sono quote, stima da elementi noti (una porta e' circa 0,80-0,90 m, un WC circa 1,5x1,5 m) e dichiara meno confidenza.
- "confidence": 0-1, quanto ti fidi della lettura complessiva.

Non inventare ambienti che non vedi. Se la planimetria e' illeggibile restituisci liste vuote e confidence bassa.
Rispondi SOLO con il JSON, senza testo attorno e senza blocchi di codice.`;

export type AnalyzeInput = {
  imageUrl: string;
  roomName?: string;
  /** Dimensioni dichiarate dal ristoratore, se le conosce: sono un
   * riferimento molto più affidabile della stima del modello. */
  hintWidthM?: number | null;
  hintDepthM?: number | null;
};

export async function analyzeFloorPlan(input: AnalyzeInput): Promise<FloorPlanAnalysis> {
  const ai = client();

  if (!ai) {
    return fallbackAnalysis(
      input,
      "Il riconoscimento automatico non è configurato su questo ambiente: abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }
  if (!tipoImmagine(input.imageUrl)) {
    return fallbackAnalysis(
      input,
      "Il riconoscimento automatico legge immagini PNG, JPG o WEBP. Per questo file abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }

  const byte = await leggiFile(input.imageUrl);
  if (!byte || byte.byteLength === 0 || byte.byteLength > MAX_BYTE_IMMAGINE) {
    return fallbackAnalysis(
      input,
      "Non siamo riusciti a rileggere l'immagine caricata: abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }

  /*
    Prima si prova a **calcolare** le stanze dai pixel, e a chiedere al modello
    solo i nomi. Se il disegno non si lascia leggere così — una foto storta,
    una scansione sbiadita, un disegno senza muri chiusi — si ricade sulla
    vecchia strada, che chiede tutto al modello su un'immagine con la griglia.

    Non è un ripiego di comodo: è la differenza fra una lettura misurata e una
    stimata, e su questa planimetria sono 0,04 contro 0,127 di scarto
    dall'ingombro vero.
  */
  const immagine = await immagineComeDato(input.imageUrl);

  const rilevamento = await rilevaStanze(byte);

  /*
    La strada buona: i riquadri dai pixel, i nomi dall'OCR, le misure dalle
    quote. Non chiama nessun modello — è deterministica, costa zero e dà
    sempre la stessa risposta, che su una funzione che si rifà due volte di
    fila conta quanto la precisione.
  */
  if (rilevamento) {
    try {
      const ocr = await leggiEtichette(byte);
      if (ocr && ocr.etichette.length > 0) {
        const composta = componiDaOcr(rilevamento, ocr, input);
        if (composta) return composta;
      }
    } catch {
      // Nessuna scritta leggibile: si scende alle strade col modello.
    }
  }

  if (rilevamento && rilevamento.regioni.length >= 2 && immagine) {
    try {
      const composta = componiDaPixel(rilevamento, await leggiNomi(ai, immagine), input);
      if (composta) return composta;
    } catch {
      // Si scende alla strada del modello: il motivo preciso lo dirà lei.
    }
  }

  if (!immagine) {
    return fallbackAnalysis(
      input,
      "Non siamo riusciti a rileggere l'immagine caricata: abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }

  try {
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || VISION_MODELS_DEFAULT;
    const completion = await ai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Analizza questa planimetria${input.roomName ? ` della sala "${input.roomName}"` : ""}.`,
                input.hintWidthM && input.hintDepthM
                  ? `Il locale dichiara che la sala misura circa ${input.hintWidthM} x ${input.hintDepthM} metri: usa questi valori per widthM e depthM.`
                  : "",
                // Se la griglia non si e' potuta disegnare, il prompt di
                // sistema starebbe descrivendo un righello che nell'immagine
                // non c'e'. Meglio dirlo che lasciarlo cercare.
                immagine.conGriglia
                  ? ""
                  : "Su questa immagine NON e' stata sovrapposta la griglia di riferimento: stima le coordinate a occhio, sempre relative all'immagine.",
              ]
                .filter(Boolean)
                .join(" "),
            },
            { type: "image_url", image_url: { url: immagine.dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty_response");

    const parsed = FloorPlanAnalysisSchema.safeParse({
      ...JSON.parse(stripCodeFence(raw)),
      version: 1,
      source: "ai",
    });
    if (!parsed.success) throw new Error("invalid_shape");

    const analysis = parsed.data;
    // Le quote dichiarate dal ristoratore battono sempre la stima del
    // modello: chi ha camminato nella sala la conosce meglio.
    if (input.hintWidthM) analysis.widthM = input.hintWidthM;
    if (input.hintDepthM) analysis.depthM = input.hintDepthM;

    if (analysis.walls.length === 0) {
      return fallbackAnalysis(
        input,
        "Non siamo riusciti a leggere le pareti da questa immagine: abbiamo creato un perimetro di partenza da correggere a mano.",
      );
    }
    return analysis;
  } catch (err) {
    return fallbackAnalysis(input, notaDiFallimento(err));
  }
}

/**
 * Perché il riconoscimento non ha funzionato, detto a chi può rimediare.
 *
 * Tutti i fallimenti finivano in una frase sola: «non siamo riusciti a leggere
 * questa planimetria». Vera per un'immagine storta, **falsa e costosa** per una
 * chiave sbagliata o per il credito finito — casi in cui il ristoratore
 * ricarica la stessa piantina tre volte, poi ne prova un'altra, e conclude che
 * la funzione non serve. Sono anche i due casi che si incontrano il giorno in
 * cui la chiave si configura per la prima volta, cioè quando una frase precisa
 * vale di più.
 *
 * La risposta resta la stessa — il perimetro da correggere a mano — perché per
 * chi sta disegnando la sala non cambia niente: cambia solo cosa gli conviene
 * fare dopo.
 */
function notaDiFallimento(err: unknown): string {
  const stato = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 0;

  if (stato === 401 || stato === 403) {
    return "La chiave del riconoscimento automatico non è valida: controlla OPENAI_API_KEY. Intanto abbiamo creato un perimetro di partenza da correggere a mano.";
  }
  if (stato === 429) {
    return "Il riconoscimento automatico ha esaurito il credito o le richieste consentite: riprova più tardi. Intanto abbiamo creato un perimetro di partenza da correggere a mano.";
  }
  if (stato === 404) {
    return "Il modello del riconoscimento automatico non esiste o non è accessibile con questa chiave: controlla OPENAI_VISION_MODEL. Intanto abbiamo creato un perimetro di partenza da correggere a mano.";
  }
  return "Il riconoscimento automatico non è riuscito a leggere questa planimetria: abbiamo creato un perimetro di partenza da correggere a mano.";
}

/**
 * Il ripiego: un rettangolo con un ingresso.
 *
 * Non prova a somigliare al locale, e non deve: prova a dare al ristoratore
 * quattro muri da trascinare invece di una tela bianca. Tutto il resto lo
 * aggiunge lui dagli strumenti della colonna sinistra, che esistono
 * esattamente per questo.
 */
export function fallbackAnalysis(input: AnalyzeInput, note: string): FloorPlanAnalysis {
  const widthM = input.hintWidthM ?? 12;
  const depthM = input.hintDepthM ?? 8;
  const t = 0.012;

  return FloorPlanAnalysisSchema.parse({
    version: 1,
    source: "fallback",
    confidence: 0,
    widthM,
    depthM,
    walls: [
      { x1: 0, y1: 0, x2: 1, y2: 0, thickness: t },
      { x1: 1, y1: 0, x2: 1, y2: 1, thickness: t },
      { x1: 1, y1: 1, x2: 0, y2: 1, thickness: t },
      { x1: 0, y1: 1, x2: 0, y2: 0, thickness: t },
    ],
    dividers: [],
    doors: [],
    windows: [],
    rooms: [],
    serviceAreas: [],
    entrances: [{ x: 0.5, y: 1, width: 0.09, angle: 0 }],
    labels: [],
    note,
  });
}

function stripCodeFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}
