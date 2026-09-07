import { createHmac, timingSafeEqual } from "crypto";

/**
 * Link firmati per le azioni che l'ospite fa dai promemoria: confermare o
 * annullare.
 *
 * Firmati e non indovinabili: l'identificativo di una prenotazione da solo
 * permetterebbe a chiunque di annullare la cena di un altro provando id a
 * caso. La firma lega il link a una prenotazione **e** a un'azione, così il
 * link per confermare non serve ad annullare.
 *
 * Riusa `NEXTAUTH_SECRET`, già obbligatorio in produzione, invece di
 * introdurre un'altra variabile d'ambiente da dimenticare
 * (stessa scelta di `unsubscribe-token.ts`).
 */

const SECRET = process.env.NEXTAUTH_SECRET ?? "";

export type BookingAction = "view" | "confirm" | "cancel";

function sign(value: string): string {
  // Senza segreto la firma sarebbe una formalità: chiunque conosca
  // l'algoritmo potrebbe annullare la cena di un altro. Meglio fallire in modo
  // rumoroso in fase di configurazione che silenziosamente in produzione.
  if (!SECRET) throw new Error("NEXTAUTH_SECRET non configurato: impossibile firmare i link ospite");
  return createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 32);
}

/** `action:bookingId` codificato in base64url, perché il token finisce in un
 * percorso: i due punti non sopravvivono al passaggio, e un separatore
 * riservato in un URL è un bug che si scopre in produzione. */
function encodePayload(payload: string): string {
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodePayload(encoded: string): string | null {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return /^[a-z]+:[A-Za-z0-9_-]+$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function signBookingToken(bookingId: string, action: BookingAction): string {
  const payload = `${action}:${bookingId}`;
  return `${encodePayload(payload)}.${sign(payload)}`;
}

/** Ritorna prenotazione e azione se la firma è valida, altrimenti null. */
export function verifyBookingToken(token: string): { bookingId: string; action: BookingAction } | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = decodePayload(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!payload) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  const colon = payload.indexOf(":");
  if (colon <= 0) return null;

  const action = payload.slice(0, colon) as BookingAction;
  const bookingId = payload.slice(colon + 1);
  if (!bookingId) return null;
  if (action !== "view" && action !== "confirm" && action !== "cancel") return null;

  return { bookingId, action };
}
