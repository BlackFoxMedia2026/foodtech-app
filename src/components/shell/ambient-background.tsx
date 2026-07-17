/**
 * Ambient page background — exact markup/CSS as provided by design, kept
 * unmodified (values, colors, timing). Centralized here so the three
 * animated layers aren't duplicated across every page that uses it.
 */
export function AmbientBackground() {
  return (
    <div className="bg-anim">
      {/* base scura sempre visibile */}
      <div className="bg-base" />
      {/* layer A */}
      <div
        className="bg-layer"
        style={{
          animationDelay: "0s",
          background: `
            radial-gradient(70% 60% at 96% 22%, rgba(245,160,55,0.85) 0%, rgba(245,160,55,0) 58%),
            radial-gradient(105% 95% at 108% 60%, #ff5a1e 0%, rgba(255,90,30,0) 62%),
            radial-gradient(90% 80% at 70% 116%, #e34a12 0%, rgba(227,74,18,0) 56%),
            radial-gradient(55% 55% at 2% 82%, rgba(198,52,16,0.7) 0%, rgba(198,52,16,0) 54%)`,
        }}
      />
      {/* layer B */}
      <div
        className="bg-layer"
        style={{
          animationDelay: "-9s",
          background: `
            radial-gradient(75% 70% at 6% 96%, rgba(255,95,34,0.95) 0%, rgba(255,95,34,0) 60%),
            radial-gradient(90% 85% at -8% 55%, #f0902c 0%, rgba(240,144,44,0) 60%),
            radial-gradient(85% 80% at 60% 118%, #e0480f 0%, rgba(224,72,15,0) 56%),
            radial-gradient(55% 55% at 100% 20%, rgba(230,120,40,0.55) 0%, rgba(230,120,40,0) 54%)`,
        }}
      />
      {/* layer C */}
      <div
        className="bg-layer"
        style={{
          animationDelay: "-18s",
          background: `
            radial-gradient(80% 70% at 100% 96%, rgba(255,106,36,0.95) 0%, rgba(255,106,36,0) 60%),
            radial-gradient(90% 85% at 78% 8%, #f09838 0%, rgba(240,152,56,0) 60%),
            radial-gradient(85% 80% at 108% 45%, #ff5a1e 0%, rgba(255,90,30,0) 58%),
            radial-gradient(55% 60% at 6% 30%, rgba(210,60,16,0.6) 0%, rgba(210,60,16,0) 54%)`,
        }}
      />
    </div>
  );
}
