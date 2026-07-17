export interface BrandSettingsPayload {
  name?: string;
  brandLogoUrl?: string;
  coverImage?: string;
  brandAccent?: string;
  brandSecondaryColor?: string;
  brandBackgroundColor?: string;
  brandTypography?: "ELEGANT" | "MODERN" | "CLASSIC" | "CASUAL";
  phone?: string;
  email?: string;
  address?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  googleBusinessUrl?: string;
}

async function parseJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

export async function updateBrandSettings(payload: BrandSettingsPayload, action?: "complete" | "skip") {
  const res = await fetch("/api/venue/brand", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, action }),
  });
  return parseJsonOrThrow(res);
}

export async function uploadBrandImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/venue/brand/upload-image", { method: "POST", body: form });
  return parseJsonOrThrow(res);
}
