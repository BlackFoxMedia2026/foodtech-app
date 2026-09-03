"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStepDef = { key: string; label: string };

/**
 * Shared "Costruisci la sala" progress indicator — rendered identically in
 * the builder header across all three steps (forma, dimensioni, personalizza)
 * so the flow reads as one wizard instead of three separate screens.
 */
export function WizardStepper({ steps, currentIndex }: { steps: WizardStepDef[]; currentIndex: number }) {
  return (
    <nav aria-label="Passaggi di creazione della sala">
      <ol className="flex items-center">
        {steps.map((step, i) => {
          const status = i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
          return (
            <li key={step.key} className="flex items-center">
              <span
                aria-current={status === "active" ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  status === "active" && "border-accent-strong bg-accent-strong/15 font-semibold text-card-foreground",
                  status === "done" && "border-border text-card-foreground/75",
                  status === "upcoming" && "border-border text-muted-foreground",
                )}
              >
                {status === "done" ? (
                  <Check className="h-3 w-3 text-accent-strong" aria-hidden />
                ) : (
                  <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </span>
              {i < steps.length - 1 && <span aria-hidden className="mx-1.5 h-px w-4 bg-border sm:w-8" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
