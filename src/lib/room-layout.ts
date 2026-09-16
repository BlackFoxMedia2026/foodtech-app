import { z } from "zod";

/**
 * Shared geometry constants for the "Crea la tua sala" builder. The builder
 * stays in the same integer-pixel space Room.width/height and Table.posX/Y
 * already use (see floor-canvas.tsx) — PIXELS_PER_METER only drives the
 * metric labels shown to the user (e.g. "4,20 m"), never a stored unit
 * conversion. 100px/m keeps a 12x8m room at the existing default Room size
 * (1200x800) and real ~0.8m tables matching TABLE_SIZE in table-node.tsx.
 */
export const PIXELS_PER_METER = 100;

export function metersToPx(m: number) {
  return Math.round(m * PIXELS_PER_METER);
}

export function pxToMeters(px: number) {
  return px / PIXELS_PER_METER;
}

export function formatMeters(px: number) {
  return `${pxToMeters(px).toFixed(2).replace(".", ",")} m`;
}

export function formatCm(px: number) {
  return `${Math.round(pxToMeters(px) * 100)} cm`;
}

export const AREA_TYPES = [
  "AREA_ZONE",
  "AREA_KITCHEN",
  "AREA_BAR",
  "AREA_WC",
  "AREA_STORAGE",
  "AREA_PRIVATE",
  "AREA_ENTRANCE",
  "AREA_TERRACE",
  "AREA_STAIRS",
] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const AREA_LABELS: Record<AreaType, string> = {
  AREA_ZONE: "Zona",
  AREA_KITCHEN: "Cucina",
  AREA_BAR: "Bancone",
  AREA_WC: "Bagno",
  AREA_STORAGE: "Magazzino",
  AREA_PRIVATE: "Zona privata",
  AREA_ENTRANCE: "Ingresso / Uscita",
  AREA_TERRACE: "Terrazza / Dehors",
  AREA_STAIRS: "Scala",
};

const idSchema = z.string().min(1);

export const WallElementSchema = z.object({
  id: idSchema,
  type: z.literal("WALL"),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  thickness: z.number().min(2).max(60).default(10),
});
export type WallElement = z.infer<typeof WallElementSchema>;

export const DoorElementSchema = z.object({
  id: idSchema,
  type: z.literal("DOOR"),
  wallId: idSchema.nullable().default(null),
  x: z.number(),
  y: z.number(),
  width: z.number().min(10).max(400).default(90),
  rotation: z.number().default(0),
});
export type DoorElement = z.infer<typeof DoorElementSchema>;

export const WindowElementSchema = z.object({
  id: idSchema,
  type: z.literal("WINDOW"),
  wallId: idSchema.nullable().default(null),
  x: z.number(),
  y: z.number(),
  width: z.number().min(10).max(400).default(120),
  rotation: z.number().default(0),
});
export type WindowElement = z.infer<typeof WindowElementSchema>;

/**
 * Il divisorio: una parete che **non porta il tetto**.
 *
 * Geometricamente è identico a `WALL` — due punti e uno spessore — e per un
 * momento è sembrato sensato modellarlo come una parete con un flag. Ma i due
 * si disegnano in modo diverso (il divisorio è più sottile, più chiaro, senza
 * l'ombra portata che dà profondità ai muri perimetrali) e soprattutto si
 * *aggancia* in modo diverso: porte e finestre cercano i muri, non i
 * divisori. Un tipo separato tiene queste due differenze dove si vedono,
 * invece di spargere `if (wall.loadBearing)` in tre file.
 */
export const DividerElementSchema = z.object({
  id: idSchema,
  type: z.literal("DIVIDER"),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  thickness: z.number().min(2).max(60).default(6),
});
export type DividerElement = z.infer<typeof DividerElementSchema>;

export const ColumnElementSchema = z.object({
  id: idSchema,
  type: z.literal("COLUMN"),
  x: z.number(),
  y: z.number(),
  width: z.number().min(10).max(200).default(40),
  height: z.number().min(10).max(200).default(40),
  rotation: z.number().default(0),
});
export type ColumnElement = z.infer<typeof ColumnElementSchema>;

export const AreaElementSchema = z.object({
  id: idSchema,
  type: z.enum(AREA_TYPES),
  x: z.number(),
  y: z.number(),
  width: z.number().min(20).max(4000).default(160),
  height: z.number().min(20).max(4000).default(120),
  rotation: z.number().default(0),
  label: z.string().max(40).nullable().default(null),
});
export type AreaElement = z.infer<typeof AreaElementSchema>;

