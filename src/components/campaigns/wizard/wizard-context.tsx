"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type { Block } from "@/lib/campaign-blocks";
import type { SegmentFilterType } from "@/server/campaigns";
import type { SegmentPreviewResult } from "@/lib/campaign-wizard-api";

export interface PendingTemplateSelection {
  type: "blank" | "template";
  templateId?: string;
}

export interface WizardState {
  campaignId: string | null;
  step: number;
  furthestStep: number;
  objectiveId: string | null;
  name: string;
  segment: SegmentFilterType;
  segmentPreview: SegmentPreviewResult | null;
  subject: string;
  previewText: string;
  contentBlocks: Block[];
  /** Selezione nello Step 3 in attesa di conferma — applicata a contentBlocks/subject solo su "Avanti", vedi campaign-wizard.tsx. */
  pendingTemplateSelection: PendingTemplateSelection | null;
  testEmailSentThisSession: boolean;
  providerConfigured: boolean | null;
  saving: boolean;
  /** Letti da env lato server e passati come prop iniziale — sola lettura, nessun override per-campagna in questa passata. */
  senderName: string;
  senderEmail: string;
}

export type WizardAction =
  | { type: "SET_STEP"; step: number }
  | { type: "SET_OBJECTIVE"; objectiveId: string; segment: SegmentFilterType; subject: string; blocks: Block[] }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_SEGMENT"; segment: SegmentFilterType }
  | { type: "SET_SEGMENT_PREVIEW"; preview: SegmentPreviewResult | null }
  | { type: "SET_SUBJECT"; subject: string }
  | { type: "SET_PREVIEW_TEXT"; previewText: string }
  | { type: "SET_BLOCKS"; blocks: Block[] }
  | { type: "SET_PENDING_TEMPLATE_SELECTION"; selection: PendingTemplateSelection | null }
  | { type: "MARK_TEST_SENT" }
  | { type: "SET_CAMPAIGN_ID"; campaignId: string }
  | { type: "SET_SAVING"; saving: boolean }
  | { type: "SET_PROVIDER_CONFIGURED"; configured: boolean };

export const WIZARD_STEPS = [
  { id: "objective", label: "Obiettivo" },
  { id: "recipients", label: "Destinatari" },
  { id: "template", label: "Template" },
  { id: "editor", label: "Editor" },
  { id: "preview", label: "Anteprima" },
  { id: "send", label: "Invio" },
];

export const initialWizardState: WizardState = {
  campaignId: null,
  step: 0,
  furthestStep: 0,
  objectiveId: null,
  name: "",
  segment: {},
  segmentPreview: null,
  subject: "",
  previewText: "",
  contentBlocks: [],
  pendingTemplateSelection: null,
  testEmailSentThisSession: false,
  providerConfigured: null,
  saving: false,
  senderName: "Tavolo",
  senderEmail: "marketing@tavolo.local",
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP": {
      const step = action.step;
      return { ...state, step, furthestStep: Math.max(state.furthestStep, step) };
    }
    case "SET_OBJECTIVE":
      return {
        ...state,
        objectiveId: action.objectiveId,
        segment: action.segment,
        subject: state.subject || action.subject,
        contentBlocks: state.contentBlocks.length > 0 ? state.contentBlocks : action.blocks,
      };
    case "SET_NAME":
      return { ...state, name: action.name };
    case "SET_SEGMENT":
      return { ...state, segment: action.segment };
    case "SET_SEGMENT_PREVIEW":
      return { ...state, segmentPreview: action.preview };
    case "SET_SUBJECT":
      return { ...state, subject: action.subject };
    case "SET_PREVIEW_TEXT":
      return { ...state, previewText: action.previewText };
    case "SET_BLOCKS":
      return { ...state, contentBlocks: action.blocks };
    case "SET_PENDING_TEMPLATE_SELECTION":
      return { ...state, pendingTemplateSelection: action.selection };
    case "MARK_TEST_SENT":
      return { ...state, testEmailSentThisSession: true };
    case "SET_CAMPAIGN_ID":
      return { ...state, campaignId: action.campaignId };
    case "SET_SAVING":
      return { ...state, saving: action.saving };
    case "SET_PROVIDER_CONFIGURED":
      return { ...state, providerConfigured: action.configured };
    default:
      return state;
  }
}

const WizardStateContext = createContext<WizardState | null>(null);
const WizardDispatchContext = createContext<Dispatch<WizardAction> | null>(null);

export function WizardProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: Partial<WizardState>;
}) {
  const [state, dispatch] = useReducer(reducer, { ...initialWizardState, ...initialState });
  return (
    <WizardStateContext.Provider value={state}>
      <WizardDispatchContext.Provider value={dispatch}>{children}</WizardDispatchContext.Provider>
    </WizardStateContext.Provider>
  );
}

export function useWizardState() {
  const ctx = useContext(WizardStateContext);
  if (!ctx) throw new Error("useWizardState must be used inside WizardProvider");
  return ctx;
}

export function useWizardDispatch() {
  const ctx = useContext(WizardDispatchContext);
  if (!ctx) throw new Error("useWizardDispatch must be used inside WizardProvider");
  return ctx;
}
