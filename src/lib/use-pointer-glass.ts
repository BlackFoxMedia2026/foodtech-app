"use client";

import { useEffect, useRef } from "react";

/**
 * Local mouse-reactive highlight for a single glass surface. Deliberately
 * separate from useAmbientGlass: the ambient scene is shared/global, this is
 * scoped to whichever element the ref is attached to, native listener + rAF,
 * no React state so movement never triggers a re-render. Skipped on coarse
 * (touch) pointers and prefers-reduced-motion — ambient animation only there.
 */
export function usePointerGlass<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarsePointer || reducedMotion) return;

    let raf = 0;
    let pending: { x: number; y: number } | null = null;

    const apply = () => {
      raf = 0;
      if (!pending) return;
      node.style.setProperty("--mouse-x", `${pending.x.toFixed(1)}%`);
      node.style.setProperty("--mouse-y", `${pending.y.toFixed(1)}%`);
    };

    const onMove = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      pending = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      pending = { x: 50, y: 28 };
      if (!raf) raf = requestAnimationFrame(apply);
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);

    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
