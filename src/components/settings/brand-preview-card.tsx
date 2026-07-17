"use client";

const HEX_RE = /^#[0-9a-fA-F]{6,8}$/;

/**
 * Anteprima statica: mostra dove finiscono logo/nome/colore invece di far
 * "interpretare i codici HEX come profezie". Non applicata alla dashboard
 * reale (resta lo stile Foodtech) — è solo un mockup di come apparirebbe
 * un widget/pagina pubblica brandizzata col locale.
 */
export function BrandPreviewCard({
  name,
  logoUrl,
  primaryColor,
  secondaryColor,
}: {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const primary = primaryColor && HEX_RE.test(primaryColor) ? primaryColor : "#F44C12";
  const secondary = secondaryColor && HEX_RE.test(secondaryColor) ? secondaryColor : "#B7ADA4";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white text-carbon-900 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 p-3" style={{ backgroundColor: `${secondary}22` }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
        ) : (
          <div className="h-6 w-6 rounded bg-secondary" />
        )}
        <p className="truncate text-sm font-semibold">{name || "Il tuo ristorante"}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="h-16 rounded-md" style={{ backgroundColor: `${secondary}33` }} />
        <button
          type="button"
          disabled
          className="w-full rounded-md px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: primary }}
        >
          Prenota
        </button>
      </div>
    </div>
  );
}
