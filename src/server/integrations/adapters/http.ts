import { AsyncLocalStorage } from "node:async_hooks";
import { logAttenzione } from "@/lib/observability";
import { ErroreIntegrazione, erroreDaHttp, normalizzaErrore } from "../errori";
import { redigi, REDATTO } from "../redazione";

/**
 * **L'unico modo in cui un adattatore parla con un fornitore.**
 *
 * Ogni chiamata esterna passa da qui, per quattro ragioni che altrimenti
 * ogni adattatore dovrebbe ricordarsi da solo:
 *
 * - **un tempo massimo.** `fetch` senza limite aspetta per sempre, e una
 *   cassa che non risponde terrebbe ferma la coda dei lavori;
 * - **gli errori diventano `ErroreIntegrazione`**, con il codice giusto
 *   (401 → accesso scaduto, 429 → rallentare, 5xx → fornitore giù) e il
 *   `Retry-After` quando il fornitore lo manda;
 * - **nessun segreto nei log.** Si registra metodo, indirizzo senza query,
 *   stato e durata. Mai intestazioni, mai corpi;
 * - **il filo della correlazione**: ogni chiamata porta lo stesso
 *   identificativo della sincronizzazione che la fa, e lo ritrovi nel
 *   registro.
 *
 * `fetchImpl` si sostituisce nei test: è così che l'adattatore Lightspeed si
 * prova con le risposte della documentazione senza un account vero.
 */

export type RichiestaFornitore = {
  metodo?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  intestazioni?: Record<string, string>;
  /** Oggetto → JSON; `URLSearchParams` → form. */
  corpo?: unknown;
  timeoutMs?: number;
  /**
   * `"error"`: un redirect fa fallire la chiamata invece di essere seguito.
   * Obbligatorio verso indirizzi scelti per installazione (Oracle): un
   * redirect porterebbe le credenziali su un host mai controllato.
   */
  redirect?: "error";
};

export type RispostaCompleta<T> = { status: number; dati: T; intestazioni: Headers };

export type ClientFornitore = {
  richiesta<T = unknown>(r: RichiestaFornitore): Promise<T>;
  /**
   * Come `richiesta`, con stato e intestazioni della risposta: servono a
   * chi legge un'informazione dalle intestazioni (Oracle Simphony:
   * `Simphony-POS-Connected` su `HEAD`, i cookie del flusso PKCE).
   * Le intestazioni non si registrano mai.
   */
  richiestaCompleta<T = unknown>(r: RichiestaFornitore): Promise<RispostaCompleta<T>>;
  readonly correlationId: string;
};

export const TIMEOUT_PREDEFINITO_MS = 15_000;

/* -------------------------------------------------------------------------- */
/*  Registrazione delle chiamate (solo console di certificazione)             */
/* -------------------------------------------------------------------------- */

/**
 * Una chiamata al fornitore come la vede la console di certificazione: il
 * corpo mandato e quello ricevuto, **ripuliti** (token, segreti, dati
 * personali, chiavi) e troncati. Mai intestazioni.
 */
export type ChiamataRegistrata = {
  inizio: string;
  durataMs: number;
  metodo: string;
  endpoint: string;
  status: number | null;
  richiesta: unknown;
  risposta: unknown;
  codiceErrore: string | null;
};

const registro = new AsyncLocalStorage<ChiamataRegistrata[]>();

/** Più larga della redazione dei log: qui si mostra una risposta intera. */
const DATI_PERSONALI = /e-?mail|phone|telefono|mobile|cellulare|first_?name|last_?name|surname|cognome|fiscal_?code|codice_?fiscale|birth|hmac|private/i;
const MASSIMO_CARATTERI = 20_000;

export function ripulisciPerConsole(valore: unknown, profondita = 0): unknown {
  if (profondita > 12) return REDATTO;
  const base = profondita === 0 ? redigi(valore) : valore;
  if (Array.isArray(base)) return base.map((v) => ripulisciPerConsole(v, profondita + 1));
  if (base && typeof base === "object" && !(base instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(base as Record<string, unknown>)) {
      out[k] = DATI_PERSONALI.test(k) && v !== null && v !== "" ? REDATTO : ripulisciPerConsole(v, profondita + 1);
    }
    return out;
  }
  return base;
}

function perConsole(valore: unknown): unknown {
  if (valore === undefined || valore === null || valore === "") return null;
  const oggetto = valore instanceof URLSearchParams ? Object.fromEntries(valore) : valore;
  const pulito = ripulisciPerConsole(oggetto);
  const testo = typeof pulito === "string" ? pulito : JSON.stringify(pulito);
  return testo.length > MASSIMO_CARATTERI ? { troncato: true, estratto: testo.slice(0, MASSIMO_CARATTERI) } : pulito;
}

/**
 * Esegue `fn` ricordando ogni chiamata ai fornitori fatta dentro di lei
 * (anche in profondità: `inviaOrdine` → `tentaInvio` → adattatore). Fuori da
 * qui il client non registra niente.
 */
export async function conRegistrazione<T>(fn: () => Promise<T>): Promise<{ risultato: T; chiamate: ChiamataRegistrata[] }> {
  const chiamate: ChiamataRegistrata[] = [];
  try {
    const risultato = await registro.run(chiamate, fn);
    return { risultato, chiamate };
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { chiamateRegistrate: chiamate });
  }
}

