"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { DEFAULT_EMAIL_SETTINGS, type Block, type EmailSettings } from "@/lib/campaign-blocks";
import type { PendingTemplateSelection } from "@/lib/campaign-start";
import type { NewsletterSource, SegmentFilterType } from "@/server/campaigns";
import type { SegmentPreviewResult } from "@/lib/campaign-wizard-api";

export type { PendingTemplateSelection } from "@/lib/campaign-start";

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
  /** Le impostazioni globali dell'email (larghezza, colori, carattere): stanno
   * accanto ai blocchi e viaggiano con loro nello stesso campo `contentBlocks`. */
  emailSettings: EmailSettings;
  /** Selezione nel passo «Modelli» in attesa di conferma — applicata a contentBlocks/subject solo su "Avanti", vedi campaign-wizard.tsx. */
  pendingTemplateSelection: PendingTemplateSelection | null;
  /** Le newsletter già create dal locale, riutilizzabili come base (sola lettura, caricate dal server). */
  previousCampaigns: NewsletterSource[];
  testEmailSentThisSession: boolean;
  providerConfigured: boolean | null;
  saving: boolean;
  /** Lo stato del salvataggio automatico dell'editor, mostrato nella barra in basso. */
  autoSave: "idle" | "saving" | "saved" | "error";
  /** Letti da env lato server e passati come prop iniziale — sola lettura, nessun override per-campagna in questa passata. */
  senderName: string;
  senderEmail: string;
  /** Brand del locale (Impostazioni → Brand): usati come default per logo/colore nei nuovi contenuti. */
  brandLogoUrl: string;
  brandPrimaryColor: string;
  /** Dati del locale che i blocchi «ristorante» presentano senza farli ribattere. */
  venueName: string;
  venueAddress: string;
  venuePhone: string;
  /**
   * Gli invii che restano nel piano DEM, letti quando il wizard si apre.
   *
   * Non si aggiorna mentre si compone: in questa mezz'ora nessun altro sta
   * programmando campagne da questo locale, e un numero che si muove da solo
   * accanto ai destinatari farebbe dubitare del conto invece di aiutarlo. Il
   * controllo che conta è quello del server al momento dell'invio, che è
   * anche l'unico di cui ci si può fidare.
   */
  quotaDisponibili: number | null;
  quotaLimite: number | null;
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
  | { type: "SET_EMAIL_SETTINGS"; settings: EmailSettings }
  | { type: "SET_PENDING_TEMPLATE_SELECTION"; selection: PendingTemplateSelection | null }
  | { type: "MARK_TEST_SENT" }
  | { type: "SET_CAMPAIGN_ID"; campaignId: string }
  | { type: "SET_SAVING"; saving: boolean }
  | { type: "SET_AUTO_SAVE"; autoSave: WizardState["autoSave"] }
  | { type: "SET_PROVIDER_CONFIGURED"; configured: boolean };

/**
 * «Destinatari» era un passo solo e conteneva due attività diverse: scegliere
 * il pubblico di partenza e restringerlo con otto filtri. Sono separate —
 * «Segmento» e «Filtri» — perché la seconda è facoltativa e la prima no, e
 * perché nella stessa schermata i filtri pesavano più della scelta che
 * dovevano solo affinare.
 */
export const WIZARD_STEPS = [
  { id: "objective", label: "Obiettivo" },
  { id: "segment", label: "Segmento" },
  { id: "filters", label: "Filtri" },
  { id: "template", label: "Modelli" },
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
  emailSettings: { ...DEFAULT_EMAIL_SETTINGS },
  pendingTemplateSelection: null,
  previousCampaigns: [],
  testEmailSentThisSession: false,
  providerConfigured: null,
  saving: false,
  autoSave: "idle",
  senderName: "Tavolo",
  senderEmail: "marketing@tavolo.local",
  brandLogoUrl: "",
  brandPrimaryColor: "",
  venueName: "",
  venueAddress: "",
  venuePhone: "",
  quotaDisponibili: null,
  quotaLimite: null,
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
    case "SET_EMAIL_SETTINGS":
      return { ...state, emailSettings: action.settings };
    case "SET_PENDING_TEMPLATE_SELECTION":
      return { ...state, pendingTemplateSelection: action.selection };
    case "MARK_TEST_SENT":
      return { ...state, testEmailSentThisSession: true };
    case "SET_CAMPAIGN_ID":
      return { ...state, campaignId: action.campaignId };
    case "SET_SAVING":
      return { ...state, saving: action.saving };
    case "SET_AUTO_SAVE":
      return { ...state, autoSave: action.autoSave };
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
