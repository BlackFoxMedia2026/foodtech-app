import { createHmac, timingSafeEqual } from "crypto";

/**
 * Riusa NEXTAUTH_SECRET (già richiesto in produzione da next-auth) invece di
 * introdurre una nuova variabile d'ambiente solo per firmare questi token.
 */
const SECRET = process.env.NEXTAUTH_SECRET ?? "";

/** Id riservato per i link di disiscrizione nelle email di test: nessun Guest reale è coinvolto. */
export const PREVIEW_UNSUBSCRIBE_ID = "preview";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 32);
}

export function signUnsubscribeToken(guestId: string): string {
  return `${guestId}.${sign(guestId)}`;
}

/** Ritorna il guestId se la firma è valida, altrimenti null (token assente/manomesso). */
export function verifyUnsubscribeToken(token: string): string | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return null;
  const guestId = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expected = sign(guestId);
  if (expected.length !== signature.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) ? guestId : null;
}
