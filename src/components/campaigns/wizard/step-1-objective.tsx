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
import { getCampaignTemplate } from "@/lib/campaign-templates";
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
    dispatch({
      type: "SET_OBJECTIVE",
      objectiveId: objective.id,
      segment: objective.suggestedSegment,
      subject: objective.suggestedSubject,
      blocks: template ? template.blocks.map((b, i) => ({ ...b, id: `${objective.id}-init-${i}` })) : [],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-lg">Qual è l&apos;obiettivo della campagna?</h2>
        <p className="text-sm text-muted-foreground">
          Scegli un obiettivo: pre-imposteremo segmento e oggetto suggeriti, che potrai comunque modificare nei passi successivi.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPAIGN_OBJECTIVES.map((objective) => {
          const Icon = ICONS[objective.icon];
          const selected = state.objectiveId === objective.id;
          return (
            <button
              key={objective.id}
              type="button"
              onClick={() => selectObjective(objective)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                selected ? "border-accent bg-accent/10" : "border-border hover:bg-secondary",
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected ? "text-accent" : "text-muted-foreground")} />
              <div>
                <p className="text-sm font-medium">{objective.label}</p>
                <p className="text-xs text-muted-foreground">{objective.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-6">
        <Label htmlFor="campaign-name">Nome campagna</Label>
        <Input
          id="campaign-name"
          value={state.name}
          onChange={(e) => dispatch({ type: "SET_NAME", name: e.target.value })}
          placeholder="Es. Recupero clienti ottobre"
        />
        <p className="text-xs text-muted-foreground">Solo per uso interno: i clienti non lo vedranno.</p>
      </div>
    </div>
  );
}
