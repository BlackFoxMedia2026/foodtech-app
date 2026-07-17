import type { Block } from "@/lib/campaign-blocks";
import type { SegmentFilterType } from "@/server/campaigns";

export interface SegmentPreviewResult {
  totalMatchingFilters: number;
  excludedNoEmail: number;
  excludedNoConsent: number;
  finalRecipients: number;
}

export interface DraftPayload {
  name?: string;
  subject?: string;
  previewText?: string;
  segment?: SegmentFilterType;
  contentBlocks?: Block[];
}

async function parseJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "request_failed");
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
