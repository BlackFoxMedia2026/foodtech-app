export interface QrCodeInput {
  name: string;
  description?: string;
  destinationUrl: string;
  category?: "MENU" | "BOOKING" | "EVENT" | "REVIEW" | "CAMPAIGN" | "SOCIAL" | "OTHER";
  isActive?: boolean;
}

async function parseJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

export async function createQrCode(payload: QrCodeInput) {
  const res = await fetch("/api/qr-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function updateQrCode(id: string, payload: Partial<QrCodeInput>) {
  const res = await fetch(`/api/qr-codes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function deleteQrCode(id: string) {
  const res = await fetch(`/api/qr-codes/${id}`, { method: "DELETE" });
  return parseJsonOrThrow(res);
}
