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
  "AREA_KITCHEN",
  "AREA_BAR",
  "AREA_WC",
  "AREA_STORAGE",
  "AREA_PRIVATE",
  "AREA_ENTRANCE",
  "AREA_TERRACE",
] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const AREA_LABELS: Record<AreaType, string> = {
  AREA_KITCHEN: "Cucina",
  AREA_BAR: "Bancone",
  AREA_WC: "WC",
  AREA_STORAGE: "Magazzino",
  AREA_PRIVATE: "Zona privata",
  AREA_ENTRANCE: "Ingresso",
  AREA_TERRACE: "Terrazza / Dehors",
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

export const RoomElementSchema = z.discriminatedUnion("type", [
  WallElementSchema,
  DoorElementSchema,
  WindowElementSchema,
  ColumnElementSchema,
  ...AREA_TYPES.map((t) => AreaElementSchema.extend({ type: z.literal(t) })),
  TableRefElementSchema,
]);
export type RoomElement = z.infer<typeof RoomElementSchema>;

export const RoomLayoutElementsSchema = z.array(RoomElementSchema).max(500);

export const SaveRoomLayoutSchema = z.object({
  elements: RoomLayoutElementsSchema,
  width: z.number().int().min(200).max(20000),
  height: z.number().int().min(200).max(20000),
});
export type SaveRoomLayoutInput = z.infer<typeof SaveRoomLayoutSchema>;

export function isWall(el: RoomElement): el is WallElement {
  return el.type === "WALL";
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

export function wallLength(w: WallElement) {
  return Math.hypot(w.endX - w.startX, w.endY - w.startY);
}

/** Tolerant parse of the persisted Json column — invalid/legacy rows degrade
 * to an empty layout instead of throwing, since this runs on every page load. */
export function parseRoomLayoutElements(json: unknown): RoomElement[] {
  const result = RoomLayoutElementsSchema.safeParse(json);
  return result.success ? result.data : [];
}

export function boundingBox(elements: RoomElement[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (isWall(el)) {
      minX = Math.min(minX, el.startX, el.endX);
      minY = Math.min(minY, el.startY, el.endY);
      maxX = Math.max(maxX, el.startX, el.endX);
      maxY = Math.max(maxY, el.startY, el.endY);
    } else if (isColumn(el) || isArea(el)) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: metersToPx(12), maxY: metersToPx(8) };
  return { minX, minY, maxX, maxY };
}
