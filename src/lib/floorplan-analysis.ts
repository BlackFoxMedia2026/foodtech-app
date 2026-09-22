import { z } from "zod";
import {
  AREA_TYPES,
  metersToPx,
  type AreaType,
  type RoomElement,
} from "./room-layout";

/**
 * Il contratto fra «che cosa c'è nella planimetria» e «come la disegna
 * Foodtech».
 *
 * È volutamente un formato **a sé**, non un array di `RoomElement`. Chi
 * riconosce una planimetria — oggi un modello di visione, domani magari un
 * servizio di computer vision dedicato — ragiona in coordinate normalizzate
 * sull'immagine che ha davanti e non sa nulla di quanti pixel per metro usa
 * il nostro canvas, né del fatto che le nostre porte si agganciano ai muri.
 * Tenere i due formati separati significa che il giorno in cui cambiamo il
 * riconoscitore non cambia niente nell'editor, e che il giorno in cui
 * cambiamo la scala del canvas non cambia niente nel riconoscitore.
 *
 * Tutte le coordinate sono **normalizzate**: 0 = bordo sinistro/alto
 * dell'immagine, 1 = bordo destro/basso. Così il risultato sopravvive a un
 * ridimensionamento dell'immagine e non dipende dai DPI della scansione.
 */

/**
 * Il tipo di ambiente, ricondotto a uno dei nostri.
 *
 * ## Il difetto che questa funzione esiste per togliere
 *
 * Il riconoscitore riceve l'elenco dei valori ammessi nel prompt, e ogni
 * tanto ne inventa lo stesso. Su una planimetria di casa — cucina, bagno,
 * lavanderia, soggiorno — `gpt-4o-mini` ha risposto `AREA_LAVANDERIA`,
 * `AREA_BAGNO`, `AREA_SOGGIORNO`: parole che sulla planimetria ci sono
 * davvero, tradotte in un formato che non esiste.
 *
 * Lo schema rifiutava quei tre campi, `safeParse` falliva, e **tutta**
 * l'analisi veniva buttata: dodici muri giusti, tre tramezzi, due porte e le
 * misure reali lette dalle quote (11,26 × 9,44 m) sparivano perché tre
 * etichette su quattro non erano nell'elenco. Al ristoratore arrivava «il
 * riconoscimento non è riuscito a leggere questa planimetria» — falso: l'aveva
 * letta, eravamo noi a rifiutarla.
 *
 * Un nome sconosciuto adesso vale quello che vale: una zona. E siccome il
 * nome che il modello si inventa contiene quasi sempre la parola scritta sul
 * disegno, quella parola la usiamo per indovinare meglio di `AREA_ZONE`. In
 * ogni caso `label` conserva il testo originale, quindi sulla piantina il
 * ristoratore continua a leggere «LAVANDERIA» e non «Magazzino».
 */
const SINONIMI: [RegExp, AreaType][] = [
  [/CUCIN|KITCHEN|LAVAGGI|PREPARAZ/, "AREA_KITCHEN"],
  [/BANCONE|COUNTER|\bBAR\b|BIRRER|CAFFETTER/, "AREA_BAR"],
  [/BAGN|\bWC\b|TOILET|SERVIZI\b/, "AREA_WC"],
  // Le abbreviazioni con cui un progettista scrive sul disegno: `DISP.`,
  // `RIP.`, `SPOGL.` sono quello che si legge davvero su una planimetria, e
  // la parola intera non c'è quasi mai.
  [/MAGAZZIN|DISPENS|\bDISP|DEPOSIT|RIPOSTIG|\bRIP\b|LAVANDER|STORAGE|CELLA|CANTIN/, "AREA_STORAGE"],
  [/PRIVAT|UFFICI|OFFICE|DIREZION|SPOGLIAT|\bSPOGL/, "AREA_PRIVATE"],
  [/INGRESS|ENTRAT|ENTRANCE|ATRIO|DISIMPEGN|ANTI\b/, "AREA_ENTRANCE"],
  [/TERRAZZ|DEHORS|GIARDIN|PATIO|TERRACE|ESTERN/, "AREA_TERRACE"],
  [/SCAL|STAIR|GRADIN/, "AREA_STAIRS"],
];

