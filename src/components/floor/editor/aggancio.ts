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

/* ─────────────────────── la calamita delle linee ─────────────────────── */

/**
 * Le direzioni che attirano: orizzontale, verticale e le due oblique a 45°.
 *
 * È una calamita e non uno scatto a passi. Entro `SOGLIA_CALAMITA_GRADI` da
 * una di queste la linea ci si mette da sola; oltre, resta esattamente dove
 * la mano la porta. Così un muro dritto viene dritto senza fatica, e un muro
 * a 30° resta possibile senza dover tenere premuto niente.
 */
const DIREZIONI_CALAMITA_GRADI = [0, 45, 90, 135, 180, 225, 270, 315];
export const SOGLIA_CALAMITA_GRADI = 5;
/** Un capo di muro vicino al capo di un altro ci si incolla: è così che un
 * perimetro si chiude senza lasciare uno spiraglio di un pixel. */
export const SOGLIA_CAPI_PX = 14;

function normalizza(gradi: number) {
  return ((gradi % 360) + 360) % 360;
}

/** L'angolo attirato verso la direzione più vicina, o l'angolo stesso se
 * nessuna è abbastanza vicina. Vale per una linea e per una rotazione. */
export function calamitaAngolo(gradi: number, soglia = SOGLIA_CALAMITA_GRADI): number {
  const g = normalizza(gradi);
  for (const d of DIREZIONI_CALAMITA_GRADI.concat(360)) {
    if (Math.abs(g - d) <= soglia) return d % 360;
  }
  return g;
}

/** Due capi che stanno quasi sulla stessa riga o colonna si allineano: è
 * così che i muri di una stanza vengono in squadra fra loro anche se sono
 * stati disegnati lontani. */
export const SOGLIA_ALLINEA_PX = 8;

export type Linea = { a: Point; b: Point };

/** Dove un raggio che parte da `origine` lungo `direzione` incontra il
 * segmento `l`, se lo incontra. */
function incrocio(origine: Point, direzione: Point, l: Linea): Point | null {
  const sx = l.b.x - l.a.x;
  const sy = l.b.y - l.a.y;
  const den = direzione.x * sy - direzione.y * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = l.a.x - origine.x;
  const qy = l.a.y - origine.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * direzione.y - qy * direzione.x) / den;
  if (t < 0 || u < 0 || u > 1) return null;
  return { x: origine.x + direzione.x * t, y: origine.y + direzione.y * t };
}

/**
 * Dove mettere il capo di una linea che si sta trascinando, dato l'altro
 * capo fermo (`fisso`). In ordine di precedenza:
 *
 * 1. **il capo di un'altra linea** — un angolo chiuso conta più di tutto;
 * 2. **la direzione** — orizzontale, verticale, 45°;
 * 3. **il corpo di un'altra linea** — un divisorio che arriva a un muro si
 *    ferma sul muro (un incrocio a T), lungo la direzione già scelta;
 * 4. **la riga o la colonna di un altro capo** — se la direzione non ha già
 *    deciso quell'asse.
 *
 * Fuori da tutte le soglie il capo resta dove la mano lo porta.
 */
export function calamitaCapo(fisso: Point, punto: Point, altriCapi: Point[], altreLinee: Linea[] = []): Point {
  const sulCapo = snapToEndpoints(punto, altriCapi, SOGLIA_CAPI_PX);
  if (sulCapo !== punto) return sulCapo;

  const dx = punto.x - fisso.x;
  const dy = punto.y - fisso.y;
  const lunghezza = Math.hypot(dx, dy);
  if (lunghezza < 1) return punto;
  const gradi = (Math.atan2(dy, dx) * 180) / Math.PI;
  const attirato = calamitaAngolo(gradi);
  const dritta = attirato !== normalizza(gradi);
  let p = punto;
  if (dritta) {
    const rad = (attirato * Math.PI) / 180;
    p = { x: fisso.x + Math.cos(rad) * lunghezza, y: fisso.y + Math.sin(rad) * lunghezza };
  }

  // Il corpo di un'altra linea: si prende la più vicina entro soglia.
  let migliore: { punto: Point; d: number } | null = null;
  for (const l of altreLinee) {
    const { point: proiezione } = closestPointOnSegment(p, l.a, l.b);
    const d = Math.hypot(proiezione.x - p.x, proiezione.y - p.y);
    if (d >= SOGLIA_CAPI_PX || (migliore && d >= migliore.d)) continue;
    // Se la direzione è già stata scelta la si tiene: il capo scivola lungo
    // la propria retta fino al muro, invece di storcersi verso il punto più
    // vicino. Se la retta non lo incontra, vale il punto più vicino.
    const lungoLaRetta = dritta
      ? incrocio(fisso, { x: (p.x - fisso.x) / lunghezza, y: (p.y - fisso.y) / lunghezza }, l)
      : null;
    const scelto =
      lungoLaRetta && Math.hypot(lungoLaRetta.x - p.x, lungoLaRetta.y - p.y) < SOGLIA_CAPI_PX * 2
        ? lungoLaRetta
        : proiezione;
    migliore = { punto: scelto, d };
  }
  if (migliore) return migliore.punto;

  // La riga e la colonna degli altri capi, sugli assi che la direzione non
  // ha già fissato: su una linea orizzontale si allinea solo la x (la y la
  // decide l'orizzontale), su una obliqua niente (spostarla la storcerebbe).
  const fissaX = dritta && (attirato === 90 || attirato === 270);
  const fissaY = dritta && (attirato === 0 || attirato === 180);
  const obliqua = dritta && !fissaX && !fissaY;
  if (obliqua) return p;
  let x = p.x;
  let y = p.y;
  let bestX = SOGLIA_ALLINEA_PX;
  let bestY = SOGLIA_ALLINEA_PX;
  for (const c of altriCapi) {
    if (!fissaX && Math.abs(c.x - p.x) < bestX) {
      bestX = Math.abs(c.x - p.x);
      x = c.x;
    }
    if (!fissaY && Math.abs(c.y - p.y) < bestY) {
      bestY = Math.abs(c.y - p.y);
      y = c.y;
    }
  }
  return x === p.x && y === p.y ? p : { x, y };
}

/**
 * Lo spostamento extra per portare una linea intera, mentre la si trascina,
 * con uno dei suoi capi sul capo di un'altra. Zero se nessun capo è vicino.
 */
export function calamitaLinea(capi: [Point, Point], altriCapi: Point[]): Point {
  let migliore: Point = { x: 0, y: 0 };
  let distanza = SOGLIA_CAPI_PX;
  for (const capo of capi) {
    for (const altro of altriCapi) {
      const d = Math.hypot(altro.x - capo.x, altro.y - capo.y);
      if (d < distanza) {
        distanza = d;
        migliore = { x: altro.x - capo.x, y: altro.y - capo.y };
      }
    }
  }
  return migliore;
}
