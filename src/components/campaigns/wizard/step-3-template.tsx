"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasSubstantiveContent, withUnsubscribeBlock, type Block } from "@/lib/campaign-blocks";
import { CAMPAIGN_TEMPLATES, templatesForObjective, type CampaignTemplate } from "@/lib/campaign-templates";
import { useWizardDispatch, useWizardState } from "./wizard-context";

function cloneBlocksWithFreshIds(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, id: crypto.randomUUID() }));
}

export function Step3Template() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [showAll, setShowAll] = useState(false);

  const suggested = templatesForObjective(state.objectiveId);
  const hasSuggested = state.objectiveId !== null && suggested.length > 0;
  const list = showAll || !hasSuggested ? CAMPAIGN_TEMPLATES : suggested;

  function confirmReplaceIfNeeded(): boolean {
    if (!hasSubstantiveContent(state.contentBlocks)) return true;
    return window.confirm(
      "Hai già del contenuto nell'email. Continuando, verrà sostituito interamente. Procedere?"
    );
  }

  function chooseBlank() {
    if (!confirmReplaceIfNeeded()) return;
    dispatch({ type: "SET_BLOCKS", blocks: withUnsubscribeBlock([]) });
  }

  function chooseTemplate(template: CampaignTemplate) {
    if (!confirmReplaceIfNeeded()) return;
    dispatch({ type: "SET_BLOCKS", blocks: withUnsubscribeBlock(cloneBlocksWithFreshIds(template.blocks)) });
    if (!state.subject) dispatch({ type: "SET_SUBJECT", subject: template.name });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-lg">Da dove vuoi partire?</h2>
        <p className="text-sm text-muted-foreground">
          Scegli un template come base oppure parti da zero. Potrai modificare tutto nel passo successivo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={chooseBlank}
          className="rounded-lg border border-border p-4 text-left hover:bg-secondary"
        >
          <p className="text-sm font-medium">Parti da zero</p>
          <p className="text-xs text-muted-foreground">Un&apos;email vuota, pronta da comporre.</p>
        </button>
        <div className="rounded-lg border border-dashed border-border p-4 text-left opacity-60">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm font-medium">Genera con AI</p>
          </div>
          <p className="text-xs text-muted-foreground">Prossimamente</p>
        </div>
      </div>

      {!hasSuggested && (
        <p className="text-xs text-muted-foreground">
          Nessun template consigliato per questo obiettivo — scegli tra tutti i template disponibili o parti da zero.
        </p>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {hasSuggested && !showAll ? "Template consigliati" : "Tutti i template"}
          </p>
          {hasSuggested && (
            <button type="button" className="text-xs underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Mostra solo consigliati" : "Vedi tutti i template"}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => chooseTemplate(template)}
              className={cn(
                "rounded-lg border border-border p-4 text-left hover:bg-secondary",
              )}
            >
              <p className="text-sm font-medium">{template.name}</p>
              <p className="text-xs text-muted-foreground">{template.previewText}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{template.category}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
