"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

export type Camera = { x: number; y: number; zoom: number };
export type Point = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

const WORLD_PADDING = 300;
// Fraction of the available viewport the room should occupy on Fit — the
// plan should read as filling the canvas, with just enough margin left for
// pan affordance and the floating toolbars. Works for any room size/aspect
// ratio since it's applied to whichever dimension is the tighter fit.
const FIT_MARGIN = 0.88;
const MIN_VISIBLE = 80;
const ANIM_DURATION = 280;
const STEP_FACTOR = 1.25;

// Inverse-zoom compensation for in-node UI (labels, badges, the ⋯ menu):
// geometry scales with the world, but text/controls should stay close to
// their zoom-1 screen size instead of shrinking/growing with it. Clamped so
// zooming far out doesn't leave giant labels, and zooming in doesn't shrink
// them to nothing.
const UI_SCALE_MIN = 0.85;
const UI_SCALE_MAX = 1.25;

function uiScaleFor(zoom: number) {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, 1 / zoom));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function useRoomCamera({
  roomWidth,
  roomHeight,
  bounds,
  boundsMargin = WORLD_PADDING,
  minZoomMode = "fixed",
  minZoomFixed = MIN_ZOOM,
  minZoomFactor = 0.9,
}: {
  roomWidth: number;
  roomHeight: number;
  /** Content bounds to fit/clamp against, in world px. Defaults to the full
   * room canvas ({0,0,roomWidth,roomHeight}) — i.e. today's behavior. */
  bounds?: Bounds;
  /** Pan slack added around `bounds`. Defaults to the historical WORLD_PADDING
   * so callers that don't pass `bounds` see byte-identical clamping. */
  boundsMargin?: number;
  /** "fixed" (default) keeps the global MIN_ZOOM/minZoomFixed — today's
   * behavior, used by the Room Builder. "relativeToFit" derives the minimum
   * zoom from this room's own fit zoom (minZoom = fitZoom * minZoomFactor)
   * so a small room can't be zoomed out into a postage stamp. */
  minZoomMode?: "fixed" | "relativeToFit";
  minZoomFixed?: number;
  minZoomFactor?: number;
}) {
  const worldRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const [camera, setCamera] = useState<Camera>(cameraRef.current);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const animFrameRef = useRef<number | null>(null);
  const syncPendingRef = useRef(false);
  const minZoomRef = useRef(minZoomFixed);
  const [minZoom, setMinZoom] = useState(minZoomRef.current);
  const effectiveBounds = useMemo<Bounds>(
    () => bounds ?? { minX: 0, minY: 0, maxX: roomWidth, maxY: roomHeight },
    [bounds, roomWidth, roomHeight],
  );

  const clampZoom = useCallback((zoom: number) => Math.min(MAX_ZOOM, Math.max(minZoomRef.current, zoom)), []);

  const applyTransform = useCallback((cam: Camera) => {
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`;
    // Set once here (imperatively, every frame) instead of via React state so
    // panning/pinch-zoom don't force a re-render of every table node — nodes
    // read it back with CSS var(--ui-scale, 1), inherited through the DOM.
    el.style.setProperty("--ui-scale", String(uiScaleFor(cam.zoom)));
  }, []);

  const scheduleSync = useCallback(() => {
    if (syncPendingRef.current) return;
    syncPendingRef.current = true;
    requestAnimationFrame(() => {
      syncPendingRef.current = false;
      setCamera(cameraRef.current);
    });
  }, []);

  const clamp = useCallback(
    (cam: Camera): Camera => {
      const zoom = clampZoom(cam.zoom);
      const { width: vw, height: vh } = viewportSizeRef.current;
      if (!vw || !vh) return { x: cam.x, y: cam.y, zoom };

      const minX0 = effectiveBounds.minX - boundsMargin;
      const minY0 = effectiveBounds.minY - boundsMargin;
      const maxX0 = effectiveBounds.maxX + boundsMargin;
      const maxY0 = effectiveBounds.maxY + boundsMargin;

      let x = cam.x;
      let y = cam.y;

      const leftEdge = x + minX0 * zoom;
      const rightEdge = x + maxX0 * zoom;
      if (rightEdge < MIN_VISIBLE) x += MIN_VISIBLE - rightEdge;
      if (leftEdge > vw - MIN_VISIBLE) x -= leftEdge - (vw - MIN_VISIBLE);

      const topEdge = y + minY0 * zoom;
      const bottomEdge = y + maxY0 * zoom;
      if (bottomEdge < MIN_VISIBLE) y += MIN_VISIBLE - bottomEdge;
      if (topEdge > vh - MIN_VISIBLE) y -= topEdge - (vh - MIN_VISIBLE);

      return { x, y, zoom };
    },
    [effectiveBounds, boundsMargin, clampZoom],
  );

  const commit = useCallback(
    (cam: Camera) => {
      const next = clamp(cam);
      cameraRef.current = next;
      applyTransform(next);
      scheduleSync();
      return next;
    },
    [clamp, applyTransform, scheduleSync],
  );

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      stopAnimation();
      const cur = cameraRef.current;
      commit({ x: cur.x + dx, y: cur.y + dy, zoom: cur.zoom });
    },
    [commit, stopAnimation],
  );

  const zoomAt = useCallback(
    (point: Point, newZoomRaw: number) => {
      stopAnimation();
      const cur = cameraRef.current;
      const newZoom = clampZoom(newZoomRaw);
      const worldX = (point.x - cur.x) / cur.zoom;
      const worldY = (point.y - cur.y) / cur.zoom;
      commit({ x: point.x - newZoom * worldX, y: point.y - newZoom * worldY, zoom: newZoom });
    },
    [commit, stopAnimation, clampZoom],
  );

  const animateTo = useCallback(
    (target: Camera) => {
      stopAnimation();
      const start = cameraRef.current;
      const t0 = performance.now();
      function frame(now: number) {
        const t = Math.min(1, (now - t0) / ANIM_DURATION);
        const e = easeOutCubic(t);
        commit({
          x: start.x + (target.x - start.x) * e,
          y: start.y + (target.y - start.y) * e,
          zoom: start.zoom + (target.zoom - start.zoom) * e,
        });
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(frame);
        } else {
          animFrameRef.current = null;
        }
      }
      animFrameRef.current = requestAnimationFrame(frame);
    },
    [commit, stopAnimation],
  );

  const computeFit = useCallback((): Camera | null => {
    const { width: vw, height: vh } = viewportSizeRef.current;
    if (!vw || !vh) return null;
    const boundsWidth = effectiveBounds.maxX - effectiveBounds.minX;
    const boundsHeight = effectiveBounds.maxY - effectiveBounds.minY;
    if (boundsWidth <= 0 || boundsHeight <= 0) return null;
    const rawScale = Math.min(vw / boundsWidth, vh / boundsHeight) * FIT_MARGIN;
    // Clamped only against MAX_ZOOM here (not the dynamic minZoom, which for
    // "relativeToFit" is itself derived from this fit — see below).
    const fitZoom = Math.min(MAX_ZOOM, Math.max(0.001, rawScale));
    if (minZoomMode === "relativeToFit") {
      const nextMinZoom = fitZoom * minZoomFactor;
      minZoomRef.current = nextMinZoom;
      setMinZoom(nextMinZoom);
    }
    const zoom = clampZoom(fitZoom);
    return {
      x: (vw - boundsWidth * zoom) / 2 - effectiveBounds.minX * zoom,
      y: (vh - boundsHeight * zoom) / 2 - effectiveBounds.minY * zoom,
      zoom,
    };
  }, [effectiveBounds, minZoomMode, minZoomFactor, clampZoom]);

  const fitRoom = useCallback(
    (animate = true) => {
      const target = computeFit();
      if (!target) return;
      if (animate) animateTo(target);
      else commit(target);
    },
    [computeFit, animateTo, commit],
  );

  const reset100 = useCallback(() => {
    const { width: vw, height: vh } = viewportSizeRef.current;
    const center = vw && vh ? { x: vw / 2, y: vh / 2 } : { x: cameraRef.current.x, y: cameraRef.current.y };
    const cur = cameraRef.current;
    const worldX = (center.x - cur.x) / cur.zoom;
    const worldY = (center.y - cur.y) / cur.zoom;
    animateTo({ x: center.x - 1 * worldX, y: center.y - 1 * worldY, zoom: 1 });
  }, [animateTo]);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const { width: vw, height: vh } = viewportSizeRef.current;
      const center = vw && vh ? { x: vw / 2, y: vh / 2 } : { x: 0, y: 0 };
      zoomAt(center, cameraRef.current.zoom * (direction > 0 ? STEP_FACTOR : 1 / STEP_FACTOR));
    },
    [zoomAt],
  );

  const getZoom = useCallback(() => cameraRef.current.zoom, []);

  // Measure the viewport synchronously before first paint so the initial Fit
  // Room doesn't flash at the default {0,0,1} camera, then keep the size
  // fresh via ResizeObserver without ever re-fitting automatically.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    viewportSizeRef.current = { width: rect.width, height: rect.height };
    const initial = computeFit();
    if (initial) {
      cameraRef.current = initial;
      applyTransform(initial);
      setCamera(initial);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      viewportSizeRef.current = { width: entry.contentRect.width, height: entry.contentRect.height };
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    camera,
    worldRef,
    viewportRef,
    getZoom,
    panBy,
    zoomAt,
    fitRoom,
    reset100,
    stepZoom,
    minZoom,
  };
}
