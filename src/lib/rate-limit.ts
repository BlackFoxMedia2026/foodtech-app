/**
 * Limite di frequenza a finestra fissa.
 *
 * Prima non ce n'era da nessuna parte: il widget pubblico accettava
 * prenotazioni senza limite, senza captcha e senza verifica del contatto. Il
 * controllo di disponibilità impedisce la prenotazione *impossibile*, non
 * quella *finta*: un bot poteva saturare tutti i turni con indirizzi
 * inventati. Anche il login era illimitato, quindi provare password a raffica
 * non costava nulla.
 *
 * Il conteggio sta in memoria del processo. Su Vercel questo significa che il
 * limite vale **per istanza**: con tre istanze attive, tre volte le richieste.
 * È comunque la differenza fra "nessun freno" e "un freno", e la firma di
 * `RateLimitStore` è pensata perché sostituire la memoria con Redis (o Upstash)
 * sia una riga sola, il giorno in cui il traffico lo rende necessario.
 *
 * Deliberatamente senza dipendenze e senza API di Node: gira anche nel
 * middleware, che è dove viene usato.
 */

export type RateLimitVerdict = {
  ok: boolean;
  /** Richieste ancora disponibili nella finestra. */
  remaining: number;
  /** Secondi da attendere prima di riprovare (0 se `ok`). */
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** Quante richieste sono ammesse nella finestra. */
  limit: number;
  /** Ampiezza della finestra in millisecondi. */
  windowMs: number;
};

export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule, now: number): RateLimitVerdict;
}

type Bucket = { count: number; resetAt: number };

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();
  /** Oltre questa soglia ripulisce le finestre già scadute: senza un tetto la
   * mappa crescerebbe con ogni IP visto, e questo processo vive a lungo. */
  private readonly sweepThreshold = 5_000;

  hit(key: string, rule: RateLimitRule, now: number): RateLimitVerdict {
    if (this.buckets.size > this.sweepThreshold) this.sweep(now);

    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return { ok: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
    }

    existing.count += 1;

    if (existing.count > rule.limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    return { ok: true, remaining: rule.limit - existing.count, retryAfterSeconds: 0 };
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/** Un solo contenitore per processo, anche fra i ricaricamenti a caldo in sviluppo. */
const globalForRateLimit = globalThis as unknown as { rateLimitStore?: RateLimitStore };
export const rateLimitStore: RateLimitStore =
  globalForRateLimit.rateLimitStore ?? (globalForRateLimit.rateLimitStore = new MemoryStore());

export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitVerdict {
  return rateLimitStore.hit(key, rule, now);
}

/**
 * Chi sta chiamando. Dietro un proxy l'IP vero è il primo di
 * `x-forwarded-for`; gli altri sono i proxy attraversati e non vanno usati.
 * Quando non c'è nessun indizio si finisce tutti nello stesso secchio
 * "unknown": è severo, ma è l'unica scelta prudente.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Regole applicate dal middleware, con la possibilità di tararle da variabile
 * d'ambiente.
 *
 * Il valore per difetto è quello che vogliamo in produzione. L'override
 * esiste per due motivi concreti: tarare un limite sotto traffico reale senza
 * rilasciare codice, e non farsi bloccare dalle prove automatiche in locale —
 * dieci accessi in dieci minuti li esaurisce una sola sessione di test, e un
 * limite che ostacola lo sviluppo è un limite che qualcuno finisce per
 * rimuovere del tutto.
 */
function limite(nome: string, difetto: number): number {
  const raw = process.env[`RATE_LIMIT_${nome}`];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : difetto;
}

export const RATE_LIMITS = {
  /** Creazione prenotazione dal widget pubblico: severa, è il bersaglio più esposto. */
  publicBooking: { limit: limite("PUBLIC_BOOKING", 5), windowMs: 10 * 60_000 },
  /** Lettura disponibilità: generosa, il widget la interroga a ogni cambio di data. */
  publicAvailability: { limit: limite("PUBLIC_AVAILABILITY", 60), windowMs: 60_000 },
  /** Tentativi di accesso. */
  login: { limit: limite("LOGIN", 10), windowMs: 10 * 60_000 },
  /** Agente AI: ogni messaggio costa una chiamata a un modello. */
  agent: { limit: limite("AGENT", 30), windowMs: 60_000 },
  /** Caricamento immagini e documenti. */
  upload: { limit: limite("UPLOAD", 20), windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;