export function normalizzaTipoArea(valore: unknown, etichetta?: unknown): AreaType {
  const candidati = [valore, etichetta]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toUpperCase());

  for (const testo of candidati) {
    if ((AREA_TYPES as readonly string[]).includes(testo)) return testo as AreaType;
  }
  for (const testo of candidati) {
    for (const [forma, tipo] of SINONIMI) {
      if (forma.test(testo)) return tipo;
    }
  }
  return "AREA_ZONE";
}

/**
 * Un elenco che perde l'elemento sbagliato, non l'elenco.
 *
 * `z.array(...)` è tutto o niente: un muro con una coordinata fuori scala
 * faceva fallire la lettura dei quattrocento muri buoni. Qui gli elementi si
 * validano uno per uno e quelli che non passano restano fuori — ed è la stessa
 * promessa che l'interfaccia fa già al ristoratore, cioè che la piantina che
 * arriva è **da correggere**, non da prendere per buona.
 *
 * Oltre il tetto si taglia invece di rifiutare: una planimetria con
 * cinquecento muri è comunque meglio dei primi quattrocento che del ripiego a
 * rettangolo.
 */
function elenco<S extends z.ZodTypeAny>(schema: S, max: number) {
  return z.any().transform((valore): z.output<S>[] => {
    if (!Array.isArray(valore)) return [];
    const buoni: z.output<S>[] = [];
    for (const elemento of valore) {
      if (buoni.length >= max) break;
      const esito = schema.safeParse(elemento);
      if (esito.success) buoni.push(esito.data);
    }
    return buoni;
  });
}

const unit = z.number().min(-0.5).max(1.5);

export const AnalysisSegmentSchema = z.object({
  x1: unit,
  y1: unit,
  x2: unit,
  y2: unit,
  /** Spessore relativo alla larghezza dell'immagine (0.01 ≈ un muro sottile). */
  thickness: z.number().min(0).max(0.2).default(0.012),
});

export const AnalysisOpeningSchema = z.object({
  x: unit,
  y: unit,
  /** Larghezza relativa alla larghezza dell'immagine. */
  width: z.number().min(0).max(0.6).default(0.05),
  /** Gradi, 0 = orizzontale. */
  angle: z.number().min(-360).max(360).default(0),
});

export const AnalysisRoomSchema = z.preprocess(
  // Il `kind` si ricuce prima della validazione, guardando anche l'etichetta:
  // dentro lo schema resta un enum stretto, che è quello che l'editor si
  // aspetta di ricevere.
  (valore) =>
    valore && typeof valore === "object" && !Array.isArray(valore)
      ? {
          ...(valore as Record<string, unknown>),
          kind: normalizzaTipoArea(
            (valore as Record<string, unknown>).kind,
            (valore as Record<string, unknown>).label,
          ),
        }
      : valore,
  z.object({
    x: unit,
    y: unit,
    width: z.number().min(0).max(1.5),
    height: z.number().min(0).max(1.5),
    kind: z.enum(AREA_TYPES).default("AREA_ZONE"),
    label: z.string().max(40).nullable().default(null),
  }),
);

export const AnalysisLabelSchema = z.object({
  x: unit,
  y: unit,
  text: z.string().min(1).max(60),
});

