/**
 * Togliere i segreti da tutto ciò che si scrive o si mostra.
 *
 * Un token finisce in un log nel modo più banale: si registra «la risposta
 * del fornitore» per capire un errore, e la risposta del fornitore contiene
 * `access_token`. Qui si ripulisce **prima** di scrivere, per nome di campo e
 * per forma del valore, e ogni riga di registro, ogni `lastError`, ogni
 * payload tecnico della piattaforma integrazioni passa da questa funzione.
 *
 * Volutamente larga: meglio un `[redatto]` di troppo in un log che un token
 * di troppo.
 */

const CAMPI_SEGRETI =
  /token|secret|segreto|password|passwd|authorization|api[-_]?key|apikey|client[-_]?secret|code[-_]?verifier|credential|cookie|signature|firma|^code$/i;

/** `Bearer eyJ…`, `Basic dXNlcjpwYXNz`: la forma basta a riconoscerli. */
const VALORI_SEGRETI = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;

/** Un JWT riconosciuto dalla forma, anche dentro un testo. */
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g;

export const REDATTO = "[redatto]";

export function redigiTesto(testo: string): string {
  return testo.replace(VALORI_SEGRETI, `$1 ${REDATTO}`).replace(JWT, REDATTO);
}

export function redigi<T>(valore: T, profondita = 0): T {
  if (profondita > 8) return REDATTO as unknown as T;
  if (typeof valore === "string") return redigiTesto(valore) as unknown as T;
  if (Array.isArray(valore)) return valore.map((v) => redigi(v, profondita + 1)) as unknown as T;
  if (valore && typeof valore === "object" && !(valore instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valore as Record<string, unknown>)) {
      out[k] = CAMPI_SEGRETI.test(k) ? REDATTO : redigi(v, profondita + 1);
    }
    return out as T;
  }
  return valore;
}

/** Un corpo di risposta da tenere come indizio: ripulito e accorciato. */
export function estratto(corpo: unknown, massimo = 500): string {
  if (corpo === undefined || corpo === null) return "";
  const testo = typeof corpo === "string" ? corpo : JSON.stringify(redigi(corpo));
  return redigiTesto(testo).slice(0, massimo);
}
