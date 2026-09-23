/**
 * Dove sta Lightspeed Restaurant K-Series.
 *
 * Indirizzi presi dalla documentazione ufficiale, settembre 2026:
 *
 * - autorizzazione e token (Keycloak, realm `k-series`):
 *   https://api-portal.lsk.lightspeed.app/quick-start/authentication/authorization-overview
 * - API: https://api-docs.lsk.lightspeed.app/ (server «Trial» e «Production»)
 *
 * Due ambienti, e **un client OAuth vale per uno solo**: un client di prova
 * non apre un account vero e viceversa. Per questo l'ambiente in cui è nato
 * l'accesso si salva insieme alle credenziali, e non si rilegge dalla
 * variabile d'ambiente a ogni chiamata — cambiarla non deve mandare i token
 * di un ambiente all'altro.
 */

export type AmbienteLightspeed = "trial" | "production";

export const HOST: Record<AmbienteLightspeed, { auth: string; api: string }> = {
  trial: {
    auth: "https://auth.lsk-demo.app/realms/k-series/protocol/openid-connect",
    api: "https://api.trial.lsk.lightspeed.app",
  },
  production: {
    auth: "https://auth.lsk-prod.app/realms/k-series/protocol/openid-connect",
    api: "https://api.lsk.lightspeed.app",
  },
};

/**
 * `LIGHTSPEED_K_ENVIRONMENT=production` per gli account veri. Per difetto
 * «trial»: un errore di configurazione deve fallire contro l'ambiente di
 * prova, non scrivere ordini in una cassa vera.
 */
export function ambienteConfigurato(env: NodeJS.ProcessEnv = process.env): AmbienteLightspeed {
  return env.LIGHTSPEED_K_ENVIRONMENT?.trim() === "production" ? "production" : "trial";
}

export function ambienteDa(valore: string | undefined): AmbienteLightspeed {
  return valore === "production" ? "production" : "trial";
}

export function clientOAuth(env: NodeJS.ProcessEnv = process.env): { id: string; segreto: string } | null {
  const id = env.LIGHTSPEED_K_CLIENT_ID?.trim();
  const segreto = env.LIGHTSPEED_K_CLIENT_SECRET?.trim();
  return id && segreto ? { id, segreto } : null;
}

/**
 * Gli scope chiesti: i minimi per ciò che l'adattatore fa (vedi la voce del
 * catalogo). Separati da spazio, come vuole lo standard.
 */
export const SCOPE = ["orders-api", "financial-api", "offline_access"] as const;

/** `thirdPartyReference` degli ordini: da 1 a 48 caratteri, unico. */
export const LUNGHEZZA_RIFERIMENTO = 48;

/** `endpointId` dei webhook: al massimo 50 caratteri. */
export const LUNGHEZZA_ENDPOINT = 50;
