/**
 * Parlare al centralino dal pannello di piattaforma.
 *
 * ## Perché questo verso esiste
 *
 * Perché i numeri **vivono nel centralino**: il trunk che li consegna, la
 * regola che manda una chiamata al cliente giusto, l'audio. Tavolo può dire
 * «questo numero è di questo locale» solo chiedendolo a chi lo riceve.
 *
 * Fino a ieri quel gesto si faceva aprendo il secondo gestionale. Adesso lo fa
 * il pannello di Tavolo, e il secondo gestionale resta per quello che sa fare
 * lui — le linee, i trunk, gli apparati — senza essere un posto dove passare
 * per far funzionare un cliente.
 *
 * ## Quando non è configurato, lo dice
 *
 * Se mancano l'indirizzo o le credenziali di servizio, `configurato()` è falso
 * e la schermata mostra la strada manuale invece di un pulsante che fallisce.
 * È la stessa regola dei canali di messaggio: **quello che non si può fare si
 * dice a parole, non con un pulsante spento**.
 *
 * ## Il token si tiene in memoria, non in tabella
 *
 * Vale poco e scade: in tabella sarebbe una credenziale in più da proteggere,
 * e su Vercel ogni funzione parte con la memoria sua — il costo di un accesso
 * in più è una richiesta, il costo di una credenziale salvata è per sempre.
 */

const SCADENZA_ANTICIPO_MS = 60_000;

type Sessione = { token: string; fino: number };
let sessione: Sessione | null = null;

function indirizzo(): string | null {
  const url = process.env.CENTRALINO_URL?.trim().replace(/\/+$/, "");
  if (!url) return null;
  /* Solo `https://`: qui viaggiano credenziali di servizio, e su `http://`
     viaggerebbero in chiaro. In sviluppo si passa da un indirizzo locale, che
     e l'unica eccezione. */
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) return null;
  return url;
}

export function configurato(): boolean {
  return (
    !!indirizzo() && !!process.env.CENTRALINO_UTENTE && !!process.env.CENTRALINO_PASSWORD
  );
}

export class CentralinoRemotoError extends Error {
  constructor(
    readonly codice: "non_configurato" | "accesso_negato" | "rifiutato" | "non_raggiungibile",
    message: string,
    readonly dettaglio?: string,
  ) {
    super(message);
    this.name = "CentralinoRemotoError";
  }
}

async function token(): Promise<string> {
  const base = indirizzo();
  if (!base || !configurato()) {
    throw new CentralinoRemotoError(
      "non_configurato",
      "Il collegamento al centralino non è configurato su questa installazione.",
    );
  }

  if (sessione && sessione.fino > Date.now()) return sessione.token;

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: process.env.CENTRALINO_UTENTE,
        password: process.env.CENTRALINO_PASSWORD,
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new CentralinoRemotoError(
      "non_raggiungibile",
      "Il centralino non risponde. Riprova fra poco.",
      err instanceof Error ? err.message : undefined,
    );
  }

  if (!res.ok) {
    throw new CentralinoRemotoError(
      "accesso_negato",
      "Il centralino ha rifiutato le nostre credenziali di servizio.",
      `${res.status}`,
    );
  }

  const dati = (await res.json().catch(() => null)) as
    | { accessToken?: string; expiresInSeconds?: number }
    | null;
  if (!dati?.accessToken) {
    throw new CentralinoRemotoError("accesso_negato", "Il centralino non ha dato un token.");
  }

  const durata = (dati.expiresInSeconds ?? 600) * 1000;
  sessione = { token: dati.accessToken, fino: Date.now() + Math.max(0, durata - SCADENZA_ANTICIPO_MS) };
  return sessione.token;
}

/** Butta la sessione: dopo un rifiuto non si ritenta con lo stesso token. */
export function scordaSessione() {
  sessione = null;
}

/**
 * Assegna un numero a un cliente del centralino.
 *
 * Il numero lo normalizza **il centralino**, che è quello che poi lo deve
 * riconoscere quando la chiamata arriva: normalizzarlo anche qui vorrebbe dire
 * due regole per la stessa cosa, e il giorno che divergono la telefonata
 * arriva a un cliente e il pannello ne mostra un altro.
 */
export async function assegnaNumero(
  tenant: string,
  numero: string,
  etichetta?: string,
): Promise<{ numero: string }> {
  const base = indirizzo()!;
  const t = await token();

  const res = await fetch(`${base}/api/v1/piattaforma/clienti/${encodeURIComponent(tenant)}/numeri`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ numero, ...(etichetta ? { etichetta } : {}) }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch((err) => {
    throw new CentralinoRemotoError(
      "non_raggiungibile",
      "Il centralino non risponde. Riprova fra poco.",
      err instanceof Error ? err.message : undefined,
    );
  });

  if (res.status === 401 || res.status === 404) {
    /* 404 dalle rotte di piattaforma vuol dire «non sei amministratore»: le
       rotte non raccontano la propria esistenza a chi non le puo usare. Quindi
       si butta la sessione e si dice quello che e vero — non «il cliente non
       esiste», che manderebbe a cercare la cosa sbagliata. */
    scordaSessione();
    throw new CentralinoRemotoError(
      "accesso_negato",
      "Il centralino non ci riconosce come amministratori. Controlla le credenziali di servizio.",
      `${res.status}`,
    );
  }

  if (!res.ok) {
    const corpo = (await res.json().catch(() => null)) as
      | { error?: { message?: string; remediation?: string } }
      | null;
    throw new CentralinoRemotoError(
      "rifiutato",
      corpo?.error?.message ?? "Il centralino ha rifiutato questo numero.",
      corpo?.error?.remediation,
    );
  }

  const dati = (await res.json().catch(() => null)) as { numero?: { e164?: string } } | null;
  return { numero: dati?.numero?.e164 ?? numero };
}
