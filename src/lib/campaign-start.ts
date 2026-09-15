import {
  DEFAULT_EMAIL_SETTINGS,
  withUnsubscribeBlock,
  type Block,
  type EmailDocument,
  type EmailSettings,
} from "./campaign-blocks";
import { cloneBlocksWithNewIds } from "./campaign-document-ops";
import { getCampaignTemplate, withBrandLogo, type CampaignTemplate } from "./campaign-templates";

/**
 * Da dove parte l'email: un foglio bianco, un modello della libreria, o una
 * newsletter già fatta da **copiare**. In tutti e tre i casi la selezione è
 * solo un'intenzione finché non si va avanti: è ciò che permette di cambiare
 * idea senza aver già buttato via il contenuto che c'era.
 */
export interface PendingTemplateSelection {
  type: "blank" | "template" | "previous";
  templateId?: string;
  /** Solo per `previous`: la campagna da cui copiare — mai quella da modificare. */
  sourceCampaignId?: string;
}

/** Ciò che serve per copiare una newsletter esistente: il documento e l'oggetto. */
export interface FonteNewsletter {
  id: string;
  subject: string | null;
  document: EmailDocument;
}

export interface DocumentoIniziale {
  blocks: Block[];
  settings: EmailSettings;
  /** Presente solo se vale la pena proporlo: chi ha già scritto un oggetto se lo tiene. */
  subject?: string;
}

/** Le impostazioni del foglio di un modello, completate con quelle predefinite. */
export function impostazioniModello(template: CampaignTemplate): EmailSettings {
  return { ...DEFAULT_EMAIL_SETTINGS, ...template.settings };
}

/**
 * Risolve una selezione in un documento concreto.
 *
 * Chiamata dal wizard solo al momento del passaggio all'editor, mai al clic
 * sulla card: finché la selezione è «in sospeso» chi ha già scritto qualcosa
 * può cambiare idea senza aver perso niente.
 *
 * In tutti e tre i casi il risultato è un documento **nuovo**, con identità
 * nuove fino ai blocchi dentro le colonne: una newsletter ripresa come base
 * viene copiata, non aperta — la campagna d'origine non viene toccata da
 * nessuna parte di questo flusso.
 */
export function resolveTemplateSelection(
  selection: PendingTemplateSelection,
  context: { subject: string; brandLogoUrl: string; previousCampaigns: FonteNewsletter[] },
): DocumentoIniziale {
  const logo = context.brandLogoUrl || undefined;
  const oggettoLibero = !context.subject.trim();

  if (selection.type === "previous") {
    const fonte = context.previousCampaigns.find((c) => c.id === selection.sourceCampaignId);
    if (fonte) {
      return {
        blocks: withUnsubscribeBlock(cloneBlocksWithNewIds(fonte.document.blocks)),
        settings: { ...fonte.document.settings },
        subject: oggettoLibero ? (fonte.subject ?? undefined) : undefined,
      };
    }
  }

  if (selection.type === "template") {
    const template = getCampaignTemplate(selection.templateId ?? null);
    if (template) {
      return {
        blocks: withUnsubscribeBlock(withBrandLogo(cloneBlocksWithNewIds(template.blocks), logo)),
        settings: impostazioniModello(template),
        subject: oggettoLibero ? template.name : undefined,
      };
    }
  }

  return { blocks: withUnsubscribeBlock([]), settings: { ...DEFAULT_EMAIL_SETTINGS } };
}
