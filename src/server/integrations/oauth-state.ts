import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * **Lo `state` del ritorno OAuth.**
 *
 * Quando il ristoratore torna dal fornitore, l'indirizzo di ritorno porta un
 * codice che vale un accesso alla sua cassa. Tre domande a cui lo `state`
 * deve rispondere prima di scambiarlo:
 *
 * - **per quale installazione, di quale locale?** Sono dentro lo `state`,
 *   firmato: non si possono cambiare per far finire i token di un ristorante
 *   sull'installazione di un altro;
 * - **l'ha chiesto questo browser?** Il nonce sta anche in un cookie
 *   `httpOnly`: uno `state` valido incollato in un altro browser non basta
 *   (è l'attacco classico al ritorno OAuth, il «login CSRF»);
 * - **è recente?** Dieci minuti. Un link di autorizzazione lasciato aperto un
 *   giorno non si usa più.
 *
 * Firmato con `NEXTAUTH_SECRET`, già obbligatorio in produzione, come i link
 * dei promemoria (`lib/booking-token.ts`). Senza segreto non si firma: uno
 * `state` indovinabile sarebbe una formalità.
 */

export const COOKIE_NONCE = "ft_int_oauth";
export const DURATA_STATE_MS = 10 * 60_000;

export type ContenutoState = {
  installationId: string;
  venueId: string;
  userId: string;
  slug: string;
  nonce: string;
  scade: number;
};

function segreto(): string {
  const s = process.env.NEXTAUTH_SECRET ?? "";
  if (!s) throw new Error("NEXTAUTH_SECRET non configurato: impossibile firmare lo state OAuth");
  return s;
}

function firma(dati: string): string {
  return createHmac("sha256", segreto()).update(`integrazioni.oauth:${dati}`).digest("base64url");
}

export function creaState(
  c: Omit<ContenutoState, "nonce" | "scade">,
  adesso = Date.now(),
): { state: string; nonce: string } {
  const nonce = randomBytes(18).toString("base64url");
  const contenuto: ContenutoState = { ...c, nonce, scade: adesso + DURATA_STATE_MS };
  const dati = Buffer.from(JSON.stringify(contenuto)).toString("base64url");
  return { state: `${dati}.${firma(dati)}`, nonce };
}

export type EsitoState =
  | { ok: true; contenuto: ContenutoState }
  | { ok: false; motivo: "formato" | "firma" | "scaduto" | "browser" };

export function verificaState(state: string, nonceCookie: string | undefined, adesso = Date.now()): EsitoState {
  const [dati, firmaRicevuta] = state.split(".");
  if (!dati || !firmaRicevuta) return { ok: false, motivo: "formato" };

  const attesa = Buffer.from(firma(dati));
  const ricevuta = Buffer.from(firmaRicevuta);
  if (attesa.length !== ricevuta.length || !timingSafeEqual(attesa, ricevuta)) {
    return { ok: false, motivo: "firma" };
  }

  let contenuto: ContenutoState;
  try {
    contenuto = JSON.parse(Buffer.from(dati, "base64url").toString("utf8")) as ContenutoState;
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (typeof contenuto.scade !== "number" || contenuto.scade < adesso) return { ok: false, motivo: "scaduto" };

  const n1 = Buffer.from(contenuto.nonce ?? "");
  const n2 = Buffer.from(nonceCookie ?? "");
  if (!nonceCookie || n1.length !== n2.length || !timingSafeEqual(n1, n2)) {
    return { ok: false, motivo: "browser" };
  }
  return { ok: true, contenuto };
}
