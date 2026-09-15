"use client";

import {
  UserX,
  PartyPopper,
  CalendarClock,
  UtensilsCrossed,
  Crown,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CAMPAIGN_OBJECTIVES, type CampaignObjective } from "@/lib/campaign-objectives";
import { getCampaignTemplate, withBrandLogo } from "@/lib/campaign-templates";
import { useWizardDispatch, useWizardState } from "./wizard-context";

const ICONS: Record<CampaignObjective["icon"], LucideIcon> = {
  UserX,
  PartyPopper,
  CalendarClock,
  UtensilsCrossed,
  Crown,
  Wand2,
};

export function Step1Objective() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();

  function selectObjective(objective: CampaignObjective) {
    const template = objective.suggestedTemplateId ? getCampaignTemplate(objective.suggestedTemplateId) : undefined;
    const blocks = template ? template.blocks.map((b, i) => ({ ...b, id: `${objective.id}-init-${i}` })) : [];
    dispatch({
      type: "SET_OBJECTIVE",
      objectiveId: objective.id,
      segment: objective.suggestedSegment,
      subject: objective.suggestedSubject,
      blocks: withBrandLogo(blocks, state.brandLogoUrl || undefined),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-2xl">Qual è l&apos;obiettivo della campagna?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Da qui prepariamo segmento e oggetto suggeriti: potrai cambiarli nei passi successivi.
        </p>
      </div>

      {/* Gli obiettivi prendono la larghezza, il nome resta una cosa sola in
          una colonna a parte: è l'ultimo dato da riempire, non il primo. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGN_OBJECTIVES.map((objective) => {
            const Icon = ICONS[objective.icon];
            const selected = state.objectiveId === objective.id;
            return (
              <button
                key={objective.id}
                type="button"
                onClick={() => selectObjective(objective)}
                className={cn(
                  "flex h-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
                  selected
                    ? "border-accent-strong bg-accent-strong/10"
                    : "border-border hover:border-border-strong hover:bg-secondary/60",
                )}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", selected ? "text-accent-strong" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">{objective.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{objective.description}</p>
              </button>
            );
          })}
        </div>

        <div className="riquadro comodo h-fit space-y-2 bg-secondary/30">
          <Label htmlFor="campaign-name">Nome campagna</Label>
          <Input
            id="campaign-name"
            value={state.name}
            onChange={(e) => dispatch({ type: "SET_NAME", name: e.target.value })}
            placeholder="Es. Recupero clienti ottobre"
          />
          <p className="t-nota">Solo per uso interno: i clienti non lo vedranno.</p>
        </div>
      </div>
    </div>
  );
}
