import type { EmailContentInput } from "@/lib/campaign-blocks";
import type { SegmentFilterType } from "@/server/campaigns";

export interface SegmentPreviewResult {
  totalMatchingFilters: number;
  excludedNoEmail: number;
  excludedNoConsent: number;
  excludedSuppressed: number;
  duplicatesRemoved: number;
  finalRecipients: number;
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