/** Le chiamate registrate prima che `conRegistrazione` sollevasse. */
export function chiamateDellErrore(err: unknown): ChiamataRegistrata[] {
  return (err as { chiamateRegistrate?: ChiamataRegistrata[] } | null)?.chiamateRegistrate ?? [];
}

/** Indirizzo senza query string: nella query a volte viaggiano chiavi. */
export function indirizzoDaRegistrare(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[indirizzo non valido]";
  }
}

/** `Retry-After` può essere secondi o una data HTTP. */
export function secondiDaRetryAfter(valore: string | null, adesso = Date.now()): number | undefined {
  if (!valore) return undefined;
  const n = Number(valore);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.round(n), 3600);
  const data = Date.parse(valore);
  if (Number.isFinite(data)) return Math.max(0, Math.min(Math.round((data - adesso) / 1000), 3600));
  return undefined;
}

/**
 * `JSON.parse` che non rovina gli identificativi a 64 bit.
 *
 * Lightspeed (e non solo) usa interi `int64` per gli identificativi: oltre
 * 2^53 un numero JavaScript perde le ultime cifre, e `247158188015618123`
 * diventa `247158188015618120`. Un identificativo con un'ultima cifra
 * sbagliata è **il tavolo di un altro**. Prima di leggere, ogni intero da
 * sedici cifre in su che sta al posto di un valore diventa una stringa.
 */
export function jsonConInteriSicuri(testo: string): unknown {
  return JSON.parse(testo.replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"'));
}

export function creaClientFornitore(opzioni: {
  correlationId: string;
  /** Intestazioni aggiunte a ogni chiamata (per esempio `Authorization`). */
  intestazioni?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
  slug: string;
}): ClientFornitore {
  const f = opzioni.fetchImpl ?? fetch;

  const client: ClientFornitore = {
    correlationId: opzioni.correlationId,
    async richiesta<T>(r: RichiestaFornitore): Promise<T> {
      return (await client.richiestaCompleta<T>(r)).dati;
    },
    async richiestaCompleta<T>(r: RichiestaFornitore): Promise<RispostaCompleta<T>> {
      const metodo = r.metodo ?? "GET";
      const endpoint = indirizzoDaRegistrare(r.url);
      const intestazioni: Record<string, string> = {
        Accept: "application/json",
        "X-Correlation-Id": opzioni.correlationId,
        ...(opzioni.intestazioni?.() ?? {}),
        ...(r.intestazioni ?? {}),
      };

      let body: BodyInit | undefined;
      if (r.corpo instanceof URLSearchParams) {
        body = r.corpo;
        intestazioni["Content-Type"] = "application/x-www-form-urlencoded";
      } else if (r.corpo !== undefined) {
        body = JSON.stringify(r.corpo);
        intestazioni["Content-Type"] = "application/json";
      }

      const inizio = Date.now();
      const registrate = registro.getStore();
      const annota = (status: number | null, risposta: unknown, codiceErrore: string | null) =>
        registrate?.push({
          inizio: new Date(inizio).toISOString(),
          durataMs: Date.now() - inizio,
          metodo,
          endpoint,
          status,
          richiesta: perConsole(r.corpo),
          risposta: perConsole(risposta),
          codiceErrore,
        });
      let risposta: Response;
      try {
        risposta = await f(r.url, {
          method: metodo,
          headers: intestazioni,
          body,
          signal: AbortSignal.timeout(r.timeoutMs ?? TIMEOUT_PREDEFINITO_MS),
          cache: "no-store",
          ...(r.redirect ? { redirect: r.redirect } : {}),
        });
      } catch (err) {
        const e = normalizzaErrore(err, opzioni.correlationId);
        annota(null, null, e.codice);
        logAttenzione("integrazione.chiamata_non_riuscita", {
          slug: opzioni.slug,
          metodo,
          endpoint,
          codice: e.codice,
          durataMs: Date.now() - inizio,
          corr: opzioni.correlationId,
        });
        throw new ErroreIntegrazione(e.codice, e.message, { metodo, endpoint }, opzioni.correlationId);
      }

      const testo = await risposta.text();
      let dati: unknown = testo;
      if (testo && /json/i.test(risposta.headers.get("content-type") ?? "json")) {
        try {
          dati = jsonConInteriSicuri(testo);
        } catch {
          dati = testo;
        }
      }

      annota(risposta.status, testo ? dati : null, risposta.ok ? null : "HTTP");
      if (!risposta.ok) {
        const e = erroreDaHttp(
          risposta.status,
          dati,
          { metodo, endpoint, riprovaTraSecondi: secondiDaRetryAfter(risposta.headers.get("retry-after")) },
          opzioni.correlationId,
        );
        logAttenzione("integrazione.risposta_non_riuscita", {
          slug: opzioni.slug,
          metodo,
          endpoint,
          status: risposta.status,
          codice: e.codice,
          durataMs: Date.now() - inizio,
          corr: opzioni.correlationId,
        });
        throw e;
      }

      return { status: risposta.status, dati: (testo ? dati : null) as T, intestazioni: risposta.headers };
    },
  };
  return client;
}
