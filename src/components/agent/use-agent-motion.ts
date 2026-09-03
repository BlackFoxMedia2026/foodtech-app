"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { AgentVisualState } from "./agent-visual";

const EYE_MAX_X = 3.5;
const EYE_MAX_Y = 2.5;
const CORE_MAX_X = 0.8;
const CORE_MAX_Y = 0.6;
/** Waves drift a little *against* the cursor — a subtle counterweight that
 * reads as depth against the eyes/core leaning toward it. */
const WAVES_MAX_X = 0.4;
const WAVES_MAX_Y = 0.3;

/** Pointer-to-center distance (px) that maps to the full ±1 direction. */
const SENSITIVITY = 280;
/** Beyond this distance from the agent, tracking intensity settles at its floor
 * instead of staying pinned at max — "mouse lontano -> movimento più lieve". */
const PROXIMITY_FALLOFF = 1000;
const PROXIMITY_FLOOR = 0.5;

const SMOOTH_NORMAL = 0.22;
const SMOOTH_HOVER = 0.32;
/** Slow, deliberate ease back to center once the pointer has left the window. */
const SMOOTH_LEAVING = 0.06;

/** How long the pointer can sit still before the eyes start to relax off-target. */
const IDLE_HOLD_MS = 2200;
/** Time to reach max relax once the hold period has elapsed. */
const IDLE_RELAX_RAMP_MS = 1800;
/** Eyes never drift further than this fraction back toward center on their own —
 * "si rilassano leggermente", never all the way, and tracking resumes instantly
 * the moment the pointer moves again. */
const IDLE_RELAX_MAX = 0.45;

/** Processing: eyes stay clearly active, just noticeably tighter (idle ±3.5 -> ~±2.5). */
const PROCESSING_PULL = 0.72;

/** Per-frame ease toward the waves' target playback rate / amplitude — this is
 * what makes idle<->processing a gradual spin up/down instead of a hard cut. */
const WAVE_RATE_EASE = 0.045;

