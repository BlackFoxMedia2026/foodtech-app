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
