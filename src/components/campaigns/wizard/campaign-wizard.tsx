"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { Step2Segmento } from "./step-2-segmento";
import { Step3Filtri } from "./step-3-filtri";
import { resolveTemplateSelection, type PendingTemplateSelection } from "@/lib/campaign-start";
import { Step4Models } from "./step-4-models";
import { Step5Editor } from "./step-5-editor/step-5-editor";
import { Step6PreviewTest } from "./step-6-preview-test";
import { Step7Send } from "./step-7-send";

/**
 * Solo lo step «Modelli» la usa — scegliere un modello e partire sono lo stesso
 * gesto. La selezione viaggia **come argomento** e non attraverso lo stato:
 * `dispatch` non è sincrono, e un «Usa questo modello» su una card diversa da
 * quella già selezionata portava nell'editor il modello di prima.
 */
export interface StepProps {
  onAvanti?: (selezione?: PendingTemplateSelection) => void;
}

const STEP_COMPONENTS: ComponentType<StepProps>[] = [
  Step1Objective,
  Step2Segmento,
  Step3Filtri,
  Step4Models,
  Step5Editor,
  Step6PreviewTest,
  Step7Send,
];

/** Gli indici dei passi, per nome: con sette passi «2» non vuol dire niente. */
const PASSO = { obiettivo: 0, segmento: 1, filtri: 2, modelli: 3, editor: 4, anteprima: 5, invio: 6 } as const;

function canGoNext(state: WizardState): boolean {
  switch (state.step) {
    case PASSO.obiettivo:
      // Una bozza già esistente (ripresa da /campaigns/[id]/edit) ha già passato lo
      // passo «Obiettivo» in una sessione precedente — objectiveId non viene persistito in DB,
      // quindi tornare indietro con "Indietro" non deve ribloccare l'utente qui.
      return state.name.trim().length > 0 && (state.objectiveId !== null || state.campaignId !== null);
    case PASSO.modelli:
      // Basta una selezione in sospeso oppure del contenuto già presente da una
      // visita precedente allo step.
      return state.pendingTemplateSelection !== null || hasSubstantiveContent(state.contentBlocks);
    case PASSO.editor:
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
    case PASSO.obiettivo:
      return { name: state.name, segment: state.segment, subject: subjectOrUndefined(state) };
    // Segmento e Filtri scrivono lo stesso campo: sono due schermate dello
    // stesso oggetto, non due dati diversi.
    case PASSO.segmento:
    case PASSO.filtri:
      return { segment: state.segment };
    case PASSO.modelli:
    case PASSO.editor:
      // Blocchi e impostazioni viaggiano insieme nello stesso campo: è il
      // documento intero a essere la fonte di verità dell'email.
      return {
        contentBlocks: { version: 2, settings: state.emailSettings, blocks: state.contentBlocks },
        subject: subjectOrUndefined(state),
      };
    case PASSO.anteprima:
      return { previewText: state.previewText, subject: subjectOrUndefined(state) };
    default:
      return {};
  }
}

/**
 * Lo stato del salvataggio, detto sottovoce.
 *
 * «Salvato» non è una notifica: è una rassicurazione. Sta in basso a destra,
 * in grigio, e non chiede niente — il contrario del pulsante «Salva bozza»
 * che prima bisognava ricordarsi di premere.
 */
function AutoSaveBadge({ state }: { state: WizardState["autoSave"] }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-xs text-destructive-soft">Salvataggio non riuscito</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="h-3 w-3 text-sage-strong" /> Salvato automaticamente
    </span>
  );
}

