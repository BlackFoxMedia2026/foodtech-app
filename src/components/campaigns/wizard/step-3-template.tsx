"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { withUnsubscribeBlock, type Block } from "@/lib/campaign-blocks";
import { compileBlocksToHtml, resolveTestVariables } from "@/lib/campaign-blocks-compiler";
import { CAMPAIGN_TEMPLATES, getCampaignTemplate, templatesForObjective, type CampaignTemplate } from "@/lib/campaign-templates";
import { useWizardDispatch, useWizardState, type PendingTemplateSelection } from "./wizard-context";

function cloneBlocksWithFreshIds(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, id: crypto.randomUUID() }));
}

// Dati fittizi solo per rendere leggibile l'anteprima delle card (non toccano
// mai il server): senza questi, l'anteprima mostrerebbe token letterali come
// "{{FIRSTNAME}}" invece di un nome plausibile.
const TEMPLATE_PREVIEW_VARS = {
  firstName: "Mario",
  lastName: "Rossi",
  restaurantName: "Il Tuo Locale",
  bookingLink: "#",
  unsubscribeLink: "#",
  lastVisitDate: "12 giugno 2026",
  loyaltyLevel: "VIP",
};

function templatePreviewHtml(blocks: Block[]): string {
  return resolveTestVariables(compileBlocksToHtml(blocks), TEMPLATE_PREVIEW_VARS);
}

/**
 * Risolve una selezione "in sospeso" dello Step 3 in blocchi/subject concreti.
 * Chiamata da campaign-wizard.tsx solo al momento del commit (click su "Avanti"),
 * mai al click sulla card — vedi WizardState.pendingTemplateSelection.
 */
export function resolveTemplateSelection(
  selection: PendingTemplateSelection,
  currentSubject: string
): { blocks: Block[]; subject?: string } {
  if (selection.type === "blank") {
    return { blocks: withUnsubscribeBlock([]) };
  }
  const template = getCampaignTemplate(selection.templateId ?? null);
  if (!template) return { blocks: withUnsubscribeBlock([]) };
  return {
    blocks: withUnsubscribeBlock(cloneBlocksWithFreshIds(template.blocks)),
    subject: currentSubject.trim() ? undefined : template.name,
  };
}

export function Step3Template() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [showAll, setShowAll] = useState(false);

  const suggested = templatesForObjective(state.objectiveId);
  const hasSuggested = state.objectiveId !== null && suggested.length > 0;
  const list = showAll || !hasSuggested ? CAMPAIGN_TEMPLATES : suggested;
  const selection = state.pendingTemplateSelection;

  function selectBlank() {
    dispatch({ type: "SET_PENDING_TEMPLATE_SELECTION", selection: { type: "blank" } });
  }

  function selectTemplate(template: CampaignTemplate) {
    dispatch({ type: "SET_PENDING_TEMPLATE_SELECTION", selection: { type: "template", templateId: template.id } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-lg">Da dove vuoi partire?</h2>
        <p className="text-sm text-muted-foreground">
          Scegli un template come base oppure parti da zero: la scelta si applica solo quando premi &quot;Avanti&quot;.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={selectBlank}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            selection?.type === "blank" ? "border-accent bg-accent/10" : "border-border hover:bg-secondary",
          )}
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
        <div className="grid gap-4">
          {list.map((template) => {
            const isSelected = selection?.type === "template" && selection.templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template)}
                className={cn(
                  "grid gap-4 rounded-lg border p-3 text-left transition-colors sm:grid-cols-[240px_1fr]",
                  isSelected ? "border-accent bg-accent/10" : "border-border hover:bg-secondary",
                )}
              >
                <div>
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.previewText}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{template.category}</p>
                </div>
                {/* Anteprima intera, senza ritagli: mostra davvero copy e immagini del template. */}
                <div
                  className="overflow-hidden rounded-md border border-hairline bg-white p-1"
                  dangerouslySetInnerHTML={{ __html: templatePreviewHtml(template.blocks) }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