// Marker only: the real position/rotation/name/seats live on the Table row
// itself (Table.posX/posY/rotation/label/seats). This element's sole purpose
// is to say "this table is placed on this layout" so the builder can compute
// the "tavoli non posizionati" list without ever duplicating table data.
export const TableRefElementSchema = z.object({
  id: idSchema,
  type: z.literal("TABLE"),
  tableId: idSchema,
});
export type TableRefElement = z.infer<typeof TableRefElementSchema>;

/** Una scritta libera sulla piantina — «BANCO / SERVIZIO», «Riservato», il
 * numero di un ambiente. Vive nel livello «Testi», che si spegne per intero. */
export const TextElementSchema = z.object({
  id: idSchema,
  type: z.literal("TEXT"),
  x: z.number(),
  y: z.number(),
  text: z.string().max(60).default("Testo"),
  fontSize: z.number().min(6).max(72).default(14),
  rotation: z.number().default(0),
});
export type TextElement = z.infer<typeof TextElementSchema>;

/** L'elemento libero: un ingombro senza significato dichiarato — un pilastro
 * fuori squadro, una fioriera, la cassa. Serve a chiudere il buco fra «l'AI
 * non l'ha riconosciuto» e «nella sala c'è davvero». */
export const FreeElementSchema = z.object({
  id: idSchema,
  type: z.literal("FREE"),
  x: z.number(),
  y: z.number(),
  width: z.number().min(8).max(4000).default(60),
  height: z.number().min(8).max(4000).default(60),
  rotation: z.number().default(0),
  label: z.string().max(40).nullable().default(null),
});
export type FreeElement = z.infer<typeof FreeElementSchema>;

export const RoomElementSchema = z.discriminatedUnion("type", [
  WallElementSchema,
  DividerElementSchema,
  DoorElementSchema,
  WindowElementSchema,
  ColumnElementSchema,
  ...AREA_TYPES.map((t) => AreaElementSchema.extend({ type: z.literal(t) })),
  TableRefElementSchema,
  TextElementSchema,
  FreeElementSchema,
]);
export type RoomElement = z.infer<typeof RoomElementSchema>;

export const RoomLayoutElementsSchema = z.array(RoomElementSchema).max(2000);

/**
 * I livelli della piantina.
 *
 * Non sono una preferenza di chi guarda ma una proprietà **della sala**: se
 * il responsabile spegne l'immagine originale perché ormai la piantina
 * ridisegnata è quella buona, chi apre la Sala dopo di lui deve trovarla
 * spenta. Per questo vivono su `RoomLayout` e non in `localStorage`.
 */
export const ROOM_LAYER_KEYS = ["tables", "structure", "areas", "texts", "original"] as const;
export type RoomLayerKey = (typeof ROOM_LAYER_KEYS)[number];

export const DEFAULT_ROOM_LAYERS: Record<RoomLayerKey, boolean> = {
  tables: true,
  structure: true,
  areas: true,
  texts: true,
  original: false,
};

export const RoomLayersSchema = z
  .object({
    tables: z.boolean(),
    structure: z.boolean(),
    areas: z.boolean(),
    texts: z.boolean(),
    original: z.boolean(),
  })
  .partial();
export type RoomLayers = Record<RoomLayerKey, boolean>;

export function parseRoomLayers(json: unknown): RoomLayers {
  const parsed = RoomLayersSchema.safeParse(json);
  return { ...DEFAULT_ROOM_LAYERS, ...(parsed.success ? parsed.data : {}) };
}

/**
 * L'inventario dichiarato: «ho quattro quadrati, tre rotondi, due
 * rettangolari».
 *
 * È un numero **dichiarato**, non derivato dai tavoli esistenti, ed è questa
 * la ragione per cui esiste: dice quanti tavoli il locale possiede davvero,
 * compresi quelli che non ha ancora messo sulla piantina. La disponibilità
 * mostrata nella libreria è la differenza fra questo numero e i tavoli di
 * quella forma già posizionati in questa sala.
 *
 * Un inventario vuoto (`{}`) significa «non dichiarato»: la libreria allora
 * non mostra alcun contatore e resta un catalogo aperto, com'era prima.
 */
export const INVENTORY_SHAPES = ["SQUARE", "ROUND", "RECT", "OVAL", "CUSTOM"] as const;
export type InventoryShape = (typeof INVENTORY_SHAPES)[number];

