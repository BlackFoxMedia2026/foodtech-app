import type { DesignQr } from "./qr-disegno";
import type { PayloadQr } from "./qr-contenuto";
import type { TipoQr } from "./qr-tipi";

export interface QrCodeInput {
  name: string;
  description?: string;
  kind: TipoQr;
  /** Solo per il pagamento al tavolo: uno per tavolo scelto. */
  tableIds?: string[];
  destinationUrl?: string;
  design?: DesignQr;
  payload?: PayloadQr;
  isActive?: boolean;
}

/** Il codice come torna dal server, con la destinazione già ricavata. */
export interface QrCodeSalvato {
  id: string;
  name: string;
  description: string | null;
  kind: TipoQr;
  tableId: string | null;
  tavolo: string | null;
  design: DesignQr;
  payload: PayloadQr | null;
  contenuto: string;
  link: string | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * L'errore come lo leggerà una persona.
 *
 * Il server manda già una frase scritta per chi la legge — «Il pagamento col
 * QR non è ancora acceso su questi tavoli: 4, 7» — e buttarla via per
 * scrivere «salvataggio non riuscito» sarebbe togliere l'unica cosa utile
 * della risposta.
 */
async function leggiOppureSpiega(res: Response) {
  const dati = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(dati.message || dati.error || "Non è stato possibile completare l'operazione.");
  }
  return dati;
}

export async function createQrCode(payload: QrCodeInput): Promise<QrCodeSalvato[]> {
  const res = await fetch("/api/qr-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return leggiOppureSpiega(res);
}

export async function updateQrCode(id: string, payload: Partial<QrCodeInput>): Promise<QrCodeSalvato> {
  const res = await fetch(`/api/qr-codes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return leggiOppureSpiega(res);
}

export async function deleteQrCode(id: string) {
  return leggiOppureSpiega(await fetch(`/api/qr-codes/${id}`, { method: "DELETE" }));
}

export async function duplicateQrCode(id: string): Promise<QrCodeSalvato> {
  return leggiOppureSpiega(await fetch(`/api/qr-codes/${id}/duplica`, { method: "POST" }));
}