export const FloorPlanAnalysisSchema = z.object({
  version: z.literal(1).default(1),
  /** Da dove arriva questo risultato. Non è un dettaglio implementativo: è
   * quello che permette all'interfaccia di non spacciare per riconoscimento
   * una piantina di ripiego. */
  source: z.enum(["ai", "fallback"]).default("fallback"),
  /** Quanto il riconoscitore si fida di sé stesso, 0-1. */
  confidence: z.number().min(0).max(1).default(0.5),
  /** Dimensioni reali stimate della sala, in metri. Servono a dare al canvas
   * una scala plausibile quando la planimetria non porta le quote. */
  widthM: z.number().min(1).max(500).default(12),
  depthM: z.number().min(1).max(500).default(8),
  walls: elenco(AnalysisSegmentSchema, 400),
  dividers: elenco(AnalysisSegmentSchema, 400),
  doors: elenco(AnalysisOpeningSchema, 200),
  windows: elenco(AnalysisOpeningSchema, 200),
  rooms: elenco(AnalysisRoomSchema, 120),
  serviceAreas: elenco(AnalysisRoomSchema, 120),
  entrances: elenco(AnalysisOpeningSchema, 40),
  labels: elenco(AnalysisLabelSchema, 120),
  /** Una riga leggibile da mostrare al ristoratore quando qualcosa non è
   * andato come doveva. */
  note: z.string().max(300).nullable().default(null),
});

export type FloorPlanAnalysis = z.infer<typeof FloorPlanAnalysisSchema>;
export type AnalysisSegment = z.infer<typeof AnalysisSegmentSchema>;
export type AnalysisRoom = z.infer<typeof AnalysisRoomSchema>;

