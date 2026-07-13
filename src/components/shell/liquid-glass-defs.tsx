/**
 * Hidden SVG filter used by .liquid-sidebar__refraction (backdrop-filter:
 * url(#liquid-glass-distortion)) to bend what's actually behind the sidebar,
 * instead of a static blur. Kept static (no animated baseFrequency/seed) —
 * animating turbulence noise every frame is the expensive part of this
 * technique; the "life" of the effect comes from the animated CSS custom
 * properties consuming it, not from recomputing the noise field.
 */
export function LiquidGlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="liquid-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </svg>
  );
}
