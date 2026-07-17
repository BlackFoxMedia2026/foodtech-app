"use client";

import { useEffect, useRef } from "react";

/**
 * The palette the ambient scene cycles through — the same ember stops used
 * elsewhere in the app (see DESIGN.md), so the shared variables stay within
 * the documented brand hues instead of drifting into arbitrary colors.
 */
const EMBER_STOPS = ["#9A4519", "#D98B4A", "#71370F", "#57290C"];

const CYCLE_MS = 16000;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixHex(a: string, b: string, t: number) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bch = Math.round(ab + (bb - ab) * t);
  return `rgb(${r} ${g} ${bch})`;
}

/**
 * Single shared driver for the app shell's ambient light: one rAF loop writes
 * CSS custom properties directly onto the returned ref (no React state, no
 * re-renders). Anything nested under this ref — the mesh background, the
 * sidebar glass — reads the same variables via normal CSS inheritance, so
 * they move together instead of running two unrelated animations.
 */
export function useAmbientGlass<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const start = performance.now();

    const applyFrame = (phase: number) => {
      const angle = phase * 360;
      const x = 50 + 22 * Math.cos(phase * Math.PI * 2);
      const y = 50 + 18 * Math.sin(phase * Math.PI * 2);

      const stopCount = EMBER_STOPS.length;
      const scaled = phase * stopCount;
      const i0 = ((Math.floor(scaled) % stopCount) + stopCount) % stopCount;
      const localT = scaled - Math.floor(scaled);

      const color1 = mixHex(EMBER_STOPS[i0], EMBER_STOPS[(i0 + 1) % stopCount], localT);
      const color2 = mixHex(EMBER_STOPS[(i0 + 1) % stopCount], EMBER_STOPS[(i0 + 2) % stopCount], localT);
      const color3 = mixHex(EMBER_STOPS[(i0 + 2) % stopCount], EMBER_STOPS[(i0 + 3) % stopCount], localT);

      const intensity = 0.75 + 0.25 * Math.sin(phase * Math.PI * 2);
      const lightness = 0.8 + 0.2 * Math.cos(phase * Math.PI * 2 * 0.7);

      const style = node.style;
      style.setProperty("--gradient-angle", `${angle.toFixed(1)}deg`);
      style.setProperty("--gradient-x", `${x.toFixed(1)}%`);
      style.setProperty("--gradient-y", `${y.toFixed(1)}%`);
      style.setProperty("--gradient-color-1", color1);
      style.setProperty("--gradient-color-2", color2);
      style.setProperty("--gradient-color-3", color3);
      style.setProperty("--gradient-intensity", intensity.toFixed(3));
      style.setProperty("--gradient-lightness", lightness.toFixed(3));
    };

    applyFrame(0);
    if (reducedMotionQuery.matches) return;

    const tick = (now: number) => {
      applyFrame(((now - start) % CYCLE_MS) / CYCLE_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMotionChange = () => {
      if (reducedMotionQuery.matches) {
        cancelAnimationFrame(raf);
        applyFrame(0);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    reducedMotionQuery.addEventListener("change", onMotionChange);

    return () => {
      cancelAnimationFrame(raf);
      reducedMotionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return ref;
}