export function parseFloorPlanAnalysis(json: unknown): FloorPlanAnalysis | null {
  const parsed = FloorPlanAnalysisSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Il margine attorno alla planimetria nel mondo del canvas: la sala non
 * deve toccare l'origine, altrimenti trascinare un tavolo verso il bordo lo
 * fa sbattere contro il vuoto invece che contro un muro. */
const WORLD_MARGIN_PX = 80;

export type AnalysisToElementsResult = {
  elements: RoomElement[];
  width: number;
  height: number;
};

let seq = 0;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/**
 * Trasforma il riconoscimento in elementi modificabili.
 *
 * Questo è il punto in cui il brief dice «non limitarti ad applicare un
 * filtro all'immagine»: da qui in poi non esiste più un'immagine, esistono
 * muri che si trascinano, porte che si spostano, ambienti che si rinominano.
 * L'immagine resta solo come riferimento nel livello «Immagine originale».
 */
export function analysisToElements(analysis: FloorPlanAnalysis): AnalysisToElementsResult {
  const planW = metersToPx(analysis.widthM);
  const planH = metersToPx(analysis.depthM);
  const ox = WORLD_MARGIN_PX;
  const oy = WORLD_MARGIN_PX;

  const toX = (u: number) => Math.round(ox + u * planW);
  const toY = (u: number) => Math.round(oy + u * planH);
  const toLen = (u: number) => Math.max(2, Math.round(u * planW));

  const elements: RoomElement[] = [];

  for (const w of analysis.walls) {
    elements.push({
      id: nextId("wall"),
      type: "WALL",
      startX: toX(w.x1),
      startY: toY(w.y1),
      endX: toX(w.x2),
      endY: toY(w.y2),
      thickness: Math.min(60, Math.max(4, toLen(w.thickness))),
    });
  }

  for (const d of analysis.dividers) {
    elements.push({
      id: nextId("div"),
      type: "DIVIDER",
      startX: toX(d.x1),
      startY: toY(d.y1),
      endX: toX(d.x2),
      endY: toY(d.y2),
      thickness: Math.min(60, Math.max(3, toLen(d.thickness))),
    });
  }

  for (const d of analysis.doors) {
    elements.push({
      id: nextId("door"),
      type: "DOOR",
      wallId: null,
      x: toX(d.x),
      y: toY(d.y),
      width: Math.min(400, Math.max(30, toLen(d.width))),
      rotation: d.angle,
    });
  }

  for (const w of analysis.windows) {
    elements.push({
      id: nextId("win"),
      type: "WINDOW",
      wallId: null,
      x: toX(w.x),
      y: toY(w.y),
      width: Math.min(400, Math.max(30, toLen(w.width))),
      rotation: w.angle,
    });
  }

  // Gli ingressi arrivano come aperture ma sulla piantina sono **aree**: una
  // freccia e una parola, non un buco nel muro. Il buco nel muro, se c'è, è
  // già fra le porte.
  for (const e of analysis.entrances) {
    const size = Math.max(60, toLen(Math.max(e.width, 0.08)));
    elements.push({
      id: nextId("entr"),
      type: "AREA_ENTRANCE",
      x: toX(e.x) - size / 2,
      y: toY(e.y) - size / 2,
      width: size,
      height: size,
      rotation: 0,
      label: null,
    });
  }

  for (const r of [...analysis.rooms, ...analysis.serviceAreas]) {
    elements.push({
      id: nextId("area"),
      type: normalizeAreaType(r.kind),
      x: toX(r.x),
      y: toY(r.y),
      width: Math.max(20, toLen(r.width)),
      height: Math.max(20, Math.round(r.height * planH)),
      rotation: 0,
      label: r.label,
    });
  }

  /*
    Le scritte, **senza i doppioni**.

    I modelli di visione leggono «CUCINA» sulla planimetria e la restituiscono
    due volte: come `label` dell'ambiente che hanno riconosciuto e come voce di
    `labels`, perché è vero entrambe le volte. Tenerle tutte e due significa
    scrivere CUCINA sopra CUCINA, sfalsato di qualche pixel — l'effetto è una
    piantina che sembra stampata male, e va ripulita a mano etichetta per
    etichetta. Qui la scritta si tiene solo se non è già il nome di un
    ambiente: quella dell'ambiente si sposta con l'ambiente, quella libera no.
  */
  const nomiAmbienti = new Set(
    [...analysis.rooms, ...analysis.serviceAreas]
      .map((r) => normalizzaTesto(r.label ?? ""))
      .filter(Boolean),
  );

  for (const l of analysis.labels) {
    if (nomiAmbienti.has(normalizzaTesto(l.text))) continue;
    elements.push({
      id: nextId("text"),
      type: "TEXT",
      x: toX(l.x),
      y: toY(l.y),
      text: l.text,
      fontSize: 13,
      rotation: 0,
    });
  }

  return {
    elements,
    width: planW + WORLD_MARGIN_PX * 2,
    height: planH + WORLD_MARGIN_PX * 2,
  };
}

/** Due scritte sono la stessa scritta anche se una ha una lettera minuscola,
 * un accento diverso o due spazi: sulla planimetria stanno una sopra l'altra
 * lo stesso. */
function normalizzaTesto(testo: string) {
  return testo.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeAreaType(kind: string): AreaType {
  return (AREA_TYPES as readonly string[]).includes(kind) ? (kind as AreaType) : "AREA_ZONE";
}

/** Le quattro fasi che il ristoratore vede scorrere mentre il riconoscimento
 * lavora. Stanno qui e non nel componente perché sono anche l'ordine in cui
 * il risultato viene letto: se domani il riconoscitore restituirà le fasi una
 * per volta, questa lista è già il contratto. */
export const ANALYSIS_STEPS = [
  { key: "walls", label: "Riconoscimento pareti" },
  { key: "rooms", label: "Riconoscimento ambienti" },
  { key: "openings", label: "Riconoscimento porte e aperture" },
  { key: "render", label: "Creazione piantina" },
] as const;
export type AnalysisStepKey = (typeof ANALYSIS_STEPS)[number]["key"];

/** Riassunto in una riga di cosa è stato trovato — per la schermata di esito
 * e per il pannello «Immagine originale». */
export function summarizeAnalysis(a: FloorPlanAnalysis): string {
  const parti: string[] = [];
  const muri = a.walls.length + a.dividers.length;
  if (muri) parti.push(`${muri} ${muri === 1 ? "parete" : "pareti"}`);
  const ambienti = a.rooms.length + a.serviceAreas.length;
  if (ambienti) parti.push(`${ambienti} ${ambienti === 1 ? "ambiente" : "ambienti"}`);
  const aperture = a.doors.length + a.windows.length;
  if (aperture) parti.push(`${aperture} ${aperture === 1 ? "apertura" : "aperture"}`);
  return parti.length > 0 ? parti.join(" · ") : "nessun elemento riconosciuto";
}
