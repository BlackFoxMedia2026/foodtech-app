import type { RegoleIndirizzo } from "../../indirizzi";

/**
 * **Oracle Simphony Transaction Services Gen2 (STS Gen2): cosa è fisso.**
 *
 * Fonte unica: la guida ufficiale
 * https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/
 * e il suo `swagger.json` (versione 2026.08.15). Nessuna API Gen1.
 *
 * Gli indirizzi **non** sono fissi: ogni cliente ha i suoi, visibili in EMC
 * (Enterprise Parameters → Applications: «Transaction Services Generation 2
 * Services» e «OpenID Provider»). Si inseriscono nel percorso di
 * installazione e passano da `indirizzi.ts`.
 */

/** Sempre questo valore per gli API account (guida, «Authenticate»). */
export const REDIRECT_URI = "apiaccount://callback";

/**
 * I domini ammessi per gli indirizzi di Simphony.
 *
 * La documentazione non pubblica l'elenco dei domini degli ambienti Oracle.
 * L'unico esempio concreto è `https://mtu03-ohsim.oracleindustry.com`
 * (guida CCAPI, «Find the URL»): da lì il valore predefinito. L'operatore di
 * Foodtech può aggiungerne altri con `ORACLE_SIMPHONY_DOMINI_CONSENTITI`
 * (separati da virgole) dopo averli verificati con il cliente: **mai** il
 * ristoratore dal modulo. DA VERIFICARE con il primo ambiente vero.
 */
export const DOMINI_PREDEFINITI = ["oracleindustry.com"];

export function regoleIndirizzo(env: NodeJS.ProcessEnv = process.env): RegoleIndirizzo {
  const extra = (env.ORACLE_SIMPHONY_DOMINI_CONSENTITI ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^\*?\./, ""))
    .filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
  return { suffissi: [...DOMINI_PREDEFINITI, ...extra], originePerProve: originePerProve(env) };
}

/**
 * L'origine del server Oracle **finto** delle prove nel browser. Accettata
 * solo se è un indirizzo di loopback esatto: non è un modo per raggiungere
 * altro, e non si imposta dal modulo.
 */
function originePerProve(env: NodeJS.ProcessEnv): string | null {
  const v = env.ORACLE_SIMPHONY_ORIGINE_PROVA?.trim();
  return v && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v) ? v : null;
}

/** Quanto prima della scadenza si rinnova l'`id_token` (Oracle consiglia 3–7 giorni). */
export const ANTICIPO_RINNOVO_MS = 4 * 24 * 3600_000;
/** Durata documentata dell'`id_token` (14 giorni) e del refresh token (28 giorni). */
export const DURATA_ID_TOKEN_S = 14 * 24 * 3600;
export const DURATA_REFRESH_MS = 28 * 24 * 3600_000;

/**
 * Le chiamate ai check passano da servizi on-premises e possono essere lente
 * (guida, «Checks API»). Oracle risponde 521 dopo 60 secondi: aspettiamo un
 * poco di più, invece dei 15 secondi predefiniti.
 */
export const TIMEOUT_CHECK_MS = 65_000;

/** Riferimento dei dati Foodtech dentro il check, restituito dalle API (`includeInApiResponse`). */
export const APP_ESTENSIONE = "foodtech";

/**
 * Domini di primo livello ammessi da Oracle per l'indirizzo delle notifiche
 * (guida, «Webhook REST Endpoints»), sempre HTTPS sulla porta 443.
 */
export const TLD_NOTIFICHE = ["com", "net", "org", "edu", "ca", "io", "site", "se", "sa"];

/** I tipi di notifica documentati (`GET /notifications/discovery`) e il livello a cui si sottoscrivono. */
export const NOTIFICHE: { id: string; livello: "rvc" | "location" }[] = [
  { id: "CheckNotification", livello: "rvc" },
  { id: "ConfigurationNotification", livello: "rvc" },
  { id: "OrganizationsNotification", livello: "rvc" },
  // Solo organizzazione o location: con un rvcRef Oracle risponde 400.
  { id: "EmployeesNotification", livello: "location" },
];
