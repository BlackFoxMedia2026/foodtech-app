"use client";

import { CAMPAIGN_VARIABLES } from "@/lib/campaign-blocks";

export function VariablesPanel({ onInsert, disabled }: { onInsert: (token: string) => void; disabled: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Variabili disponibili</p>
      <div className="flex flex-wrap gap-1.5">
        {CAMPAIGN_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            disabled={disabled}
            onClick={() => onInsert(v.token)}
            title={v.token}
            className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {v.label}
          </button>
        ))}
      </div>
      {disabled && <p className="text-xs text-muted-foreground">Seleziona un campo di testo per inserire una variabile.</p>}
    </div>
  );
}
