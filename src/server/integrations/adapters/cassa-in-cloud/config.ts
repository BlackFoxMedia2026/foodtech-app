/**
 * Dove sta Cassa in Cloud, e come ci si parla.
 *
 * Tutto da https://api-doc.cassanova.com/ (letta il 23 settembre 2026):
 *
 * - un solo host, `https://api.cassanova.com`;
 * - la versione dell'API va in **ogni** chiamata, nell'intestazione
 *   `X-Version` (tutti gli endpoint documentati sono `1.0.0`);
 * - `X-Requested-With: *` compare negli esempi di ogni chiamata che scrive e
 *   in quella del token: si manda sempre, costa niente;
 * - limite: **360 chiamate per API ogni 10 minuti**, finestra che si azzera;
 * - corpo massimo 100 KB (oltre: 413);
 * - elenchi paginati con `start` e `limit` (massimo 100).
 */

const HOST_UFFICIALE = "https://api.cassanova.com";

/**
 * L'host. Sempre quello ufficiale, tranne una sola eccezione: un server finto
 * **su questa macchina** (`CASSA_IN_CLOUD_API_BASE=http://localhost:…`), per
 * provare l'interfaccia senza una chiave vera. Qualunque altro valore si
 * ignora: una variabile sbagliata non deve poter mandare la chiave API di un
 * ristorante a un indirizzo che non è Cassa in Cloud.
 */
export function hostApi(env: NodeJS.ProcessEnv = process.env): string {
  const locale = env.CASSA_IN_CLOUD_API_BASE?.trim();
  return locale && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(locale) ? locale : HOST_UFFICIALE;
}

export const HOST = HOST_UFFICIALE;
export const VERSIONE_API = "1.0.0";
export const PERCORSO_TOKEN = "/apikey/token";

/** Il massimo per pagina che la documentazione ammette. */
export const LIMITE_PAGINA = 100;

/**
 * Quante pagine al massimo per risorsa in una sincronizzazione. Con il limite
 * di 360 chiamate per API ogni dieci minuti, venti pagine (duemila prodotti)
 * lasciano spazio a tutto il resto; un catalogo più grande si completa al
 * giro successivo, e il registro lo dice.
 */
export const MASSIMO_PAGINE = 20;

/** La finestra massima delle ricerche per data di ordini e scontrini: «meno di 3 giorni». */
export const GIORNI_FINESTRA = 2;

export const LUNGHEZZA_MASSIMA_CORPO = 100 * 1024;

/**
 * Come si passa una lista in una query (`idsSalesPoint=<List[Long]>`).
 *
 * **DA VERIFICARE CON ACCOUNT REALE**: la documentazione mostra il tipo,
 * non la forma. Si manda come array JSON (`[123]`), che è la lettura più
 * probabile; se l'account vero risponde `InvalidParams`, si cambia **solo
 * questa funzione**.
 */
export function codificaLista(valori: (string | number)[]): string {
  return JSON.stringify(valori);
}

/**
 * Le date nelle query degli ordini e degli scontrini: «string with format
 * "YYYY-MM-DD" (double quotes is mandatory)». Le virgolette fanno parte del
 * valore.
 */
export function codificaData(d: Date): string {
  return `"${d.toISOString().slice(0, 10)}"`;
}

/**
 * Quanti minuti avanti mettere la `dueDate` di un ordine esterno. La
 * documentazione chiede una data **futura** che rispetti orari di lavoro e
 * tempo minimo di elaborazione impostati nel portale del cliente.
 * **DA VERIFICARE**: il valore minimo accettato dipende dalla
 * configurazione dell'account.
 */
export const MINUTI_ANTICIPO_ORDINE = 5;
