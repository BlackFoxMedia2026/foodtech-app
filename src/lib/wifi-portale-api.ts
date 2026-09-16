import { readApiError } from "./api-client";

/**
 * Quello che il browser manda a `/api/venue/wifi`.
 *
 * Tutti i campi sono facoltativi perché la procedura guidata salva **tutto in
 * una volta** alla fine, mentre le impostazioni avanzate e i comandi rapidi
 * della pagina (sospendi, riattiva, spunta del router) mandano una cosa sola:
 * un pulsante che per cambiare un interruttore rispedisce anche la password
 * sarebbe un modo per perderla.
 */
export type PortaleWifiPayload = {
  networkName?: string | null;
  password?: string | null;
  welcome?: string | null;
  legal?: string | null;
  accent?: string | null;
  logoUrl?: string | null;
  redirectUrl?: string | null;
  couponEnabled?: boolean;
  couponPercent?: number;
  couponDays?: number;
  askEmail?: boolean;
  askPhone?: boolean;
  askMarketing?: boolean;
  attivo?: boolean;
  routerCollegato?: boolean;
};

/**
 * Salva, e in caso di errore solleva **il messaggio del server**.
 *
 * `readApiError` sa distinguere la sessione scaduta dal ruolo che non basta:
 * «Non siamo riusciti a salvare» su un 403 manda una persona a riscrivere una
 * password che era giusta.
 */
export async function salvaPortaleWifi(payload: PortaleWifiPayload) {
  const res = await fetch("/api/venue/wifi", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Non siamo riusciti a salvare. Riprova."));
  return res.json();
}
