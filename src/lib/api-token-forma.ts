/**
 * La forma di un token d'accesso all'API, senza crittografia.
 *
 * Sta in `lib` e **non importa `node:crypto`** di proposito: così la forma del
 * token si può provare da unità e nominare anche nell'interfaccia (la pagina
 * che lo consegna al ristoratore), mentre l'impronta e il confronto vivono in
 * `server/api-token.ts`, che tocca il database.
 *
 * Un token si legge in due pezzi separati da un punto:
 *
 *     tvl_7c1f9a2b4d6e.PBEr6yQ1sK...
 *     └─── prefisso ───┘ └── segreto ──┘
 *
 * Il **prefisso** sta in chiaro nel database e serve a trovare la riga con una
 * lettura sola, invece di confrontare l'impronta contro tutti i token del
 * mondo. Il **segreto** non si salva mai: nel database c'è solo la sua
 * impronta, e se il ristoratore lo perde gliene diamo un altro — non lo
 * possiamo rileggere.
 *
 * Il punto come separatore non è un dettaglio: il segreto è in base64url, che
 * per definizione non contiene punti, quindi dividere sul **primo** punto è
 * sempre corretto.
 */

/** Cosa marca i nostri token quando uno se li ritrova in un registro. */
export const MARCHIO = "tvl";

/**
 * Quanto è lungo il prefisso, in caratteri.
 *
 * Sedici, perché la colonna è `VarChar(16)`: `tvl_` più dodici cifre
 * esadecimali. Cambiarlo vuol dire cambiare anche lo schema.
 */
export const PREFISSO_LUNGHEZZA = 16;

/** Le cifre esadecimali del prefisso, dopo il marchio e il trattino basso. */
export const PREFISSO_CIFRE = PREFISSO_LUNGHEZZA - (MARCHIO.length + 1);

const PREFISSO_VALIDO = new RegExp(`^${MARCHIO}_[0-9a-f]{${PREFISSO_CIFRE}}$`);

/** Il token come lo vede chi lo usa: prefisso, punto, segreto. */
export function componiToken(prefisso: string, segreto: string): string {
  return `${prefisso}.${segreto}`;
}

export type TokenDiviso = { prefisso: string; segreto: string };

/**
 * Divide un token nei suoi due pezzi.
 *
 * `null` quando la forma non torna — e qui si è severi di proposito: un token
 * malformato non va confrontato con il database, va rifiutato subito. Una
 * lettura in meno per ogni tentativo a caso.
 */
export function dividiToken(valore: string | null | undefined): TokenDiviso | null {
  if (!valore) return null;
  const pulito = valore.trim();
  const punto = pulito.indexOf(".");
  if (punto <= 0 || punto === pulito.length - 1) return null;

  const prefisso = pulito.slice(0, punto);
  const segreto = pulito.slice(punto + 1);

  if (!PREFISSO_VALIDO.test(prefisso)) return null;
  // base64url: lettere, cifre, `-` e `_`. Niente punti, niente `+` né `/`.
  if (!/^[A-Za-z0-9_-]{20,}$/.test(segreto)) return null;

  return { prefisso, segreto };
}

/**
 * L'intestazione `Authorization` di una richiesta, ridotta al token.
 *
 * Accetta `Bearer <token>` e il token nudo: il primo è lo standard, il secondo
 * è quello che scrive chi prova con `curl` la prima volta, e rifiutarlo
 * costerebbe mezz'ora a qualcuno senza rendere niente più sicuro.
 */
export function tokenDaIntestazione(intestazione: string | null | undefined): string | null {
  if (!intestazione) return null;
  const pulita = intestazione.trim();
  if (!pulita) return null;
  /* Lo schema da solo non è un token. Senza questo controllo
     `Authorization: Bearer` (con niente dietro) restituiva la parola
     «Bearer» come se fosse il token: la forma poi lo rifiutava comunque, ma
     un difetto che si appoggia al controllo successivo è un difetto. */
  if (/^bearer$/i.test(pulita)) return null;
  const conBearer = /^bearer\s+(.+)$/i.exec(pulita);
  return (conBearer ? conBearer[1] : pulita).trim() || null;
}

/** Gli ambiti che i token possono avere oggi. */
export const AMBITI = [
  "telefonia:read",
  "telefonia:write",
] as const;

export type Ambito = (typeof AMBITI)[number];

/**
 * Questo token può fare questa cosa?
 *
 * Nessuna gerarchia e nessun carattere jolly: un ambito in più si concede
 * scrivendolo. `telefonia:write` **non** comprende `telefonia:read` — se al
 * centralino servono entrambi, glieli diamo entrambi, e così il token che
 * scrive prenotazioni non porta con sé la rubrica di tutti gli ospiti.
 */
export function haAmbito(ambiti: readonly string[], richiesto: Ambito): boolean {
  return ambiti.includes(richiesto);
}
