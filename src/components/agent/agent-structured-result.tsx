"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { StructuredResult } from "@/server/ai/types";

export function AgentStructuredResult({
  result,
  acted,
  confirming,
  onConfirmAction,
  onCancelAction,
}: {
  result: StructuredResult;
  acted?: boolean;
  confirming?: boolean;
  onConfirmAction?: (actionId: string, params: Record<string, unknown>) => void;
  onCancelAction?: () => void;
}) {
  const router = useRouter();

  if (result.type === "metric") {
    return (
      <div className="rounded-lg border border-border bg-card/60 px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{result.label}</p>
        <p className="text-display text-xl leading-tight">{result.value}</p>
        {result.hint && <p className="text-xs text-muted-foreground">{result.hint}</p>}
      </div>
    );
  }

  if (result.type === "list") {
    return (
      <div className="rounded-lg border border-border bg-card/60 p-2">
        <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{result.title}</p>
        <div className="space-y-0.5">
          {result.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
              <span className="font-medium text-card-foreground">{item.title}</span>
              {item.subtitle && <span className="shrink-0 text-xs text-muted-foreground">{item.subtitle}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (result.type === "guest") {
    return (
      <div className="rounded-lg border border-border bg-card/60 px-3 py-2">
        <p className="text-sm font-medium text-card-foreground">{result.name}</p>
        <p className="text-xs text-muted-foreground">
          {result.visits != null ? `${result.visits} visite` : null}
          {result.lastVisit ? ` · Ultima visita: ${result.lastVisit}` : null}
        </p>
      </div>
    );
  }

  if (result.type === "navigate") {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => router.push(result.path)}>
        Apri {result.label}
      </Button>
    );
  }

  // action_confirmation
  if (acted) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
      <p className="text-sm text-card-foreground">{result.summary}</p>
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled={confirming} onClick={onCancelAction}>
          Annulla
        </Button>
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={confirming}
          onClick={() => onConfirmAction?.(result.actionId, result.params)}
        >
          {confirming ? "Conferma…" : "Conferma"}
        </Button>
      </div>
    </div>
  );
}
