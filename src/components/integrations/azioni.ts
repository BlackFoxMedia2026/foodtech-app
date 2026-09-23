import { readApiError } from "@/lib/api-client";

/**
 * Le chiamate dell'interfaccia verso `/api/integrations/<slug>`.
 *
 * Il messaggio d'errore è già quello per il ristoratore: lo scrive il
 * servizio (`erroreVersoLaRotta`). Qui si passa così com'è, con l'azione
 * suggerita («ricollega», «riprova») quando c'è.
 */

export class ErroreAzione extends Error {
  constructor(
    message: string,
    readonly azione: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function azione<T = { ok: true }>(slug: string, corpo: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/integrations/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) {
    const copia = res.clone();
    const messaggio = await readApiError(res, "Non siamo riusciti a completare l'operazione.");
    let suggerita: string | null = null;
    try {
      const j = (await copia.json()) as { detail?: { azione?: string | null } };
      suggerita = j.detail?.azione ?? null;
    } catch {
      suggerita = null;
    }
    throw new ErroreAzione(messaggio, suggerita, res.status);
  }
  return (await res.json()) as T;
}

export async function disinstallaIntegrazione(slug: string): Promise<void> {
  const res = await fetch(`/api/integrations/${slug}`, { method: "DELETE" });
  if (!res.ok) throw new ErroreAzione(await readApiError(res, "Non siamo riusciti a disinstallare."), null, res.status);
}
