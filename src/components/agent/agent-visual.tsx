"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentMotion } from "./use-agent-motion";

export type AgentVisualState = "idle" | "hover" | "active" | "processing" | "done";

/**
 * Raster design, see /public/agent — waves/core/eyes are three aligned
 * layers of the same master (agent-master.webp, used verbatim as the
 * reduced-motion / no-JS fallback). This component only supplies movement:
 * it must never redraw or reinterpret the mark itself (no SVG, no CSS
 * shapes, no filters/recoloring) — the asset is the final design.
 */
const ASSET = {
  waves: "/agent/agent-waves.webp",
  core: "/agent/agent-core.webp",
  eyes: "/agent/agent-eyes.webp",
  master: "/agent/agent-master.webp",
} as const;

export function AgentVisual({
  state = "idle",
  size = 22,
  className,
}: {
  state?: AgentVisualState;
  size?: number;
  className?: string;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [transient, setTransient] = useState<"opening" | "done" | null>(null);
  const prevStateRef = useRef(state);

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const wavesRef = useRef<HTMLImageElement>(null);
  const wavesParallaxRef = useRef<HTMLSpanElement>(null);
  const wavesMorphRef = useRef<HTMLSpanElement>(null);
  const coreParallaxRef = useRef<HTMLSpanElement>(null);
  const eyesRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // One-shot transient reactions, triggered by state *transitions* rather
  // than the state itself: opening the chat and a processing turn landing.
  // Eyes are deliberately left alone here — they keep tracking the pointer
  // straight through both, per the brief's non-negotiable rule.
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (prev !== "active" && state === "active") {
      setTransient("opening");
      const t = setTimeout(() => setTransient(null), 200);
      return () => clearTimeout(t);
    }
    if (prev === "processing" && state !== "processing") {
      setTransient("done");
      const t = setTimeout(() => setTransient(null), 380);
      return () => clearTimeout(t);
    }
  }, [state]);

  useAgentMotion({
    wrapperRef,
    wavesRef,
    wavesParallaxRef,
    wavesMorphRef,
    coreParallaxRef,
    eyesRef,
    active: !reducedMotion,
    state,
  });

  if (reducedMotion) {
    return (
      <span className={cn("agent-visual", className)} style={{ width: size, height: size }} data-state={state} aria-hidden="true">
        <img src={ASSET.master} alt="" className="agent-visual__layer agent-visual__master" draggable={false} />
      </span>
    );
  }

  return (
    <span
      ref={wrapperRef}
      className={cn("agent-visual", className)}
      style={{ width: size, height: size }}
      data-state={state}
      data-transient={transient ?? undefined}
      data-paused={paused || undefined}
      aria-hidden="true"
    >
      {/* No static master underneath: core.webp has a real transparent
          cutout where the eyes sit, so a full master layer behind it would
          keep showing its own (centered, non-tracking) eyes through that
          cutout — a ghost pair trailing the real ones. Only reduced-motion
          (above) uses the flattened master. */}
      <span ref={wavesParallaxRef} className="agent-visual__waves-parallax">
        {/* Two independently-timed transforms stacked on the same single
            raster layer (there's no separate green/brown/cream asset to
            stagger) — a slow outer scale/skew morph plus a faster inner
            drift, at durations that never resync, so the composite reads as
            fluid and asynchronous instead of one rotating ring. */}
        <span ref={wavesMorphRef} className="agent-visual__waves-morph">
          <img ref={wavesRef} src={ASSET.waves} alt="" className="agent-visual__layer agent-visual__waves" draggable={false} />
        </span>
      </span>
      <span ref={coreParallaxRef} className="agent-visual__core-parallax">
        <img src={ASSET.core} alt="" className="agent-visual__layer agent-visual__core" draggable={false} />
      </span>
      <img ref={eyesRef} src={ASSET.eyes} alt="" className="agent-visual__layer agent-visual__eyes" draggable={false} />
    </span>
  );
}