export const RoomInventorySchema = z.record(z.enum(INVENTORY_SHAPES), z.number().int().min(0).max(999));
export type RoomInventory = Partial<Record<InventoryShape, number>>;

export function parseRoomInventory(json: unknown): RoomInventory {
  const parsed = RoomInventorySchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}

/** Nome, superficie e dimensioni scritti a mano quando la geometria non
 * basta a calcolarli (o quando il locale sa che il calcolo è sbagliato). */
export const RoomMetaSchema = z
  .object({
    /** m², sovrascrive la stima geometrica. */
    areaSqm: z.number().min(0).max(100000).nullable(),
    /** metri, sovrascrive il riquadro di ingombro. */
    widthM: z.number().min(0).max(1000).nullable(),
    depthM: z.number().min(0).max(1000).nullable(),
    notes: z.string().max(300).nullable(),
  })
  .partial();
export type RoomMeta = z.infer<typeof RoomMetaSchema>;

export function parseRoomMeta(json: unknown): RoomMeta {
  const parsed = RoomMetaSchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}

export const SaveRoomLayoutSchema = z.object({
  elements: RoomLayoutElementsSchema,
  width: z.number().int().min(200).max(20000),
  height: z.number().int().min(200).max(20000),
  layers: RoomLayersSchema.optional(),
  inventory: RoomInventorySchema.optional(),
  meta: RoomMetaSchema.optional(),
});
export type SaveRoomLayoutInput = z.infer<typeof SaveRoomLayoutSchema>;

export function isWall(el: RoomElement): el is WallElement {
  return el.type === "WALL";
}
export function isDivider(el: RoomElement): el is DividerElement {
  return el.type === "DIVIDER";
}
/** Muri e divisori insieme: quello che ha due estremi e uno spessore. Serve
 * a chi li disegna e a chi calcola gli ingombri, non a chi ci aggancia le
 * porte (quelle cercano solo `isWall`). */
export function isSegment(el: RoomElement): el is WallElement | DividerElement {
  return el.type === "WALL" || el.type === "DIVIDER";
}
export function isText(el: RoomElement): el is TextElement {
  return el.type === "TEXT";
}
export function isFree(el: RoomElement): el is FreeElement {
  return el.type === "FREE";
}
export function isDoor(el: RoomElement): el is DoorElement {
  return el.type === "DOOR";
}
export function isWindow(el: RoomElement): el is WindowElement {
  return el.type === "WINDOW";
}
export function isColumn(el: RoomElement): el is ColumnElement {
  return el.type === "COLUMN";
}
export function isArea(el: RoomElement): el is AreaElement {
  return (AREA_TYPES as readonly string[]).includes(el.type);
}
export function isTableRef(el: RoomElement): el is TableRefElement {
  return el.type === "TABLE";
}

export function wallLength(w: WallElement | DividerElement) {
  return Math.hypot(w.endX - w.startX, w.endY - w.startY);
}

/**
 * Tolerant parse of the persisted Json column — invalid/legacy rows degrade
 * to an empty layout instead of throwing, since this runs on every page load.
 *
 * La tolleranza è **per elemento**, non per piantina. Prima un solo elemento
 * illeggibile — un tipo aggiunto da una versione più nuova, un campo andato
 * storto — faceva restituire `[]`, cioè cancellava dallo schermo una sala
 * intera per colpa di una porta. Adesso quell'elemento sparisce e tutto il
 * resto si disegna: una porta mancante si vede e si rimette, una sala vuota
 * sembra un dato perso.
 */
