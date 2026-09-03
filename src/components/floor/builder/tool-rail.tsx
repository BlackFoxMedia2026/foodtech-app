"use client";

import { Blocks, LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCategory } from "./element-library-panel";

const RAIL_ITEMS: { key: ToolCategory; label: string; icon: typeof Blocks }[] = [
  { key: "structure", label: "Struttura", icon: Blocks },
  { key: "areas", label: "Aree", icon: LayoutGrid },
  { key: "tables", label: "Tavoli", icon: Table2 },
];

/** Icon-only category rail for the Room Builder — an Illustrator/Canva-style
 * tool switcher (brief §26-28): pick a category, the adjoining panel swaps to
 * show its tools. Always visible, unlike the collapsible inspector. */
export function ToolRail({ active, onChange }: { active: ToolCategory; onChange: (next: ToolCategory) => void }) {
  return (
    <nav
      aria-label="Categorie strumenti"
      className="flex w-[72px] shrink-0 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2 text-card-foreground"
    >
      {RAIL_ITEMS.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={isActive}
            title={item.label}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md border px-1.5 py-2.5 text-center text-[10px] leading-tight transition-colors",
              isActive
                ? "border-accent-strong bg-accent-strong/10 text-accent-strong"
                : "border-transparent text-muted-foreground hover:bg-secondary hover:text-card-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