function WizardShell() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const router = useRouter();
  const [localError, setLocalError] = useState<string | null>(null);
  const StepComponent = STEP_COMPONENTS[state.step];

  // Accetta uno stato esplicito (invece di leggere sempre lo `state` di closure)
  // perché handleNext, nel caso «Modelli», deve poter salvare blocchi appena risolti
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

  async function handleNext(selezioneEsplicita?: PendingTemplateSelection) {
    setLocalError(null);
    let stateToPersist = state;
    const selezione = selezioneEsplicita ?? state.pendingTemplateSelection;

    if (state.step === PASSO.modelli && selezione) {
      if (
        hasSubstantiveContent(state.contentBlocks) &&
        !window.confirm("Hai già del contenuto nell'email. Continuando, verrà sostituito interamente. Procedere?")
      ) {
        return;
      }
      const resolved = resolveTemplateSelection(selezione, state);
      stateToPersist = {
        ...state,
        contentBlocks: resolved.blocks,
        emailSettings: resolved.settings,
        subject: resolved.subject ?? state.subject,
      };
      dispatch({ type: "SET_BLOCKS", blocks: resolved.blocks });
      dispatch({ type: "SET_EMAIL_SETTINGS", settings: resolved.settings });
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
  /* L'Editor è un banco di lavoro, non una pagina: si prende tutta la
     larghezza, non sta dentro una card e comprime l'intestazione per lasciare
     altezza al foglio. */
  const isEditorStep = state.step === PASSO.editor;
  /* Scegliere non è compilare.
  
     Obiettivo, Segmento, Filtri, Modelli e Anteprima erano dentro una card larga
     896 px al centro di uno schermo che spesso ne ha il doppio: sei modelli
     affiancati diventavano una colonna sola, e la scelta — che è la sostanza
     di questi passi — si faceva scorrendo. Qui la pagina prende la larghezza
     che c'è e la card sparisce: il contenuto sta sul fondo della pagina,
     senza una cornice attorno che non delimita niente. Il modulo di invio
     resta in colonna stretta, perché lì si legge e si conferma. */
  const senzaCornice = state.step <= PASSO.modelli || state.step === PASSO.anteprima;

  return (
    <div className={cn("schermo w-full gap-4", isEditorStep ? "max-w-none gap-2" : "mx-auto max-w-[1480px]")}>
      {/* Testata, stepper e contenuto erano tre righe attaccate e si leggevano
          come un blocco solo: il titolo della campagna sembrava il titolo del
          passo. Qui la testata si prende il suo spazio, e sotto passa un filo
          che sfuma ai lati — divide senza tagliare, che è quanto serve. */}
      <header
        className={cn(
          "fissa",
          isEditorStep
            ? "flex items-center gap-6"
            : "flex flex-col gap-5 pb-1 md:flex-row md:items-center md:justify-between md:gap-10",
        )}
      >
        <div className={cn(isEditorStep && "shrink-0")}>
          {!isEditorStep && <p className="t-etichetta">Nuova campagna email</p>}
          <h1 className={cn("text-display", isEditorStep ? "text-lg" : "text-xl md:text-2xl")}>
            {state.name || "Senza nome"}
          </h1>
        </div>
        {/* Lo stepper dice dove sei, non cosa fare: sta in fila col titolo e
            occupa la larghezza che gli serve, non tutta quella disponibile. */}
        <Stepper
          steps={WIZARD_STEPS}
          currentStepIndex={state.step}
          furthestStepIndex={state.furthestStep}
          onStepClick={(index) => dispatch({ type: "SET_STEP", step: index })}
          variant={isEditorStep ? "esteso" : "compatto"}
        />
      </header>

      {!isEditorStep && (
        <div className="fissa h-px bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden="true" />
      )}

      {localError && (
        <div className="fissa rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-foreground">
          {localError}
        </div>
      )}

      {isEditorStep ? (
        <div className="fill min-h-0">
          <StepComponent />
        </div>
      ) : senzaCornice ? (
        <div className="fill-scroll pt-3">
          <StepComponent onAvanti={handleNext} />
        </div>
      ) : (
        <div className="fill-scroll pt-3">
          <div className="surface mx-auto max-w-3xl p-6">
            <StepComponent />
          </div>
        </div>
      )}

      {!isLastStep && (
        <div className="fissa -mx-4 border-t border-border bg-background/85 px-4 pt-3 backdrop-blur md:-mx-6">
          {/* Su telefono i tre comandi non ci stanno affiancati alla stessa
              misura: «bozza» è la parola che si può perdere senza perdere il
              senso, e il pulsante resta dove il pollice lo cerca. */}
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <Button variant="outline" onClick={handleBack} disabled={state.step === 0}>
              <ChevronLeft className="h-4 w-4" /> Indietro
            </Button>
            <div className="flex items-center gap-2 sm:gap-3">
              {isEditorStep && <AutoSaveBadge state={state.autoSave} />}
              <Button variant="ghost" onClick={handleSaveDraft} disabled={state.saving || !state.campaignId}>
                <Save className="h-4 w-4" />
                <span className="sm:hidden">Salva</span>
                <span className="hidden sm:inline">Salva bozza</span>
              </Button>
              <Button variant="accent" onClick={() => handleNext()} disabled={state.saving || !canGoNext(state)}>
                {isEditorStep ? "Anteprima" : "Avanti"} <ChevronRight className="h-4 w-4" />
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
