"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Point } from "./use-room-camera";

const CLICK_MOVE_THRESHOLD = 4;

/**
 * Pan / pinch-zoom / wheel handling for a room camera viewport — extracted
 * from floor-canvas.tsx so the Room Builder canvas can share the exact same
 * background gestures (drag-to-pan, two-finger pinch, ctrl/cmd+wheel zoom)
 * without duplicating this pointer-event plumbing. Pure extraction: behavior
 * is unchanged from the original floor-canvas.tsx implementation.
 */
export function useViewportGestures({
  viewportRef,
  getZoom,
  panBy,
  zoomAt,
  onBackgroundClick,
}: {
  viewportRef: RefObject<HTMLDivElement>;
  getZoom: () => number;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (point: Point, newZoom: number) => void;
  onBackgroundClick?: (e: React.PointerEvent) => void;
}) {
  const [isPanning, setIsPanning] = useState(false);
  const pointersRef = useRef(new Map<number, Point>());
  const panStateRef = useRef<{ id: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const pinchStateRef = useRef<{ startDist: number; startZoom: number; lastMid: Point } | null>(null);

  function distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  // zoomAt() anchors on viewport-local coordinates; clientX/clientY are
  // window-relative, so every anchor point must be re-based on the
  // viewport's own bounding rect before reaching zoomAt.
  function toLocal(point: Point): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return point;
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    // React bubbles synthetic events through the *component* tree, so a
    // Radix Dialog/Popover rendered in a portal (a React descendant of this
    // viewport, but a DOM descendant of <body>) still reaches this handler.
    // Without this guard, capturing the pointer here on every such bubble
    // hijacks the dialog's own click (mousedown/mouseup end up redirected to
    // this element instead of the dialog button), silently swallowing it.
    // Node.contains() checks *real* DOM containment, which correctly says
    // "no" for portaled content even though React says "yes".
    const viewport = e.currentTarget as HTMLElement;
    if (!(e.target instanceof Node) || !viewport.contains(e.target)) return;

    viewport.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      panStateRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: false };
      setIsPanning(true);
    } else if (pointersRef.current.size === 2) {
      panStateRef.current = null;
      const pts = Array.from(pointersRef.current.values());
      pinchStateRef.current = {
        startDist: distance(pts[0], pts[1]),
        startZoom: getZoom(),
        lastMid: midpoint(pts[0], pts[1]),
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchStateRef.current && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = distance(pts[0], pts[1]);
      const mid = midpoint(pts[0], pts[1]);
      const scaleFactor = dist / (pinchStateRef.current.startDist || 1);
      zoomAt(toLocal(mid), pinchStateRef.current.startZoom * scaleFactor);
      panBy(mid.x - pinchStateRef.current.lastMid.x, mid.y - pinchStateRef.current.lastMid.y);
      pinchStateRef.current.lastMid = mid;
      return;
    }

    const pan = panStateRef.current;
    if (pan && pan.id === e.pointerId) {
      const dx = e.clientX - pan.lastX;
      const dy = e.clientY - pan.lastY;
      if (Math.abs(dx) + Math.abs(dy) > CLICK_MOVE_THRESHOLD) pan.moved = true;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      panBy(dx, dy);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const pan = panStateRef.current;
    const wasPanPointer = pan?.id === e.pointerId;
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) pinchStateRef.current = null;

    if (wasPanPointer) {
      if (!pan.moved) onBackgroundClick?.(e);
      panStateRef.current = null;
      setIsPanning(false);
    }

    if (pointersRef.current.size === 1) {
      const [[id, pt]] = Array.from(pointersRef.current.entries());
      panStateRef.current = { id, lastX: pt.x, lastY: pt.y, moved: true };
      setIsPanning(true);
    }
  }

  // Non-passive wheel listener: plain wheel/two-finger trackpad scroll pans;
  // Ctrl/Cmd+wheel (and browser-synthesized trackpad pinch) zooms toward the
  // cursor. Scoped to the viewport so page scroll elsewhere is untouched.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el!.getBoundingClientRect();
        const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        zoomAt(point, getZoom() * Math.exp(-e.deltaY * 0.01));
      } else {
        panBy(-e.deltaX, -e.deltaY);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isPanning, onPointerDown, onPointerMove, onPointerUp, toLocal };
}
