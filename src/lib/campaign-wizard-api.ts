import type { EmailContentInput } from "@/lib/campaign-blocks";
import type { SegmentFilterType } from "@/server/campaigns";

export interface SegmentPreviewResult {
  totalMatchingFilters: number;
  excludedNoEmail: number;
  excludedNoConsent: number;
  excludedSuppressed: number;
  duplicatesRemoved: number;
  finalRecipients: number;
  /** Dei destinatari finali, quanti arrivano dal file CSV. */
  fromFile?: number;
}

export interface DraftPayload {
  name?: string;
  subject?: string;
  previewText?: string;
  segment?: SegmentFilterType;
  /** Il documento dell'editor, o l'array piatto di blocchi delle campagne storiche. */
  contentBlocks?: EmailContentInput;
}

/**
 * L'errore di una chiamata del wizard, **con dentro cosa ha risposto il
 * server**.
 *
 * Un `Error` con il solo messaggio basta finché la schermata lo scrive in
 * rosso e finisce lì. Non basta più quando una risposta specifica merita
 * un'altra interfaccia: gli invii finiti non sono una riga d'errore, sono una
 * finestra con due strade e tre numeri dentro. Il codice e il dettaglio
 * viaggiano con l'errore, così chi lo cattura può riconoscerli.
 */
export class ErroreApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly detail: unknown,
  ) {
    super(message);
    this.name = "ErroreApi";
  }
}

async function parseJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  // Il messaggio del server è scritto per essere letto da chi usa
  // l'applicazione: il codice serve solo se quel messaggio non c'è.
  if (!res.ok) {
    throw new ErroreApi(
      data.message ?? data.error ?? "request_failed",
      res.status,
      data.error ?? null,
      data.detail ?? null,
    );
  }
  return data;
}

export async function createCampaignDraft(payload: DraftPayload & { name: string }) {
  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res) as Promise<{ id: string }>;
}

export async function patchCampaignDraft(id: string, payload: DraftPayload) {
  const res = await fetch(`/api/campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export type { RigaDestinatario } from "@/server/campaigns";
import type { RigaDestinatario } from "@/server/campaigns";

/** Una pagina dell'elenco destinatari, con la ricerca. */
export async function fetchDestinatari(
  segment: SegmentFilterType,
  opzioni: { cerca?: string; pagina?: number } = {},
): Promise<{ righe: RigaDestinatario[]; totale: number; trovati: number; pagina: number; pagine: number }> {
  const res = await fetch("/api/campaigns/destinatari", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segment, ...opzioni }),
  });
  return parseJsonOrThrow(res);
}

export type { EsitoContatti as EsitoContattiCsv } from "@/server/campaign-contatti";
import type { EsitoContatti } from "@/server/campaign-contatti";
import type { AbbinamentoColonne } from "@/lib/contatti-colonne";

/** Legge un CSV di contatti e lo confronta con la rubrica, senza scrivere. */
export async function anteprimaContattiCsv(
  testo: string,
  colonne?: AbbinamentoColonne,
  segment?: SegmentFilterType,
): Promise<EsitoContatti> {
  const res = await fetch("/api/campaigns/contatti-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testo, colonne, segment }),
  });
  return parseJsonOrThrow(res);
}

/**
 * Aggiunge i contatti del CSV alla rubrica, col consenso dichiarato dal
 * locale, e restituisce gli id da mettere fra i destinatari della campagna.
 */
export async function importaContattiCsv(
  testo: string,
  campaignId: string | null,
  colonne?: AbbinamentoColonne,
  segment?: SegmentFilterType,
): Promise<EsitoContatti & { guestIds: string[] }> {
  const res = await fetch("/api/campaigns/contatti-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testo, esegui: true, consensoDichiarato: true, campaignId, colonne, segment }),
  });
  return parseJsonOrThrow(res);
}

export async function fetchSegmentPreview(segment: SegmentFilterType): Promise<SegmentPreviewResult> {
  const res = await fetch("/api/campaigns/segment-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segment }),
  });
  return parseJsonOrThrow(res);
}

export async function fetchProviderStatus(): Promise<{ configured: boolean }> {
  const res = await fetch("/api/campaigns/provider-status");
  return parseJsonOrThrow(res);
}

/** Mette una bozza nel cestino. Il server rifiuta (409) se la campagna non è più una bozza. */
export async function deleteCampaignDraft(id: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
  if (res.status === 409) throw new Error("Questa campagna non è più una bozza: resta nello storico.");
  await parseJsonOrThrow(res);
}

/** Riporta una bozza fuori dal cestino. */
export async function restoreCampaignDraft(id: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}/restore`, { method: "POST" });
  await parseJsonOrThrow(res);
}

/** Nasconde (o rimostra) un modello della libreria per il locale. Restituisce l'elenco aggiornato. */
export async function setTemplateHidden(templateId: string, hidden: boolean): Promise<string[]> {
  const res = await fetch("/api/campaigns/templates-hidden", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, hidden }),
  });
  const { hiddenTemplates } = (await parseJsonOrThrow(res)) as { hiddenTemplates: string[] };
  return hiddenTemplates;
}

export async function uploadCampaignImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/campaigns/upload-image", { method: "POST", body: form });
  return parseJsonOrThrow(res);
}

export type AiTextAction = "rewrite" | "shorter" | "elegant" | "persuasive" | "fix" | "alternative";

/** Le riscritture dell'assistente sul testo di un blocco. */
export async function rewriteCampaignText(action: string, text: string): Promise<{ text: string }> {
  const res = await fetch("/api/campaigns/ai-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, text }),
  });
  return parseJsonOrThrow(res);
}

export async function sendTestEmail(id: string, to: string) {
  const res = await fetch(`/api/campaigns/${id}/test-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to }),
  });
  return parseJsonOrThrow(res);
}

export async function sendCampaignNow(id: string) {
  const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
  return parseJsonOrThrow(res);
}

export async function scheduleCampaignAt(id: string, at: string) {
  const res = await fetch(`/api/campaigns/${id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ at }),
  });
  return parseJsonOrThrow(res);
}
