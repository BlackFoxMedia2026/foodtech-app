import type { WallElement } from "@/lib/room-layout";

export type Point = { x: number; y: number };

const ANGLE_SNAP_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
const ANGLE_SNAP_THRESHOLD_DEG = 6;
const ENDPOINT_SNAP_PX = 14;
const GRID_SIZE_PX = 25; // quarter-meter at 100px/m

/** Snaps a free-drawn segment's end point onto the nearest 0/45/90° ray from
 * `origin`, if it's within a small angular threshold — makes freehand walls
 * come out straight/diagonal without requiring pixel-perfect drawing. */
export function snapAngle(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return point;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let nearest = ANGLE_SNAP_DEG[0];
  let best = Infinity;
  for (const a of ANGLE_SNAP_DEG) {
    const diff = Math.min(Math.abs(angle - a), 360 - Math.abs(angle - a));
    if (diff < best) {
      best = diff;
      nearest = a;
    }
  }
  if (best > ANGLE_SNAP_THRESHOLD_DEG) return point;
  const rad = (nearest * Math.PI) / 180;
  return { x: origin.x + Math.cos(rad) * dist, y: origin.y + Math.sin(rad) * dist };
}

/** Snaps a point onto a nearby existing vertex (wall endpoint) within a
 * screen-independent world-space threshold — lets perimeters close cleanly. */
export function snapToEndpoints(point: Point, candidates: Point[], threshold = ENDPOINT_SNAP_PX): Point {
  let best: Point | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best ?? point;
}

export function snapToGrid(point: Point, gridSize = GRID_SIZE_PX): Point {
  return { x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize };
}

/** Full pipeline used while drawing a new perimeter segment: angle snap
 * against the segment's own start point, then endpoint snap against other
 * placed vertices, then a light grid snap as a final fallback. */
export function snapDrawPoint(origin: Point, raw: Point, otherVertices: Point[]): Point {
  const angled = snapAngle(origin, raw);
  const endpointSnapped = snapToEndpoints(angled, otherVertices);
  if (endpointSnapped !== angled) return endpointSnapped;
  return snapToGrid(angled);
}

function closestPointOnSegment(p: Point, a: Point, b: Point) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-6) return { point: a, t: 0 };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { point: { x: a.x + abx * t, y: a.y + aby * t }, t };
}

const WALL_SNAP_THRESHOLD_PX = 40;

/** Snaps a door/window drop point onto the nearest wall segment, returning
 * the projected point, the wall it snapped to, and the wall's angle (so the
 * opening's rotation lines up with the wall automatically). Returns null
 * when nothing is close enough, so callers can fall back to a free position. */
export function snapPointToWalls(
  point: Point,
  walls: WallElement[],
): { point: Point; wallId: string; angle: number } | null {
  let best: { point: Point; wallId: string; angle: number; dist: number } | null = null;
  for (const wall of walls) {
    const a = { x: wall.startX, y: wall.startY };
    const b = { x: wall.endX, y: wall.endY };
    const { point: proj } = closestPointOnSegment(point, a, b);
    const dist = Math.hypot(proj.x - point.x, proj.y - point.y);
    if (dist < WALL_SNAP_THRESHOLD_PX && (!best || dist < best.dist)) {
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      best = { point: proj, wallId: wall.id, angle, dist };
    }
  }
  return best ? { point: best.point, wallId: best.wallId, angle: best.angle } : null;
}