export function parseRoomLayoutElements(json: unknown): RoomElement[] {
  if (!Array.isArray(json)) {
    const result = RoomLayoutElementsSchema.safeParse(json);
    return result.success ? result.data : [];
  }
  const out: RoomElement[] = [];
  for (const raw of json.slice(0, 2000)) {
    const parsed = RoomElementSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function boundingBox(elements: RoomElement[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (isSegment(el)) {
      minX = Math.min(minX, el.startX, el.endX);
      minY = Math.min(minY, el.startY, el.endY);
      maxX = Math.max(maxX, el.startX, el.endX);
      maxY = Math.max(maxY, el.startY, el.endY);
    } else if (isColumn(el) || isArea(el) || isFree(el)) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: metersToPx(12), maxY: metersToPx(8) };
  return { minX, minY, maxX, maxY };
}

export type RoomBounds = { minX: number; minY: number; maxX: number; maxY: number };

const CHAIN_TOLERANCE_PX = 14;

/**
 * La superficie della sala, in metri quadri, dalla geometria che c'è.
 *
 * Se i muri formano un anello chiuso si misura il poligono vero (formula
 * dell'area di Gauss): una sala a L non vale il suo riquadro di ingombro, e
 * dire «~98 m²» quando sono 74 è peggio che non dirlo. Se l'anello non si
 * chiude — piantina ancora in costruzione, muro cancellato — si ripiega sul
 * riquadro, che è una sovrastima onesta e mai un numero inventato.
 *
 * Restituisce `null` quando non ci sono muri: preferisco una riga vuota da
 * riempire a mano a una stima costruita sul nulla.
 */
export function estimateAreaSqm(elements: RoomElement[]): number | null {
  const walls = elements.filter(isWall);
  if (walls.length === 0) return null;

  const ring = chainWalls(walls);
  if (ring) {
    let twiceArea = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      twiceArea += a.x * b.y - b.x * a.y;
    }
    const sqm = Math.abs(twiceArea / 2) / (PIXELS_PER_METER * PIXELS_PER_METER);
    if (sqm > 0.5) return sqm;
  }

  const box = boundingBox(walls);
  return (pxToMeters(box.maxX - box.minX) * pxToMeters(box.maxY - box.minY)) || null;
}

/**
 * Il contorno della sala come poligono, quando i muri lo chiudono.
 *
 * Serve a riempire il pavimento: un rettangolo di legno disegnato sul
 * riquadro di ingombro deborda da ogni sala che non è un rettangolo, e si
 * vede subito — il legno spunta fuori dai muri nell'angolo rientrante. Con il
 * poligono vero il pavimento finisce dove finisce la sala.
 */
export function wallPolygon(elements: RoomElement[]): { x: number; y: number }[] | null {
  const walls = elements.filter(isWall);
  if (walls.length < 3) return null;
  const ring = chainWalls(walls);
  return ring && ring.length >= 3 ? ring : null;
}

/** Prova a mettere in fila i muri fino a richiudere l'anello. Ritorna i
 * vertici in ordine, o `null` se i muri non formano un contorno unico. */
function chainWalls(walls: WallElement[]): { x: number; y: number }[] | null {
  const remaining = walls.map((w) => ({ a: { x: w.startX, y: w.startY }, b: { x: w.endX, y: w.endY } }));
  const first = remaining.shift();
  if (!first) return null;
  const ring = [first.a, first.b];

  while (remaining.length > 0) {
    const tail = ring[ring.length - 1];
    const idx = remaining.findIndex(
      (s) => near(s.a, tail) || near(s.b, tail),
    );
    if (idx === -1) return null;
    const [seg] = remaining.splice(idx, 1);
    const next = near(seg.a, tail) ? seg.b : seg.a;
    if (near(next, ring[0])) return ring;
    ring.push(next);
  }
  return near(ring[ring.length - 1], ring[0]) ? ring.slice(0, -1) : null;
}

function near(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= CHAIN_TOLERANCE_PX;
}

/**
 * The operational viewport should hug the room's actual content, not the
 * raw saved canvas (which is only ever grown, never shrunk — see
 * boundingBox usage in use-room-builder.ts / server/room-layout.ts). For a
 * BUILDER room, bounds come from the walls/columns/areas/tables themselves
 * plus a margin, clamped to the saved canvas. For an IMAGE room (or one with
 * no structured layout yet) there's no sub-geometry to hug, so the saved
 * canvas is the only bound available.
 */
export function getRoomBounds(
  room: { width: number; height: number; activeLayoutMode: "IMAGE" | "BUILDER" | null },
  elements: RoomElement[],
  tableFootprints: Array<{ x: number; y: number; w: number; h: number }>,
  opts: { margin?: number } = {},
): RoomBounds {
  if (room.activeLayoutMode !== "BUILDER") {
    return { minX: 0, minY: 0, maxX: room.width, maxY: room.height };
  }
  const margin = opts.margin ?? 56;
  const box = boundingBox(elements);
  let { minX, minY, maxX, maxY } = box;
  for (const t of tableFootprints) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.w);
    maxY = Math.max(maxY, t.y + t.h);
  }
  return {
    minX: Math.max(0, minX - margin),
    minY: Math.max(0, minY - margin),
    maxX: Math.min(room.width, maxX + margin),
    maxY: Math.min(room.height, maxY + margin),
  };
}
