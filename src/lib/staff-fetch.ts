"use client";

import { readApiError } from "./api-client";

/**
 * **Le richieste della Staff App**, con il codice dell'errore.
 *
 * `readApiError` restituisce una frase da mostrare, e per il back office
 * basta. Qui no: alcuni errori non si mostrano, si **gestiscono**. Il più
 * importante è `modifica_da_confermare` (§24) — la comanda è già in cucina, e
 * la risposta giusta non è un messaggio rosso ma una domanda con due
 * pulsanti. Per distinguerlo serve il codice, non il testo.
 *
 * ## Il §38, in due righe
 *
 * **Il timeout.** Una richiesta che non torna lascia un pulsante disabilitato
 * per sempre: in sala vuol dire un cameriere fermo davanti a uno schermo che
 * non risponde. Dodici secondi e si arrende con un messaggio che dice cosa
 * fare — non «errore di rete», che non è un consiglio.
 *
 * **La rete assente** si riconosce e si scrive con parole sue: «Sei offline»
 * è un'informazione su cui si può agire (spostarsi di tre metri), «Qualcosa è
 * andato storto» no.
 */

export class ErroreStaff extends Error {
  constructor(
    readonly codice: string,
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ErroreStaff";
  }
}

const TIMEOUT_MS = 12_000;

export async function chiedi<T>(
  url: string,
  opts: { metodo?: string; corpo?: unknown; segnale?: AbortSignal } = {},
): Promise<T> {
  const timeout = new AbortController();
  const orologio = setTimeout(() => timeout.abort(), TIMEOUT_MS);

  /* Due motivi per interrompere — il timeout e chi ha chiamato — e uno solo
     `signal` da passare: si propaga il primo che scatta. */
  if (opts.segnale) {
    if (opts.segnale.aborted) timeout.abort();
    else opts.segnale.addEventListener("abort", () => timeout.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.metodo ?? "GET",
      cache: "no-store",
      signal: timeout.signal,
      ...(opts.corpo === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts.corpo) }),
    });
  } catch (err) {
    clearTimeout(orologio);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new ErroreStaff("offline", "Sei offline. Il gesto riparte appena torna la rete.", 0);
    }
    if ((err as Error)?.name === "AbortError") {
      throw new ErroreStaff(
        "timeout",
        "La rete non risponde. Riprova: niente è stato inviato due volte.",
        0,
      );
    }
    throw new ErroreStaff("rete", "Non riesco a raggiungere il server. Riprova.", 0);
  } finally {
    clearTimeout(orologio);
  }

  if (res.ok) return (await res.json()) as T;

  /* Il corpo si legge una volta sola: `readApiError` lo consuma, quindi il
     codice va preso prima, da una copia. */
  const copia = res.clone();
  const messaggio = await readApiError(res, "Non è stato possibile completare l'operazione.");
  let codice = `http_${res.status}`;
  let detail: unknown;
  try {
    const corpo = (await copia.json()) as { error?: string; detail?: unknown };
    if (corpo?.error) codice = corpo.error;
    detail = corpo?.detail;
  } catch {
    /* Una risposta senza corpo JSON: resta il codice costruito dallo status. */
  }

  throw new ErroreStaff(codice, messaggio, res.status, detail);
}

/**
 * Una chiave di idempotenza per **un** tentativo di invio (§38).
 *
 * Si genera una volta e si tiene finché il gesto non riesce: due tap sullo
 * stesso pulsante devono mandare la stessa chiave, ed è quello che impedisce
 * alla cucina di ricevere la comanda due volte. `randomUUID` non c'è sui
 * browser vecchi e su http non sicuro, da cui la riserva.
 */
export function chiaveInvio(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
