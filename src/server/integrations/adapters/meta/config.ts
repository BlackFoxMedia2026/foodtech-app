/**
 * Dove sta la Graph API di Meta (Facebook, Instagram, WhatsApp Business).
 *
 * Letto nella documentazione ufficiale il 24 settembre 2026:
 *
 * - versioni: https://developers.facebook.com/docs/graph-api/changelog/versions/
 *   (v26.0 del 29 luglio 2026 è la corrente);
 * - Facebook Login for Business e token delle pagine:
 *   https://developers.facebook.com/documentation/pages-api
 * - Instagram API con Facebook Login:
 *   https://developers.facebook.com/docs/instagram-platform/overview/
 * - WhatsApp Cloud API e token di un utente di sistema:
 *   https://developers.facebook.com/documentation/business-messaging/whatsapp/overview
 *
 * Una versione sola per tutti e tre, fissata qui: Meta ritira le versioni
 * dopo circa due anni, e il giorno in cui va cambiata si cambia in un posto.
 */

export const VERSIONE_GRAPH = "v26.0";

export const GRAPH = `https://graph.facebook.com/${VERSIONE_GRAPH}`;
export const DIALOGO_OAUTH = `https://www.facebook.com/${VERSIONE_GRAPH}/dialog/oauth`;

/**
 * L'app Meta di Foodtech: serve a Facebook e Instagram (accesso con
 * l'account), non a WhatsApp con il token dell'utente di sistema del
 * ristorante. Mai i valori fuori dal server.
 */
export function appMeta(env: NodeJS.ProcessEnv = process.env): { id: string; segreto: string } | null {
  const id = env.META_APP_ID?.trim();
  const segreto = env.META_APP_SECRET?.trim();
  return id && segreto ? { id, segreto } : null;
}

/**
 * I permessi minimi per ciò che gli adattatori fanno oggi: elencare le
 * pagine (e i profili Instagram collegati) e leggerne i dati pubblici.
 * Pubblicare, rispondere ai commenti, leggere le recensioni chiederebbero
 * altri permessi (`pages_manage_posts`, `pages_read_user_content`, …) e la
 * revisione dell'app: non si chiedono finché non c'è il codice che li usa.
 */
export const SCOPE_FACEBOOK = ["pages_show_list", "pages_read_engagement"] as const;
export const SCOPE_INSTAGRAM = ["instagram_basic", "pages_show_list", "pages_read_engagement"] as const;

/**
 * I codici d'errore di Meta che lo stato HTTP da solo non dice: Meta
 * risponde 400 anche a un token scaduto.
 * https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
export const CODICI_META = {
  /** Token non valido o scaduto (con i suoi sottocodici 458–467). */
  tokenScaduto: new Set([190, 102]),
  /** Permesso mancante o revocato. */
  permesso: new Set([10, 200, 294]),
  /** Limiti di chiamate dell'app, dell'utente o della pagina. */
  limiti: new Set([4, 17, 32, 613, 80001, 80002, 80004]),
} as const;
