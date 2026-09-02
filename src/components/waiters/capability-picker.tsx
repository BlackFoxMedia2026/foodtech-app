"use client";

import { Check } from "lucide-react";
import type { StaffCapability } from "@prisma/client";
import { STAFF_CAPABILITIES } from "@/lib/staff-roles";
import { cn } from "@/lib/utils";

/** Compact toggle-chip list for StaffCapability — same visual language as
 * Badge's "gold" tone (border-accent/30 bg-accent/10 text-accent), so it
 * reads as part of the existing design system rather than a new control. */
export function CapabilityPicker({
  value,
  onChange,
}: {
  value: StaffCapability[];
  onChange: (next: StaffCapability[]) => void;
}) {
  function toggle(cap: StaffCapability) {
    onChange(value.includes(cap) ? value.filter((c) => c !== cap) : [...value, cap]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {STAFF_CAPABILITIES.map((c) => {
        const active = value.includes(c.value);
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(c.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {active && <Check className="h-3 w-3" />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
