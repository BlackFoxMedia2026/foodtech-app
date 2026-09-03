"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact search that expands leftward from a fixed right edge (brief
 * sections 11-19) — a single persistent pill element toggles its `width`
 * class, so the transition animates smoothly and the trigger button next to
 * it (rendered by the parent, outside this component) never moves: this
 * element's own footprint in the flex row is a fixed 36px square at rest,
 * reserved via the outer `relative` wrapper, and the pill only ever grows
 * by overlapping empty space to its left (`absolute right-0`).
 */
export function WaiterSearchBar({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (query.trim()) return; // don't drop an active filter on a stray click
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Escape") return;
    setOpen(false);
    onQueryChange("");
  }

  return (
    <div ref={containerRef} className={cn("relative h-9 shrink-0", open ? "w-9 max-sm:w-full" : "w-9")}>
      <div
        className={cn(
          "absolute right-0 top-0 flex h-9 items-center gap-1.5 overflow-hidden rounded-full border border-border bg-secondary transition-[width] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          // Below `sm`, there's no room to the left of the button to expand
          // into (the header wraps the whole search+button cluster onto its
          // own left-aligned row at that width) — so on mobile the open
          // search instead drops out of absolute positioning and becomes
          // its own full-width row, pushing the button below it via the
          // parent's flex-wrap (brief section 27's "riga separata" option).
          open
            ? "w-[280px] max-w-[calc(100vw-13rem)] pl-3.5 pr-1.5 sm:w-[320px] max-sm:static max-sm:w-full max-sm:max-w-none"
            : "w-9 justify-center",
        )}
      >
        {open ? (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Cerca personale"
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        {open && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca per nome o ruolo..."
            aria-label="Cerca personale"
            className="h-full min-w-0 flex-1 animate-fade-in bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        )}
        {open && query && (
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
            aria-label="Cancella ricerca"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
