import { metersToPx, type WallElement } from "@/lib/room-layout";

const WALL_THICKNESS = 10;
const MARGIN = 60; // keeps the perimeter off the world (0,0) edge

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function wallsFromPoints(points: { x: number; y: number }[]): WallElement[] {
  const walls: WallElement[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    walls.push({
      id: nextId("wall"),
      type: "WALL",
      startX: Math.round(a.x),
      startY: Math.round(a.y),
      endX: Math.round(b.x),
      endY: Math.round(b.y),
      thickness: WALL_THICKNESS,
    });
  }
  return walls;
}

export function generateRectangle(widthM: number, depthM: number): WallElement[] {
  const w = metersToPx(widthM);
  const d = metersToPx(depthM);
  return wallsFromPoints([
    { x: MARGIN, y: MARGIN },
    { x: MARGIN + w, y: MARGIN },
    { x: MARGIN + w, y: MARGIN + d },
    { x: MARGIN, y: MARGIN + d },
  ]);
}

/**
 * L-shape: outer bounding box (widthM x depthM) with a rectangular notch cut
 * from the top-right corner of size (notchWidthM x notchDepthM). Kept to a
 * single simple case per the brief ("non complicare il form") — a generic
 * polygon editor is available via disegno libero for anything more elaborate.
 */
export function generateLShape(widthM: number, depthM: number, notchWidthM: number, notchDepthM: number): WallElement[] {
  const w = metersToPx(widthM);
  const d = metersToPx(depthM);
  const nw = Math.min(metersToPx(notchWidthM), w - 20);
  const nd = Math.min(metersToPx(notchDepthM), d - 20);
  const x0 = MARGIN;
  const y0 = MARGIN;
  return wallsFromPoints([
    { x: x0, y: y0 },
    { x: x0 + w - nw, y: y0 },
    { x: x0 + w - nw, y: y0 + nd },
    { x: x0 + w, y: y0 + nd },
    { x: x0 + w, y: y0 + d },
    { x: x0, y: y0 + d },
  ]);
}

/** Due capi a meno di questa distanza sono lo stesso angolo: la calamita li
 * incolla esatti, ma un muro importato o arrotondato può sbagliare di un pixel. */
const STESSO_PUNTO_PX = 1.5;

/**
 * Il tracciato di un muro: lui e tutti i muri collegati capo a capo, anche
 * attraverso altri muri. Una stanza chiusa è un tracciato solo; un muro
 * isolato è un tracciato di sé stesso.
 *
 * Solo `WALL`: i divisori sono pezzi a sé, si spostano da soli anche quando
 * toccano una parete.
 */
export function tracciatoDi<T extends { id: string; type: string; startX: number; startY: number; endX: number; endY: number }>(
  muri: readonly T[],
  id: string,
): T[] {
  const pareti = muri.filter((m) => m.type === "WALL");
  const partenza = pareti.find((m) => m.id === id);
  if (!partenza) return [];
  const capi = (m: T) => [
    { x: m.startX, y: m.startY },
    { x: m.endX, y: m.endY },
  ];
  const vicini = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= STESSO_PUNTO_PX;

  const visti = new Set([partenza.id]);
  const coda = [partenza];
  while (coda.length > 0) {
    const m = coda.pop()!;
    for (const altro of pareti) {
      if (visti.has(altro.id)) continue;
      if (capi(m).some((c) => capi(altro).some((d) => vicini(c, d)))) {
        visti.add(altro.id);
        coda.push(altro);
      }
    }
  }
  return pareti.filter((m) => visti.has(m.id));
}

/** Se un capo sta su questo punto (stesso angolo del tracciato). */
export function stessoPunto(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= STESSO_PUNTO_PX;
}
