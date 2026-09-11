"use client";

import { cn } from "@/lib/utils";

export type SalaTab = "modifica" | "anteprima" | "vedi-originale";

const TABS: { key: SalaTab; label: string }[] = [
  { key: "modifica", label: "Modifica" },
  { key: "anteprima", label: "Anteprima" },
  { key: "vedi-originale", label: "Vedi originale" },
];

/**
 * Shared Modifica/Anteprima/Vedi originale switcher (SCREEN 1 reference) —
 * rendered both in the normal Sala page header (where "Modifica" is a
 * momentary trigger that opens the full-screen Room Builder rather than a
 * persisted tab) and inside the Room Builder's own header (where "Modifica"
 * is the active tab and the other two close it back to the page). The
 * caller decides what each selection does; this only owns the look.
 */
export function SalaTabs({ active, onSelect, disabled }: { active: SalaTab; onSelect: (tab: SalaTab) => void; disabled?: SalaTab[] }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 text-card-foreground">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const isDisabled = disabled?.includes(tab.key);
        return (
          <button
            key={tab.key}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(tab.key)}
            aria-pressed={isActive}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isDisabled && "cursor-not-allowed opacity-50",
              isActive ? "bg-cream text-clay-ink" : !isDisabled && "text-muted-foreground hover:bg-secondary hover:text-card-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