const WAVE_RATE: Record<AgentVisualState, number> = { idle: 1, hover: 1.22, active: 1.1, processing: 2.35, done: 1 };
const WAVE_AMP: Record<AgentVisualState, number> = { idle: 1, hover: 1.3, active: 1.15, processing: 1.9, done: 1 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type MotionOptions = {
  wrapperRef: RefObject<HTMLElement>;
  /** The element carrying the CSS `agent-waves-drift` animation itself (its
   * playback rate is driven here every frame). */
  wavesRef: RefObject<HTMLElement>;
  wavesParallaxRef: RefObject<HTMLElement>;
  /** Outer wrapper carrying the slower `agent-waves-morph` animation — gets
   * its own playback-rate nudge plus the shared `--wave-amp` custom property
   * (set once here so it inherits down to wavesRef's keyframe too, instead
   * of being written twice). */
  wavesMorphRef: RefObject<HTMLElement>;
  coreParallaxRef: RefObject<HTMLElement>;
  eyesRef: RefObject<HTMLElement>;
  /** false under prefers-reduced-motion — the hook fully no-ops. */
  active: boolean;
  state: AgentVisualState;
};

/**
 * Single rAF loop driving every bit of motion that reacts to the pointer or
 * to the agent's state, entirely outside React state: eyes + core + waves
 * all get their offsets written as CSS custom properties, and the waves'
 * rhythm (speed + amplitude) is eased via the Web Animations API's
 * `playbackRate` rather than swapping `animation-duration` — the browser
 * can't tween a duration change, so a straight swap reads as a snap; a
 * per-frame lerp toward a target rate is what makes idle -> processing feel
 * like something spinning up, not a CSS class flipping.
 */
export function useAgentMotion({
  wrapperRef,
  wavesRef,
  wavesParallaxRef,
  wavesMorphRef,
  coreParallaxRef,
  eyesRef,
  active,
  state,
}: MotionOptions) {
  const pointer = useRef({ x: 0, y: 0, has: false, inViewport: true, lastMoveAt: 0 });
  const current = useRef({ ex: 0, ey: 0, cx: 0, cy: 0, wx: 0, wy: 0, rate: 1, amp: 1 });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!active) return;

    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
      pointer.current.has = true;
      pointer.current.inViewport = true;
      pointer.current.lastMoveAt = performance.now();
    }
    function onDocumentMouseOut(e: MouseEvent) {
      // relatedTarget is null only when the pointer actually left the
      // browser window, not when it moves between elements inside it.
      if (!e.relatedTarget) pointer.current.inViewport = false;
    }

    if (!isCoarsePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("mouseout", onDocumentMouseOut);
    }

    let raf = 0;
    function tick() {
      const wrapper = wrapperRef.current;
      const currentState = stateRef.current;
      const now = performance.now();

      let ratioX = 0;
      let ratioY = 0;
      let smoothing = SMOOTH_NORMAL;

      if (wrapper && pointer.current.has) {
        if (!pointer.current.inViewport) {
          smoothing = SMOOTH_LEAVING; // ratio stays 0 — slow drift back to center
        } else {
          const rect = wrapper.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const dx = pointer.current.x - centerX;
          const dy = pointer.current.y - centerY;
          const distance = Math.hypot(dx, dy);
          const proximity = clamp(1 - distance / PROXIMITY_FALLOFF, PROXIMITY_FLOOR, 1);

          const idleFor = now - pointer.current.lastMoveAt;
          const relaxT = clamp((idleFor - IDLE_HOLD_MS) / IDLE_RELAX_RAMP_MS, 0, 1);
          const relax = 1 - relaxT * IDLE_RELAX_MAX;

          ratioX = clamp(dx / SENSITIVITY, -1, 1) * proximity * relax;
          ratioY = clamp(dy / SENSITIVITY, -1, 1) * proximity * relax;
          smoothing = currentState === "hover" ? SMOOTH_HOVER : SMOOTH_NORMAL;
        }
      }

      const pull = currentState === "processing" ? PROCESSING_PULL : 1;
      const targetEx = ratioX * EYE_MAX_X * pull;
      const targetEy = ratioY * EYE_MAX_Y * pull;
      const targetCx = ratioX * CORE_MAX_X * pull;
      const targetCy = ratioY * CORE_MAX_Y * pull;
      const targetWx = -ratioX * WAVES_MAX_X * pull;
      const targetWy = -ratioY * WAVES_MAX_Y * pull;

      const c = current.current;
      c.ex += (targetEx - c.ex) * smoothing;
      c.ey += (targetEy - c.ey) * smoothing;
      c.cx += (targetCx - c.cx) * smoothing * 0.8;
      c.cy += (targetCy - c.cy) * smoothing * 0.8;
      c.wx += (targetWx - c.wx) * smoothing * 0.6;
      c.wy += (targetWy - c.wy) * smoothing * 0.6;

      eyesRef.current?.style.setProperty("--eye-x", `${c.ex.toFixed(2)}px`);
      eyesRef.current?.style.setProperty("--eye-y", `${c.ey.toFixed(2)}px`);
      coreParallaxRef.current?.style.setProperty("--core-x", `${c.cx.toFixed(2)}px`);
      coreParallaxRef.current?.style.setProperty("--core-y", `${c.cy.toFixed(2)}px`);
      wavesParallaxRef.current?.style.setProperty("--waves-x", `${c.wx.toFixed(2)}px`);
      wavesParallaxRef.current?.style.setProperty("--waves-y", `${c.wy.toFixed(2)}px`);

      c.rate += (WAVE_RATE[currentState] - c.rate) * WAVE_RATE_EASE;
      c.amp += (WAVE_AMP[currentState] - c.amp) * WAVE_RATE_EASE;
      const wavesEl = wavesRef.current;
      const wavesMorphEl = wavesMorphRef.current;
      // Set once on the outer wrapper — custom properties inherit down
      // through the DOM, so the inner drift keyframe (on wavesEl, a
      // descendant of wavesMorphEl) reads the same value for free.
      wavesMorphEl?.style.setProperty("--wave-amp", c.amp.toFixed(3));
      // Only the continuous drift/morph animations are rate-controlled — a
      // click/response-ready transient briefly swaps in a different
      // (short, one-shot) keyframe and must play at its own authored speed,
      // not whatever rate processing last left behind. Both layers share
      // the same rate so processing/hover speeds up the whole composite
      // without collapsing their independent phase drift (their base
      // durations differ, so a shared multiplier keeps them out of sync).
      if (wavesEl) {
        for (const anim of wavesEl.getAnimations()) {
          if (anim instanceof CSSAnimation && anim.animationName === "agent-waves-drift") {
            anim.playbackRate = c.rate;
          }
        }
      }
      if (wavesMorphEl) {
        for (const anim of wavesMorphEl.getAnimations()) {
          if (anim instanceof CSSAnimation && anim.animationName === "agent-waves-morph") {
            anim.playbackRate = c.rate;
          }
        }
      }

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseout", onDocumentMouseOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
