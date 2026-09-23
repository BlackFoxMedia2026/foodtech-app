/**
 * Dove sta Tilby, e come ci si parla.
 *
 * Da https://developer.tilby.com/ (letto il 23 settembre 2026):
 *
 * - l'OpenAPI di ogni pagina del reference dichiara il server
 *   `https://api.tilby.com/v2`; le guide (webhook, query string, autenticazione)
 *   usano ancora `api.scloby.com`, il nome precedente. Si usa quello
 *   dell'OpenAPI;
 * - autenticazione: `Authorization: Bearer <token statico>`, un token per
 *   **un solo** negozio, ottenibile solo dopo la certificazione;
 * - nessun limite di frequenza documentato; senza paginazione le liste
 *   restituiscono al massimo 1000 elementi.
 */

const HOST_UFFICIALE = "https://api.tilby.com/v2";

/**
 * Prova o produzione.
 *
 * La documentazione descrive la **sandbox** come un ambiente separato (lo si
 * richiede, ci si entra da login.tilby.com, e lì si genera un token statico),
 * non come un host diverso: il token appartiene al negozio di prova, e l'API è
 * la stessa. DA VERIFICARE con la sandbox vera: se l'host fosse diverso, si
 * cambia solo questa tabella — mai un indirizzo scritto dal ristoratore.
 */
export const AMBIENTI = {
  sandbox: { etichetta: "Sandbox Tilby (prova)", host: HOST_UFFICIALE },
  production: { etichetta: "Produzione", host: HOST_UFFICIALE },
} as const;

export type AmbienteTilby = keyof typeof AMBIENTI;

export function ambienteDa(valore: unknown): AmbienteTilby {
  return valore === "production" ? "production" : "sandbox";
}

/**
 * L'host dell'ambiente. Unica eccezione: un server finto **su questa
 * macchina** (`TILBY_API_BASE=http://localhost:…/v2`), per provare
 * l'interfaccia senza un token vero. Qualunque altro valore si ignora: una
 * variabile sbagliata non deve poter mandare il token di un negozio altrove.
 */
export function hostApi(ambiente: AmbienteTilby, env: NodeJS.ProcessEnv = process.env): string {
  const locale = env.TILBY_API_BASE?.trim();
  if (locale && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/v2)?$/.test(locale)) return locale.replace(/\/$/, "");
  return AMBIENTI[ambiente].host;
}

/** Elementi per pagina nelle letture paginate (`pagination=true&per_page=…&page=…`). */
export const PER_PAGINA = 100;
/** Pagine al massimo per risorsa in una sincronizzazione. */
export const MASSIMO_PAGINE = 20;

/** `sale_items[].exit`: «can be null or from 1 to 10». */
export const USCITA_MASSIMA = 10;

/**
 * Chi risulta aver battuto la vendita. `seller_id` e `seller_name` sono
 * obbligatori su vendita e righe; gli esempi ufficiali (reference e guida
 * alla stampa automatica) usano `seller_id: 0`. DA VERIFICARE se un
 * negozio vero lo accetta, o vuole l'id di un operatore Tilby.
 */
export const VENDITORE = { id: 0, nome: "Foodtech" } as const;

/**
 * I webhook che Foodtech registra all'attivazione: solo quelli che servono.
 * Coppie `entity_type` / `event_type` della documentazione («Entities and
 * events»). Uno per negozio per coppia.
 */
export const WEBHOOK_REGISTRATI: { entity_type: string; event_type: string }[] = [
  { entity_type: "sales", event_type: "CREATED" },
  { entity_type: "sales", event_type: "UPDATED" },
  { entity_type: "sales", event_type: "CLOSED" },
  { entity_type: "sales", event_type: "DELETED" },
  { entity_type: "items", event_type: "CREATED" },
  { entity_type: "items", event_type: "UPDATED" },
  { entity_type: "items", event_type: "DELETED" },
  { entity_type: "categories", event_type: "UPDATED" },
  { entity_type: "rooms", event_type: "UPDATED" },
];

/** A chi Tilby scrive quando un webhook fallisce: campo obbligatorio della registrazione. */
export function emailWebhook(env: NodeJS.ProcessEnv = process.env): string | null {
  const e = env.TILBY_WEBHOOK_EMAIL?.trim();
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}
