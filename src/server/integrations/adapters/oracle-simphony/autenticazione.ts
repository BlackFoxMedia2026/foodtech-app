import { createHash, randomBytes } from "node:crypto";
import type { ClientFornitore } from "../http";
import { ErroreIntegrazione } from "../../errori";
import { REDIRECT_URI } from "./config";

/**
 * **L'accesso a Simphony: OpenID Connect, Authorization Code + PKCE.**
 *
 * Il flusso documentato per gli API account (guida STS Gen2, «Authenticate»):
 *
 * ```
 * 1. GET  {auth}/oidc-provider/v1/oauth2/authorize   (PKCE S256)  → cookie
 * 2. POST {auth}/oidc-provider/v1/oauth2/signin      (utente, password, orgname) → code
 * 3. POST {auth}/oidc-provider/v1/oauth2/token       (code + code_verifier)       → id_token, refresh_token
 *    POST {auth}/oidc-provider/v1/oauth2/token       (grant_type=refresh_token)   → rinnovo
 * ```
 *
 * **Non esiste un client secret**: il client è pubblico, e ciò che lo
 * protegge sono PKCE e le credenziali dell'API account. Il bearer delle API è
 * l'`id_token` (l'`access_token` è documentato come «Not used»).
 *
 * La password serve **una volta sola**, qui: non si salva. Si conservano
 * solo `id_token` e `refresh_token`, cifrati. Se la catena dei rinnovi si
 * rompe (28 giorni senza rinnovo, aggiornamento di Reporting and Analytics,
 * password scaduta dopo 60 giorni) si chiede di ricollegarsi.
 */

export type TokenOracle = { idToken: string; refreshToken: string; scadeTraSecondi: number };

const base64url = (b: Buffer) => b.toString("base64url");

export function coppiaPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48)); // 64 caratteri, fra 43 e 128
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

/** I cookie della risposta, pronti per l'intestazione `Cookie` della chiamata dopo. */
export function cookieDa(intestazioni: Headers): string {
  const tutti =
    typeof (intestazioni as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (intestazioni as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : (intestazioni.get("set-cookie") ?? "").split(/,(?=\s*[^;,=\s]+=)/);
  return tutti
    .map((c) => c.split(";")[0]!.trim())
    .filter((c) => c.includes("="))
    .join("; ");
}

/** Il `code` dentro `redirectUrl` («apiaccount://callback?code=…» o «?code=…»). */
export function codiceDa(redirectUrl: unknown): string | null {
  if (typeof redirectUrl !== "string") return null;
  const m = /[?&]code=([^&]+)/.exec(redirectUrl);
  return m ? decodeURIComponent(m[1]!) : null;
}

function leggiToken(corpo: unknown): TokenOracle {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const idToken = typeof c.id_token === "string" ? c.id_token : null;
  const refreshToken = typeof c.refresh_token === "string" ? c.refresh_token : null;
  if (!idToken || !refreshToken) throw new ErroreIntegrazione("UNKNOWN", "Risposta inattesa da Simphony: manca id_token o refresh_token");
  // `expires_in` è una stringa nell'esempio ufficiale ("1209600").
  const n = Number(c.expires_in);
  return { idToken, refreshToken, scadeTraSecondi: Number.isFinite(n) && n > 0 ? n : 14 * 24 * 3600 };
}

export async function accedi(
  http: ClientFornitore,
  input: { auth: string; clientId: string; utente: string; password: string; organizzazione: string },
): Promise<TokenOracle> {
  const { verifier, challenge } = coppiaPkce();
  const radice = `${input.auth}/oidc-provider/v1/oauth2`;

  const autorizza = await http.richiestaCompleta({
    url: `${radice}/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: input.clientId,
      scope: "openid",
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`,
    redirect: "error",
  });
  const cookie = cookieDa(autorizza.intestazioni);

  let accesso: Record<string, unknown>;
  try {
    accesso = (await http.richiesta<Record<string, unknown>>({
      metodo: "POST",
      url: `${radice}/signin`,
      intestazioni: cookie ? { Cookie: cookie } : {},
      corpo: new URLSearchParams({ username: input.utente, password: input.password, orgname: input.organizzazione }),
      redirect: "error",
    })) ?? {};
  } catch (err) {
    // 401 AUTHENTICATION_INVALID: credenziali sbagliate o account bloccato (30 minuti).
    if (err instanceof ErroreIntegrazione && err.dettaglio.status === 401) {
      throw new ErroreIntegrazione("AUTH_INVALID", "Simphony non accetta utente, password o organizzazione", err.dettaglio);
    }
    throw err;
  }
  if (accesso.nextOp === "expired") {
    throw new ErroreIntegrazione("AUTH_INVALID", "La password dell'API account è scaduta (dura 60 giorni)");
  }
  const code = codiceDa(accesso.redirectUrl);
  if (!code) throw new ErroreIntegrazione("AUTH_INVALID", "Simphony non ha restituito il codice di autorizzazione");

  const token = await http.richiesta({
    metodo: "POST",
    url: `${radice}/token`,
    corpo: new URLSearchParams({
      grant_type: "authorization_code",
      scope: "openid",
      client_id: input.clientId,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
    redirect: "error",
  });
  return leggiToken(token);
}

export async function rinnova(
  http: ClientFornitore,
  input: { auth: string; clientId: string; refreshToken: string },
): Promise<TokenOracle> {
  try {
    const token = await http.richiesta({
      metodo: "POST",
      url: `${input.auth}/oidc-provider/v1/oauth2/token`,
      corpo: new URLSearchParams({
        grant_type: "refresh_token",
        scope: "openid",
        client_id: input.clientId,
        redirect_uri: REDIRECT_URI,
        refresh_token: input.refreshToken,
      }),
      redirect: "error",
    });
    return leggiToken(token);
  } catch (err) {
    // 401 AUTHENTICATION_CODE_NOT_FOUND / AUTHENTICATION_INVALID: si rifà il flusso intero.
    if (err instanceof ErroreIntegrazione && (err.dettaglio.status === 401 || err.dettaglio.status === 400)) {
      throw new ErroreIntegrazione("AUTH_EXPIRED", "Simphony non rinnova più l'accesso: serve ricollegarsi", err.dettaglio);
    }
    throw err;
  }
}
