/**
 * Log strutturati: una riga JSON per fatto.
 *
 * Prima non c'era niente. Un'automazione che esplodeva in produzione
 * finiva in un `console.error` senza contesto, e lo si sarebbe scoperto da un
 * cliente — che è esattamente il modo in cui non si scopre un difetto.
 *
 * Non è un fornitore di error tracking e non pretende di esserlo: è la base
 * che serve **prima** di scegliere un fornitore. Una riga JSON su `stdout`
 * viene raccolta da Vercel e si cerca per campo (`vercel logs --json`, o la
 * ricerca del pannello). Il giorno che si aggiunge Sentry o simili, questo
 * modulo diventa il posto unico da cui inoltrare: le chiamate sparse per il
 * codice non si toccano.
 *
 * **Cosa non finisce nei log, mai.** Email, telefoni, nomi, indirizzi,
 * segreti, token, codici gift card: un log è il posto meno protetto in cui un
 * dato personale può finire, e ci resta per mesi. Quando serve sapere *di chi*
 * si parla si scrive l'identificativo — che senza il database non dice niente
 * a nessuno — oppure l'email mascherata con `mascheraEmail`.
 */

export type Livello = "info" | "attenzione" | "errore";

type Dati = Record<string, string | number | boolean | null | undefined>;

/** `m***a@ristorante.it`: riconoscibile da chi ha il database, inutile a un altro. */
export function mascheraEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [locale, dominio] = email.split("@");
  if (!dominio) return "***";
  const primo = locale.slice(0, 1);
  const ultimo = locale.length > 1 ? locale.slice(-1) : "";
  return `${primo}***${ultimo}@${dominio}`;
}

/** Il messaggio di un errore, senza la traccia (che va nel campo suo). */
function descrivi(err: unknown): { messaggio: string; tipo: string; traccia?: string } {
  if (err instanceof Error) {
    return {
      messaggio: err.message.slice(0, 500),
      tipo: err.name,
      traccia: err.stack?.split("\n").slice(0, 6).join(" | ").slice(0, 1200),
    };
  }
  return { messaggio: String(err).slice(0, 500), tipo: "sconosciuto" };
}

function scrivi(livello: Livello, evento: string, dati: Dati) {
  const riga = JSON.stringify({
    ts: new Date().toISOString(),
    livello,
    evento,
    ...dati,
  });
  if (livello === "errore") console.error(riga);
  else if (livello === "attenzione") console.warn(riga);
  else console.log(riga);
}

/**
 * Un fatto degno di nota: un cron finito, un lavoro riuscito, una campagna
 * consegnata. Non serve loggare tutto — un log che dice tutto non si legge.
 */
export function logEvento(evento: string, dati: Dati = {}) {
  scrivi("info", evento, dati);
}

/** Qualcosa che non va ma non ha impedito niente: un tentativo, una ripresa. */
export function logAttenzione(evento: string, dati: Dati = {}) {
  scrivi("attenzione", evento, dati);
}

/**
 * Qualcosa che è andato storto.
 *
 * `evento` va scelto perché si possa **cercare**: `cron.falliuto`,
 * `coda.lavoro_non_riuscito`, `api.errore_non_gestito`. È il campo su cui si
 * costruirà l'allarme il giorno che ci sarà un fornitore.
 */
export function logErrore(evento: string, err: unknown, dati: Dati = {}) {
  const { messaggio, tipo, traccia } = descrivi(err);
  scrivi("errore", evento, { ...dati, messaggio, tipo, traccia });
}

/**
 * Misura quanto è durato un lavoro e lo scrive, con l'esito.
 *
 * Serve ai cron e alla coda: senza la durata, «è lento» resta un'impressione,
 * e un cron che passa da due secondi a due minuti non lo nota nessuno finché
 * non scade.
 */
export async function conMisura<T>(
  evento: string,
  dati: Dati,
  lavoro: () => Promise<T>,
): Promise<T> {
  const inizio = Date.now();
  try {
    const esito = await lavoro();
    logEvento(evento, { ...dati, esito: "ok", durataMs: Date.now() - inizio });
    return esito;
  } catch (err) {
    logErrore(`${evento}.fallito`, err, { ...dati, durataMs: Date.now() - inizio });
    throw err;
  }
}
