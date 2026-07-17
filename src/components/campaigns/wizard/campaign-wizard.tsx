"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { hasSubstantiveContent, hasUnsubscribeBlock } from "@/lib/campaign-blocks";
import { createCampaignDraft, patchCampaignDraft, type DraftPayload } from "@/lib/campaign-wizard-api";
import {
  WIZARD_STEPS,
  WizardProvider,
  useWizardDispatch,
  useWizardState,
  type WizardState,
} from "./wizard-context";
import { Step1Objective } from "./step-1-objective";
import { Step2Recipients } from "./step-2-recipients";
import { Step3Template, resolveTemplateSelection } from "./step-3-template";
import { Step4Editor } from "./step-4-editor/step-4-editor";
import { Step5PreviewTest } from "./step-5-preview-test";
import { Step6Send } from "./step-6-send";

const STEP_COMPONENTS = [Step1Objective, Step2Recipients, Step3Template, Step4Editor, Step5PreviewTest, Step6Send];

function canGoNext(state: WizardState): boolean {
  switch (state.step) {
    case 0:
      // Una bozza già esistente (ripresa da /campaigns/[id]/edit) ha già passato lo
      // Step 1 in una sessione precedente — objectiveId non viene persistito in DB,
      // quindi tornare indietro con "Indietro" non deve ribloccare l'utente qui.
      return state.name.trim().length > 0 && (state.objectiveId !== null || state.campaignId !== null);
    case 2:
      // La scelta del template si applica solo su "Avanti": basta una selezione
      // in sospeso oppure contenuto già presente da una visita precedente allo step.
      return state.pendingTemplateSelection !== null || hasSubstantiveContent(state.contentBlocks);
    case 3:
      return hasUnsubscribeBlock(state.contentBlocks) && hasSubstantiveContent(state.contentBlocks);
    default:
      return true;
  }
}

// L'oggetto è opzionale finché l'utente non lo compila (es. "Campagna
// personalizzata" parte con subject vuoto): va omesso dal payload, non
// inviato come stringa vuota, perché lo schema lo valida con min(1) quando presente.
function subjectOrUndefined(state: WizardState): string | undefined {
  return state.subject.trim() ? state.subject : undefined;
}

function payloadForStep(step: number, state: WizardState): DraftPayload {
  switch (step) {
    case 0:
      return { name: state.name, segment: state.segment, subject: subjectOrUndefined(state) };
    case 1:
      return { segment: state.segment };
    case 2:
    case 3:
      return { contentBlocks: state.contentBlocks };
    case 4:
      return { previewText: state.previewText, subject: subjectOrUndefined(state) };
    default:
      return {};
  }
}

function WizardShell() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const router = useRouter();
  const [localError, setLocalError] = useState<string | null>(null);
  const StepComponent = STEP_COMPONENTS[state.step];

  // Accetta uno stato esplicito (invece di leggere sempre lo `state` di closure)
  // perché handleNext, nel caso Step 3, deve poter salvare blocchi appena risolti
  // da una selezione in sospeso prima che il reducer li rifletta nel render successivo.
  async function persistStep(step: number, stateToPersist: WizardState = state) {
    const payload = payloadForStep(step, stateToPersist);
    if (!stateToPersist.campaignId) {
      if (!payload.name) return; // niente da creare ancora
      const created = await createCampaignDraft({ ...payload, name: payload.name });
      dispatch({ type: "SET_CAMPAIGN_ID", campaignId: created.id });
      router.replace(`/campaigns/${created.id}/edit`);
      return created.id;
    }
    await patchCampaignDraft(stateToPersist.campaignId, payload);
    return stateToPersist.campaignId;
  }

  async function handleNext() {
    setLocalError(null);
    let stateToPersist = state;

    if (state.step === 2 && state.pendingTemplateSelection) {
      if (
        hasSubstantiveContent(state.contentBlocks) &&
        !window.confirm("Hai già del contenuto nell'email. Continuando, verrà sostituito interamente. Procedere?")
      ) {
        return;
      }
      const resolved = resolveTemplateSelection(state.pendingTemplateSelection, state.subject, state.brandLogoUrl || undefined);
      stateToPersist = {
        ...state,
        contentBlocks: resolved.blocks,
        subject: resolved.subject ?? state.subject,
      };
      dispatch({ type: "SET_BLOCKS", blocks: resolved.blocks });
      if (resolved.subject) dispatch({ type: "SET_SUBJECT", subject: resolved.subject });
      dispatch({ type: "SET_PENDING_TEMPLATE_SELECTION", selection: null });
    }

    dispatch({ type: "SET_SAVING", saving: true });
    try {
      await persistStep(state.step, stateToPersist);
      dispatch({ type: "SET_STEP", step: Math.min(state.step + 1, WIZARD_STEPS.length - 1) });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      dispatch({ type: "SET_SAVING", saving: false });
    }
  }

  function handleBack() {
    dispatch({ type: "SET_STEP", step: Math.max(state.step - 1, 0) });
  }

  async function handleSaveDraft() {
    setLocalError(null);
    dispatch({ type: "SET_SAVING", saving: true });
    try {
      await persistStep(state.step);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      dispatch({ type: "SET_SAVING", saving: false });
    }
  }

  const isLastStep = state.step === WIZARD_STEPS.length - 1;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-24">
      <header className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Nuova campagna email</p>
          <h1 className="text-display text-2xl">{state.name || "Senza nome"}</h1>
        </div>
        <Stepper
          steps={WIZARD_STEPS}
          currentStepIndex={state.step}
          furthestStepIndex={state.furthestStep}
          onStepClick={(index) => dispatch({ type: "SET_STEP", step: index })}
        />
      </header>

      {localError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {localError}
        </div>
      )}

      <div className="surface p-6">
        <StepComponent />
      </div>

      {!isLastStep && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Button variant="outline" onClick={handleBack} disabled={state.step === 0}>
              <ChevronLeft className="h-4 w-4" /> Indietro
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleSaveDraft} disabled={state.saving || !state.campaignId}>
                <Save className="h-4 w-4" /> Salva bozza
              </Button>
              <Button variant="gold" onClick={handleNext} disabled={state.saving || !canGoNext(state)}>
                Avanti <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CampaignWizard({ initialState }: { initialState?: Partial<WizardState> }) {
  return (
    <WizardProvider initialState={initialState}>
      <WizardShell />
    </WizardProvider>
  );
}
